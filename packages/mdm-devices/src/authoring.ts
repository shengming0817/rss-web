import type {
  Association,
  ConfirmAssociation,
  DeviceRef,
  Endpoint,
  DeviceMember,
  User,
} from './model'
export function deviceId(value: string): string {
  if (!value || value.trim() !== value || value.length > 256 || /\p{Cc}/u.test(value))
    throw new Error('Invalid endpoint identifier')
  return value
}
export function uuid(value: string): string {
  if (
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value) ||
    /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value)
  )
    throw new Error('Invalid identifier')
  return value
}
export function revision(value: number, zero = false): number {
  if (!Number.isSafeInteger(value) || value < (zero ? 0 : 1)) throw new Error('Invalid revision')
  return value
}
export function referenceKey(reference: DeviceRef): string {
  if (reference.kind === 'endpoint') deviceId(reference.id)
  else if (reference.kind === 'association') uuid(reference.id)
  else throw new Error('Invalid reference kind')
  return `${reference.kind}:${reference.id}`
}
export function verificationText(value: string): void {
  if (!value.trim() || new TextEncoder().encode(value).length > 2048 || /\p{Cc}/u.test(value))
    throw new Error('Invalid verification text')
}
export function validateUser(value: User, tenant: string): void {
  if (uuid(value.tenantId) !== tenant) throw new Error('Wrong personnel tenant')
  uuid(value.instanceId)
  uuid(value.principalId)
}
export function validateMember(member: DeviceMember): void {
  deviceId(member.device)
  if (member.channel !== 'mdm' && member.channel !== 'agent')
    throw new Error('Invalid member channel')
}
export function sameMember(a: DeviceMember, b: DeviceMember): boolean {
  return a.device === b.device && a.channel === b.channel
}
export function validateAssociation(value: Association): void {
  uuid(value.id)
  revision(value.version)
  if (
    value.members.length !== 2 ||
    new Set(value.members.map((m) => m.device)).size !== 2 ||
    new Set(value.members.map((m) => m.channel)).size !== 2
  )
    throw new Error('Invalid association members')
  value.members.forEach(validateMember)
}
export function validateConfirmation(change: ConfirmAssociation): void {
  uuid(change.operationId)
  if (change.associationId === null) {
    if (change.expectedVersion !== 0) throw new Error('Invalid create version')
  } else {
    uuid(change.associationId)
    revision(change.expectedVersion)
  }
  validateMember(change.mdm)
  validateMember(change.agent)
  if (
    change.mdm.channel !== 'mdm' ||
    change.agent.channel !== 'agent' ||
    change.mdm.device === change.agent.device
  )
    throw new Error('Invalid association channels')
  verificationText(change.evidence)
}
/** The backend atomically revalidates the selected device and its channel authority. */
export function currentMember(endpoint: Endpoint, channel: DeviceMember['channel']): DeviceMember {
  if (endpoint.channel !== channel || endpoint.status !== 'active')
    throw new Error('No active device on this channel')
  const member = { device: endpoint.id, channel }
  validateMember(member)
  return Object.freeze(member)
}
