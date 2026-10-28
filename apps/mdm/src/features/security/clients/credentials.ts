import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import { queryParameters, windowPage, type DirectoryQuery } from '../../../services/directory-query'
import type { HttpTransport } from '@rss/api/mdm'
import { count, identifier, integer, nullable, uuid } from '../../../services/decode'
export const appleCredentialActions = [
  'configure_filevault',
  'collect_filevault',
  'rotate_filevault',
  'reconcile_filevault',
  'set_recovery_lock',
  'reconcile_recovery_lock',
  'verify_recovery_lock',
] as const
export type AppleAction = (typeof appleCredentialActions)[number]
export function subject(value: unknown) {
  if (!wireSchemas.getApiV1DevicesByDeviceRecoveryCredentialsResponse.validateSubject(value))
    throw new Error('Invalid contract value')

  const kind = value['kind']
  if (kind === 'filevault' || kind === 'recovery_lock') {
    return { kind }
  }
  if (kind === 'bitlocker') {
    const v = value
    return { kind, volume: identifier(v['volume']), protector: uuid(v['protector']) }
  }
  if (kind === 'lock_pin') {
    const v = value
    return { kind, operation: uuid(v['operation']) }
  }
  if (kind === 'rss_login') {
    const v = value
    return {
      kind,
      binding: uuid(v['binding']),
      bindingGeneration: count(v['bindingGeneration']),
      sid: identifier(v['sid']),
    }
  }
  const v = value
  return { kind, sid: identifier(v['sid']) }
}
export function material(value: unknown, device: string) {
  if (
    !wireSchemas.postApiV1DevicesByDeviceRecoveryCredentialsByIdVersionsByVersionRevokeResponse.validateRoot(
      value,
    )
  )
    throw new Error('Invalid contract value')

  const v = value,
    binding = v['binding']
  if (binding['device'] !== device || !count(binding['generation']) || !count(v['version']))
    throw new Error('Wrong material binding')
  return {
    id: uuid(v['id']),
    binding: {
      device,
      registration: uuid(binding['registration']),
      generation: count(binding['generation']),
      subject: subject(binding['subject']),
    },
    version: count(v['version']),
    current: v['current'],
    validity: v['validity'],
    escrowed: v['escrowed'],
    operation: uuid(v['operation']),
    createdAt: integer(v['createdAt']),
    invalidatedAt: nullable(v['invalidatedAt'], integer),
  }
}
function disclosure(value: unknown) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('\0') ||
    new TextEncoder().encode(value).byteLength > 4096
  )
    throw new Error('Invalid secret')
  return value
}
export type Material = ReturnType<typeof material>
export type CredentialInput = Omit<
  Parameters<typeof api.postApiV1DevicesByDeviceRecoveryCredentialsOperations>[1]['body'],
  'operationId'
>
export function createCredentialsClient(transport: HttpTransport) {
  function versionPath(device: string, entry: Material) {
    return { device: identifier(device), id: entry.id, version: entry.version }
  }
  return {
    list: (device: string, query: DirectoryQuery = {}) =>
      api.getApiV1DevicesByDeviceRecoveryCredentials(
        transport,
        { pathParams: { device }, query: queryParameters({ limit: 100, ...query }) },
        (v) => windowPage(v, (x) => material(x, device)),
      ),
    reveal: (device: string, entry: Material) =>
      api.getApiV1DevicesByDeviceRecoveryCredentialsByIdVersionsByVersionSecret(
        transport,
        { pathParams: versionPath(device, entry) },
        (value) => {
          const v = value,
            result = material(v['material'], device)
          if (result.id !== entry.id || result.version !== entry.version)
            throw new Error('Wrong disclosed version')
          return { material: result, secret: disclosure(v['secret']) }
        },
      ),
    revoke: (device: string, entry: Material) =>
      api.postApiV1DevicesByDeviceRecoveryCredentialsByIdVersionsByVersionRevoke(
        transport,
        { pathParams: versionPath(device, entry) },
        (v) => {
          const result = material(v, device)
          if (
            result.id !== entry.id ||
            result.version !== entry.version ||
            result.validity !== 'revoked'
          )
            throw new Error('Wrong revoked version')
          return result
        },
      ),
    create: (device: string, operationId: string, input: CredentialInput) =>
      api.postApiV1DevicesByDeviceRecoveryCredentialsOperations(
        transport,
        { pathParams: { device }, body: { operationId, ...input } },
        (value) => {
          const v = value
          if (
            v['operationId'] !== operationId ||
            v['commandId'] !== operationId ||
            v['accepted'] !== true
          )
            throw new Error('Wrong credential receipt')
          return { operationId: uuid(v['operationId']), revision: count(v['revision']) }
        },
      ),
  }
}
