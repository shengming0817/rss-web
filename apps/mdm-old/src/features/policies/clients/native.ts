import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import { authorization, reauthorizationEligibility } from './authorization'
import { jsonValue } from '../../../services/json'
import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  count,
  enumeration,
  identifier,
  nullable,
  record,
  string,
  uuid,
} from '../../../services/decode'

export type DeviceControlAction = Extract<
  wireSchemas.postApiV1DevicesByDeviceOperationsBody.Action,
  { kind: 'restart' | 'lock' | 'wipe' }
>
export function deviceControlAction(value: unknown): DeviceControlAction {
  if (!wireSchemas.postApiV1DevicesByDeviceOperationsBody.validateAction(value))
    throw new Error('Invalid action')

  const kind = value['kind']
  if (kind === 'restart') {
    return { kind }
  }
  const v = value
  const generation = count(v['expectedGeneration'])
  if (v['confirmed'] !== true || generation < 1)
    throw new Error('Explicit registration confirmation required')
  const confirmation = {
    confirmed: true as const,
    expectedRegistrationId: uuid(v['expectedRegistrationId']),
    expectedGeneration: generation,
  }
  if (v.kind === 'wipe') return { kind: v.kind, ...confirmation }
  const pin = string(v['pin'])
  if (!/^[0-9]{6}$/.test(pin)) throw new Error('Invalid lock PIN')
  return { kind: v.kind, ...confirmation, pin }
}
export function decodeNativeTask(value: unknown) {
  if (!wireSchemas.getApiV1DevicesByDeviceOperationsByIdResponse.validateTaskSummary(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    platform: v['platform'],
    kind: v['kind'],
    name: identifier(v['name']),
    objects: array(v['objects'], identifier),
  }
}
export function controlKind(task: ReturnType<typeof decodeNativeTask>) {
  if (task.platform === 'macos' && task.kind === 'command') {
    if (task.name === 'RestartDevice') return 'restart'
    if (task.name === 'DeviceLock') return 'lock'
    if (task.name === 'EraseDevice') return 'wipe'
  }
  if (task.platform === 'windows' && task.kind === 'sync_ml' && task.objects.length === 1) {
    if (task.objects[0] === './Device/Vendor/MSFT/Reboot/RebootNow') return 'restart'
    if (task.objects[0] === './Device/Vendor/MSFT/RemoteWipe/doWipe') return 'wipe'
  }
  return null
}
export function decodeNativeObservation(value: unknown) {
  if (!wireSchemas.getApiV1DevicesByDeviceOperationsByIdResponse.validateObservation(value))
    throw new Error('Invalid contract value')

  const raw = record(value),
    protocol = enumeration(raw['protocol'], ['syncml', 'mdm.apple'] as const),
    scope = enumeration(raw['observationScope'], [
      'native_objects',
      'native_command',
      'profile_presence',
      'declarations',
    ] as const)

  const v = protocol === 'syncml' ? value : scope === 'declarations' ? value : value
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
  if (!wireSchemas.getApiV1DevicesByDeviceOperationsByIdResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  if (uuid(v['operationId']) !== id || uuid(v['commandId']) !== id)
    throw new Error('Wrong operation')
  const target = v['target'],
    kind = target['kind']

  return {
    operationId: id,
    commandId: id,
    revision: count(v['revision']),
    task: decodeNativeTask(v['task']),
    target: kind === 'device' ? { kind } : { kind, userId: identifier(target['userId']) },
    inputVersion: identifier(v['inputVersion']),
    deadline: count(v['deadline']),
    dispatchFailure: nullable(v['dispatchFailure'], (v) => jsonValue(v, 16384)),
    authorization: authorization(v['authorization']),
    reauthorization: reauthorizationEligibility(v['reauthorization']),
    commandStatus: v['commandStatus'],
    agentInstallation: nullable(v['agentInstallation'], (v) => jsonValue(v, 65536)),
    observation: decodeNativeObservation(v['observation']),
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
    return (
      action === 'reauthorize'
        ? api.postApiV1DevicesByDeviceOperationsByIdReauthorize
        : api.postApiV1DevicesByDeviceOperationsByIdCancel
    )(transport, { pathParams: { device, id: operation }, body }, (value) => {
      const v = value
      if (uuid(v['operationId']) !== operation) throw new Error('Wrong operation receipt')
      return { operationId: operation, revision: count(v['revision']) }
    })
  }
  return {
    create: (
      device: string,
      body: { operationId: string; action: DeviceControlAction; deadline: number },
    ) =>
      api.postApiV1DevicesByDeviceOperations(
        transport,
        { pathParams: { device }, body: { ...body, action: deviceControlAction(body.action) } },
        (value) => {
          const v = value
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
            accepted: v['accepted'],
          }
        },
      ),
    read: (device: string, operation: string) =>
      api.getApiV1DevicesByDeviceOperationsById(
        transport,
        { pathParams: { device: device, id: operation } },
        (v) => decodeNativeOperation(v, operation),
      ),
    reauthorize: (device: string, operation: string, body: Reauthorization) =>
      change(device, operation, 'reauthorize', body),
    cancel: (device: string, operation: string, body: NativeChange) =>
      change(device, operation, 'cancel', body),
  }
}
