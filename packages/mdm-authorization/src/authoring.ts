import {
  devicePermissions,
  permissions,
  platformPermissions,
  keyPermissions,
  type Grant,
  type Rule,
  type Realm,
  type Source,
  type Subject,
  type User,
  type UserGroup,
  type KeyMetadata,
} from './model'
export function identifier(value: string): string {
  if (!value || new TextEncoder().encode(value).length > 1024 || /\p{Cc}/u.test(value))
    throw new Error('Invalid identifier')
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
export function revision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER)
    throw new Error('Invalid revision')
  return value
}
export function validateUser(user: User, tenant: string, instance?: string): void {
  uuid(user.instanceId)
  uuid(user.tenantId)
  uuid(user.principalId)
  if (user.tenantId !== tenant || (instance !== undefined && user.instanceId !== instance))
    throw new Error('Wrong user binding')
}
export function validateSource(source: Source): void {
  uuid(source.providerId)
  revision(source.configurationVersion)
  const url = new URL(source.issuer)
  if (
    !source.configurationVersion ||
    source.issuer.length > 2048 ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Invalid identity source')
}
export function validateSubject(subject: Subject, tenant: string, realm: Realm): void {
  if (realm === 'management' && subject.kind !== 'user')
    throw new Error('Management rules require a local user')
  if (subject.kind === 'user') validateUser(subject.user, tenant)
  else if (subject.kind === 'user_group') uuid(subject.id)
  else {
    validateSource(subject.source)
    identifier(subject.id)
    if (subject.kind === 'department' && !['exact', 'subtree'].includes(subject.matching))
      throw new Error('Invalid department matching')
  }
}
export function validateGrant(grant: Grant, realm: Realm): void {
  const operation = grant.operation
  if (!(permissions as readonly string[]).includes(operation)) throw new Error('Unknown permission')
  const device = (devicePermissions as readonly string[]).includes(operation)
  if (device === (grant.scope.kind === 'tenant')) throw new Error('Invalid permission scope')
  if (grant.scope.kind === 'device') identifier(grant.scope.id)
  if (
    realm === 'management'
      ? !(platformPermissions as readonly string[]).includes(operation) ||
        grant.scope.kind !== 'tenant'
      : operation.startsWith('tenant_')
  )
    throw new Error('Permission belongs to another realm')
}
function validateGrants(grants: readonly Grant[], realm: Realm): void {
  if (!grants.length || grants.length > 256) throw new Error('Invalid grant count')
  grants.forEach((g) => validateGrant(g, realm))
  const keys = grants.map(
    (g) => `${g.operation}:${g.scope.kind}:${g.scope.kind === 'device' ? g.scope.id : ''}`,
  )
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate grants')
}
export function validateRule(rule: Rule, tenant: string, realm: Realm): void {
  validateSubject(rule.subject, tenant, realm)
  validateGrants(rule.grants, realm)
}
export function validateGroup(group: UserGroup, tenant: string): void {
  identifier(group.name)
  if (typeof group.enabled !== 'boolean' || group.members.length > 10000)
    throw new Error('Invalid group')
  group.members.forEach((u) => validateUser(u, tenant, group.members[0]?.instanceId))
  if (new Set(group.members.map((u) => u.principalId)).size !== group.members.length)
    throw new Error('Duplicate members')
}
export function validateKey(metadata: KeyMetadata): void {
  identifier(metadata.name)
  validateGrants(metadata.grants, 'tenant')
  if (
    typeof metadata.enabled !== 'boolean' ||
    metadata.grants.some((g) => !keyPermissions.includes(g.operation))
  )
    throw new Error('Permission cannot be delegated to an API key')
  if (
    metadata.expiresAt !== null &&
    (!Number.isSafeInteger(metadata.expiresAt) || metadata.expiresAt <= 0)
  )
    throw new Error('Invalid expiry')
}
