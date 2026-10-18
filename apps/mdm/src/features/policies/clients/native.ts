import type { HttpTransport } from '@rss/api/mdm'
import {
  boolean,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  record,
  string,
  uuid,
} from '../../../services/decode'
import { jsonValue } from './resources'
export type DeviceControlAction =
  | { kind: 'restart' }
  | {
      kind: 'lock'
      confirmed: true
      expectedRegistrationId: string
      expectedGeneration: number
      pin: string
    }
  | { kind: 'wipe'; confirmed: true; expectedRegistrationId: string; expectedGeneration: number }
export function deviceControlAction(value: unknown): DeviceControlAction {
  const kind = enumeration(record(value)['kind'], ['restart', 'lock', 'wipe'] as const)
  if (kind === 'restart') {
    closed(value, ['kind'])
    return { kind }
  }
  const v = closed(value, [
    'kind',
    'confirmed',
    'expectedRegistrationId',
    'expectedGeneration',
    ...(kind === 'lock' ? ['pin'] : []),
  ])
  const generation = count(v['expectedGeneration'])
  if (v['confirmed'] !== true || generation < 1)
    throw new Error('Explicit registration confirmation required')
  const confirmation = {
    confirmed: true as const,
    expectedRegistrationId: uuid(v['expectedRegistrationId']),
    expectedGeneration: generation,
  }
  if (kind === 'wipe') return { kind, ...confirmation }
  const pin = string(v['pin'])
  if (!/^[0-9]{6}$/.test(pin)) throw new Error('Invalid lock PIN')
  return { kind, ...confirmation, pin }
}
export function decodeNativeTask(value: unknown) {
  const v = closed(value, ['platform', 'request'])
  return {
    platform: enumeration(v['platform'], ['windows', 'macos'] as const),
    request: record(jsonValue(v['request'], 1024 * 1024)),
  }
}
function observation(value: unknown) {
  const raw = record(value),
    protocol = enumeration(raw['protocol'], ['syncml', 'mdm.apple'] as const),
    scope = enumeration(raw['observationScope'], [
      'native_objects',
      'native_command',
      'profile_presence',
      'declarations',
    ] as const)
  const base = ['protocol', 'observationScope', 'progress', 'effect']
  const v =
    protocol === 'syncml'
      ? closed(value, [...base, 'receipts'], ['effectReason'])
      : scope === 'declarations'
        ? closed(
            value,
            [...base, 'synchronization', 'compliance'],
            ['inputVersion', 'expected', 'nativeStatus', 'receivedAt'],
          )
        : closed(
            value,
            [...base, 'receipts'],
            ['result', 'fields', 'error', 'nativeStatus', 'receivedAt'],
          )
  if ((protocol === 'syncml') !== (scope === 'native_objects'))
    throw new Error('Wrong native protocol')
  return {
    ...record(jsonValue(v, 1024 * 1024)),
    protocol,
    observationScope: scope,
    progress: string(v['progress']),
    effect: string(v['effect']),
  }
}
export function decodeNativeOperation(value: unknown, id: string) {
  const v = closed(value, [
    'operationId',
    'commandId',
    'revision',
    'task',
    'target',
    'inputVersion',
    'deadline',
    'dispatchFailure',
    'authorization',
    'commandStatus',
    'agentInstallation',
    'observation',
  ])
  if (uuid(v['operationId']) !== id || uuid(v['commandId']) !== id)
    throw new Error('Wrong operation')
  const target = record(v['target']),
    kind = enumeration(target['kind'], ['device', 'user'] as const)
  closed(target, kind === 'device' ? ['kind'] : ['kind', 'userId'])
  return {
    operationId: id,
    commandId: id,
    revision: count(v['revision']),
    task: decodeNativeTask(v['task']),
    target: kind === 'device' ? { kind } : { kind, userId: identifier(target['userId']) },
    inputVersion: identifier(v['inputVersion']),
    deadline: count(v['deadline']),
    dispatchFailure: nullable(v['dispatchFailure'], (v) => jsonValue(v, 16384)),
    authorization: enumeration(v['authorization'], ['authorized', 'blocked'] as const),
    commandStatus: enumeration(v['commandStatus'], [
      'queued',
      'published',
      'received',
      'applied',
      'rejected',
      'timed_out',
      'superseded',
      'cancelled',
    ] as const),
    agentInstallation: nullable(v['agentInstallation'], (v) => jsonValue(v, 65536)),
    observation: observation(v['observation']),
  }
}
export type NativeOperation = ReturnType<typeof decodeNativeOperation>
export interface NativeChange {
  requestId: string
  expectedRevision: number
}
export interface Reauthorization extends NativeChange {
  confirmation?: { confirmed: true; expectedRegistrationId: string; expectedGeneration: number }
}
export function createNativeClient(transport: HttpTransport) {
  function change(
    device: string,
    operation: string,
    action: 'reauthorize' | 'cancel',
    body: NativeChange | Reauthorization,
  ) {
    return transport.request({
      method: 'POST',
      path: `/api/v1/devices/{device}/operations/{operation}/${action}`,
      pathParams: { device, operation },
      body,
      successStatus: 200,
      decode(value) {
        const v = closed(value, ['operationId', 'revision'])
        if (uuid(v['operationId']) !== operation) throw new Error('Wrong operation receipt')
        return { operationId: operation, revision: count(v['revision']) }
      },
    })
  }
  return {
    create: (
      device: string,
      body: { operationId: string; action: DeviceControlAction; deadline: number },
    ) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/devices/{device}/operations',
        pathParams: { device },
        body: { ...body, action: deviceControlAction(body.action) },
        successStatus: 202,
        decode(value) {
          const v = closed(value, ['operationId', 'commandId', 'revision', 'accepted'])
          if (
            uuid(v['operationId']) !== body.operationId ||
            uuid(v['commandId']) !== body.operationId ||
            v['accepted'] !== true
          )
            throw new Error('Wrong native admission')
          return {
            operationId: body.operationId,
            commandId: body.operationId,
            revision: count(v['revision']),
            accepted: boolean(v['accepted']),
          }
        },
      }),
    read: (device: string, operation: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/devices/{device}/operations/{operation}',
        pathParams: { device, operation },
        successStatus: 200,
        decode: (v) => decodeNativeOperation(v, operation),
      }),
    reauthorize: (device: string, operation: string, body: Reauthorization) =>
      change(device, operation, 'reauthorize', body),
    cancel: (device: string, operation: string, body: NativeChange) =>
      change(device, operation, 'cancel', body),
  }
}
