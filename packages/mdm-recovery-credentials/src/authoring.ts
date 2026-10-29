import { identifier, revision, uuid } from '@rss/mdm-inventory'
import {
  actionKinds,
  type Subject,
  type Material,
  type MaterialRef,
  type Registration,
  type OperationIntent,
  type Action,
  type FileVaultConfiguration,
} from './model'
export function positive(value: number): number {
  if (!revision(value)) throw new Error('Positive credential revision required')
  return value
}
export function validateRegistration(value: Registration): void {
  uuid(value.registration)
  positive(value.generation)
}
export function validateReference(value: MaterialRef): void {
  identifier(value.device, 256)
  uuid(value.id)
  positive(value.version)
}
export function validateSubject(value: Subject): void {
  if (value.kind === 'rss_login') {
    uuid(value.binding)
    positive(value.bindingGeneration)
    identifier(value.sid)
  } else if (value.kind === 'bitlocker') {
    identifier(value.volume)
    uuid(value.protector)
  } else if (value.kind === 'local_administrator') identifier(value.sid)
  else if (value.kind === 'filevault') {
    uuid(value.custody)
    positive(value.epoch)
  } else if (value.kind === 'lock_pin') uuid(value.operation)
  else if (value.kind !== 'recovery_lock')
    throw new Error('Unsupported recovery credential subject')
}
export function validateMaterial(value: Material, expected?: MaterialRef): void {
  uuid(value.id)
  positive(value.version)
  identifier(value.binding.device, 256)
  validateRegistration(value.binding)
  validateSubject(value.binding.subject)
  uuid(value.operation)
  if (
    !['unverified', 'verified', 'unknown', 'superseded', 'revoked'].includes(value.validity) ||
    typeof value.current !== 'boolean' ||
    typeof value.escrowed !== 'boolean'
  )
    throw new Error('Invalid recovery credential state')
  if (
    !Number.isSafeInteger(value.createdAt) ||
    (value.invalidatedAt !== null && !Number.isSafeInteger(value.invalidatedAt))
  )
    throw new Error('Invalid material time')
  if (
    expected &&
    (value.id !== expected.id ||
      value.version !== expected.version ||
      value.binding.device !== expected.device)
  )
    throw new Error('Wrong exact recovery material')
}
export function validateConfiguration(value: FileVaultConfiguration): void {
  revision(value.revision)
  revision(value.materialRevision)
  revision(value.custodyEpoch)
  if (value.custodyId !== null) uuid(value.custodyId)
  if (value.recipientId !== null) identifier(value.recipientId)
  if (
    value.recipientCertificate !== null &&
    (typeof value.recipientCertificate !== 'string' ||
      !value.recipientCertificate ||
      value.recipientCertificate.length > 65536)
  )
    throw new Error('Invalid FileVault public recipient')
  if (
    (value.custodyId === null) !== (value.custodyEpoch === 0) ||
    (value.enabled && (!value.custodyId || !value.recipientId || !value.recipientCertificate))
  )
    throw new Error('Wrong collection custody state')
}
export function reference(value: Material): MaterialRef {
  return { device: value.binding.device, id: value.id, version: value.version }
}
export function readable(value: Material): boolean {
  return value.escrowed && !['superseded', 'revoked'].includes(value.validity)
}
export function revokePermission(
  value: Subject,
): 'account_write' | 'device_control' | 'security_operate' {
  validateSubject(value)
  return value.kind === 'rss_login' || value.kind === 'local_administrator'
    ? 'account_write'
    : value.kind === 'lock_pin'
      ? 'device_control'
      : 'security_operate'
}
function version(value: { readonly id: string; readonly version: number }): void {
  uuid(value.id)
  positive(value.version)
}
export function validateAction(value: Action): void {
  if (!actionKinds.includes(value.kind)) throw new Error('Unsupported credential operation')
  if ('expectedRevision' in value) revision(value.expectedRevision)
  if ('material' in value) version(value.material)
  if ('recipient' in value && value.recipient !== null) identifier(value.recipient, 1024)
  if (value.kind === 'set_recovery_lock') {
    if (value.current !== null) version(value.current)
    if (typeof value.clear !== 'boolean' || (value.clear && value.current === null))
      throw new Error('Clearing recovery lock requires the exact current material')
  }
  if (value.kind === 'reconcile_recovery_lock') uuid(value.operation)
}
export function validateIntent(input: OperationIntent): void {
  identifier(input.device, 256)
  uuid(input.operationId)
  validateRegistration(input)
  if (!Number.isSafeInteger(input.deadline) || input.deadline < 1)
    throw new Error('Invalid original credential deadline')
  validateAction(input.action)
}
/** Build only the authored non-secret fields; never retain a caller-supplied password key. */
export function actionIntent(input: Action): Action {
  validateAction(input)
  const material = (value: { readonly id: string; readonly version: number }) => ({
    id: value.id,
    version: value.version,
  })
  switch (input.kind) {
    case 'configure_filevault':
      return { kind: input.kind }
    case 'collect_filevault':
      return {
        kind: input.kind,
        expectedRevision: input.expectedRevision,
        recipient: input.recipient,
      }
    case 'rotate_filevault':
      return { kind: input.kind, expectedRevision: input.expectedRevision }
    case 'reconcile_filevault':
      return { kind: input.kind, material: material(input.material), recipient: input.recipient }
    case 'set_recovery_lock':
      return {
        kind: input.kind,
        expectedRevision: input.expectedRevision,
        current: input.current && material(input.current),
        clear: input.clear,
      }
    case 'reconcile_recovery_lock':
      return { kind: input.kind, material: material(input.material), operation: input.operation }
    case 'verify_recovery_lock':
      return { kind: input.kind, material: material(input.material) }
  }
}
