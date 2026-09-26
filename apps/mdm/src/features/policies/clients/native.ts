import type { HttpTransport } from '@rss/api/mdm'
import {
  boolean,
  closed,
  count,
  enumeration,
  identifier,
  integer,
  nullable,
  record,
  string,
  uuid,
} from '../../../services/decode'
export type NativeTask =
  | { kind: 'profile_install'; enabled: boolean }
  | { kind: 'profile_remove'; profile: string }
  | { kind: 'state_verify'; field: 'model' | 'os_version'; expectedValue: string }
export type FrozenNativeTask =
  | NativeTask
  | {
      kind: 'firewall'
      enabled: boolean
      plan: string
      policy: string
      version: number
      osVersion: string
      edition: number
    }
function task(value: unknown): FrozenNativeTask {
  const kind = enumeration(record(value)['kind'], [
    'profile_install',
    'profile_remove',
    'state_verify',
    'firewall',
  ] as const)
  if (kind === 'profile_install') {
    const v = closed(value, ['kind', 'enabled'])
    return { kind, enabled: boolean(v['enabled']) }
  }
  if (kind === 'profile_remove') {
    const v = closed(value, ['kind', 'profile'])
    return { kind, profile: uuid(v['profile']) }
  }
  if (kind === 'state_verify') {
    const v = closed(value, ['kind', 'field', 'expectedValue'])
    return {
      kind,
      field: enumeration(v['field'], ['model', 'os_version'] as const),
      expectedValue: string(v['expectedValue']),
    }
  }
  const v = closed(value, ['kind', 'enabled', 'plan', 'policy', 'version', 'osVersion', 'edition'])
  return {
    kind,
    enabled: boolean(v['enabled']),
    plan: uuid(v['plan']),
    policy: identifier(v['policy']),
    version: count(v['version']),
    osVersion: string(v['osVersion']),
    edition: count(v['edition']),
  }
}
function observation(value: unknown) {
  const protocol = enumeration(record(value)['protocol'], ['mdm.apple', 'mdm.windows'] as const)
  const base = ['protocol', 'result', 'effect', 'progress']
  const v =
    protocol === 'mdm.apple'
      ? closed(value, [...base, 'observationScope'], ['nativeStatus', 'receivedAt'])
      : closed(
          value,
          [...base, 'receiptAccepted', 'writeStatus'],
          [
            'attemptId',
            'attempt',
            'nativeStatus',
            'value',
            'quality',
            'receivedAt',
            'cleanup',
            'observationScope',
          ],
        )
  const common = {
    protocol,
    result: enumeration(v['result'], ['unknown', 'matched', 'mismatched'] as const),
    effect: enumeration(v['effect'], ['unknown', 'verified_present'] as const),
    progress: enumeration(v['progress'], ['succeeded', 'failed', 'unknown'] as const),
  }
  if (protocol === 'mdm.apple')
    return {
      ...common,
      protocol,
      observationScope: enumeration(v['observationScope'], ['profile_presence'] as const),
      ...('nativeStatus' in v ? { nativeStatus: nullable(v['nativeStatus'], string) } : {}),
      ...('receivedAt' in v ? { receivedAt: nullable(v['receivedAt'], count) } : {}),
    }
  return {
    ...common,
    protocol,
    receiptAccepted: boolean(v['receiptAccepted']),
    writeStatus: nullable(v['writeStatus'], integer),
    ...('attemptId' in v ? { attemptId: uuid(v['attemptId']) } : {}),
    ...('attempt' in v ? { attempt: count(v['attempt']) } : {}),
    ...('nativeStatus' in v ? { nativeStatus: nullable(v['nativeStatus'], integer) } : {}),
    ...('value' in v ? { value: nullable(v['value'], string) } : {}),
    ...('quality' in v
      ? {
          quality: enumeration(v['quality'], [
            'success',
            'unsupported',
            'failed',
            'missing',
            'pending',
          ] as const),
        }
      : {}),
    ...('receivedAt' in v ? { receivedAt: nullable(v['receivedAt'], count) } : {}),
    ...('cleanup' in v ? { cleanup: enumeration(v['cleanup'], ['unsupported'] as const) } : {}),
    ...('observationScope' in v
      ? { observationScope: enumeration(v['observationScope'], ['device_firewall'] as const) }
      : {}),
  }
}
export function decodeNativeOperation(value: unknown, id: string) {
  const v = closed(value, [
    'operationId',
    'commandId',
    'revision',
    'task',
    'deadline',
    'authorization',
    'commandStatus',
    'observation',
  ])
  if (uuid(v['operationId']) !== id || uuid(v['commandId']) !== id)
    throw new Error('Wrong operation')
  return {
    operationId: id,
    commandId: id,
    revision: count(v['revision']),
    task: task(v['task']),
    deadline: count(v['deadline']),
    authorization: enumeration(v['authorization'], ['approved', 'blocked'] as const),
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
    observation: observation(v['observation']),
  }
}
export type NativeOperation = ReturnType<typeof decodeNativeOperation>
export interface NativeChange {
  requestId: string
  expectedRevision: number
}
export function createNativeClient(transport: HttpTransport) {
  function change(
    device: string,
    operation: string,
    action: 'approve' | 'cancel',
    body: NativeChange,
  ) {
    return transport.request({
      method: 'POST',
      path: `/api/v2/devices/{device}/operations/{operation}/${action}`,
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
    create: (device: string, body: { operationId: string; task: NativeTask; deadline: number }) =>
      transport.request({
        method: 'POST',
        path: '/api/v2/devices/{device}/operations',
        pathParams: { device },
        body,
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
            accepted: true as const,
          }
        },
      }),
    read: (device: string, operation: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v2/devices/{device}/operations/{operation}',
        pathParams: { device, operation },
        successStatus: 200,
        decode: (v) => decodeNativeOperation(v, operation),
      }),
    approve: (device: string, operation: string, body: NativeChange) =>
      change(device, operation, 'approve', body),
    cancel: (device: string, operation: string, body: NativeChange) =>
      change(device, operation, 'cancel', body),
  }
}
