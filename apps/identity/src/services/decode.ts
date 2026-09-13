/** Closed browser projections; none of these values constitute server authorization. */
export function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !== [...keys].sort().join()
  )
    throw new Error('Invalid response')
  return value as Record<string, unknown>
}
export function text(value: unknown, max = 2048): string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    [...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    throw new Error('Invalid response')
  return value
}
export function uuid(value: unknown): string {
  const v = text(value, 36)
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v) ||
    v === '00000000-0000-0000-0000-000000000000'
  )
    throw new Error('Invalid identifier')
  return v
}
export function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid response')
  return value
}
export function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Invalid response')
  return value
}
export function list<T>(value: unknown, decode: (v: unknown) => T, max = 100): T[] {
  if (!Array.isArray(value) || value.length > max) throw new Error('Invalid response')
  return value.map(decode)
}
export interface Session {
  id: string
  auth_time: number
  idle_expires_at: number
  absolute_expires_at: number
}
export interface Identity {
  principal_id: string
  administrator: boolean
  platform_administrator: boolean
  has_local_password: boolean
}
export interface SessionResponse {
  session: Session
  identity: Identity
  csrf_token: string
}
export function session(value: unknown): Session {
  const v = object(value, ['id', 'auth_time', 'idle_expires_at', 'absolute_expires_at'])
  const result = {
    id: uuid(v['id']),
    auth_time: number(v['auth_time']),
    idle_expires_at: number(v['idle_expires_at']),
    absolute_expires_at: number(v['absolute_expires_at']),
  }
  if (
    result.auth_time >= result.idle_expires_at ||
    result.idle_expires_at > result.absolute_expires_at
  )
    throw new Error('Invalid expiry')
  return result
}
export function sessionResponse(value: unknown): SessionResponse {
  const v = object(value, ['session', 'identity', 'csrf_token'])
  const token = text(v['csrf_token'], 128)
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error('Invalid CSRF')
  return {
    session: session(v['session']),
    identity: identity(v['identity']),
    csrf_token: token,
  }
}

export function identity(value: unknown): Identity {
  const i = object(value, [
    'principal_id',
    'administrator',
    'platform_administrator',
    'has_local_password',
  ])
  return {
    principal_id: uuid(i['principal_id']),
    administrator: bool(i['administrator']),
    platform_administrator: bool(i['platform_administrator']),
    has_local_password: bool(i['has_local_password']),
  }
}

export interface SessionSecurity {
  session_id: string
  authentication: { auth_time: number; acr: 'unspecified' | 'mfa'; amr: ('mfa' | 'otp' | 'pwd')[] }
  eligible_step_up_providers: { provider_id: string; label: string }[]
}
export function sessionSecurity(value: unknown): SessionSecurity {
  const v = object(value, ['session_id', 'authentication', 'eligible_step_up_providers'])
  const a = object(v['authentication'], ['auth_time', 'acr', 'amr'])
  if (a['acr'] !== 'unspecified' && a['acr'] !== 'mfa') throw new Error('Invalid assurance')
  const authTime = number(a['auth_time'])
  if (!authTime) throw new Error('Invalid authentication time')
  const methods = list(
    a['amr'],
    (v): 'mfa' | 'otp' | 'pwd' => {
      if (v !== 'mfa' && v !== 'otp' && v !== 'pwd') throw new Error('Invalid method')
      return v
    },
    3,
  )
  if (methods.some((v, i) => i > 0 && methods[i - 1]! >= v)) throw new Error('Invalid methods')
  const providers = list(v['eligible_step_up_providers'], (v) => {
    const p = object(v, ['provider_id', 'label'])
    return { provider_id: uuid(p['provider_id']), label: text(p['label'], 4096) }
  })
  if (providers.some((v, i) => i > 0 && providers[i - 1]!.provider_id >= v.provider_id))
    throw new Error('Invalid providers')
  return {
    session_id: uuid(v['session_id']),
    authentication: { auth_time: authTime, acr: a['acr'], amr: methods },
    eligible_step_up_providers: providers,
  }
}

export interface Tenant {
  tenant_id: string
  name: string
  initial_principal_id: string
}
export function tenant(value: unknown): Tenant {
  const v = object(value, ['tenant_id', 'name', 'initial_principal_id'])
  return {
    tenant_id: uuid(v['tenant_id']),
    name: text(v['name'], 128),
    initial_principal_id: uuid(v['initial_principal_id']),
  }
}
export interface OperationReply {
  operation: {
    operation_id: string
    kind: 'tenant_created'
    tenant_id: string
    principal_id: string
    created_at: number
  }
  active: boolean
}
export function operationReply(value: unknown, status: number): OperationReply {
  const v = object(value, ['operation', 'active'])
  const o = object(v['operation'], [
    'operation_id',
    'kind',
    'tenant_id',
    'principal_id',
    'created_at',
  ])
  const active = bool(v['active'])
  if (
    o['kind'] !== 'tenant_created' ||
    (status !== 200 && status !== 201 && status !== 202) ||
    (status === 201 && !active) ||
    (status === 202 && active)
  )
    throw new Error('Invalid operation')
  return {
    operation: {
      operation_id: uuid(o['operation_id']),
      kind: 'tenant_created',
      tenant_id: uuid(o['tenant_id']),
      principal_id: uuid(o['principal_id']),
      created_at: number(o['created_at']),
    },
    active,
  }
}
export interface Account {
  principal_id: string
  login: string | null
  enabled: boolean
  administrator: boolean
  emergency: boolean
  member_active: boolean
  has_local_password: boolean
}
export function account(value: unknown): Account {
  const v = object(value, [
    'principal_id',
    'login',
    'enabled',
    'administrator',
    'emergency',
    'member_active',
    'has_local_password',
  ])
  return {
    principal_id: uuid(v['principal_id']),
    login: v['login'] === null ? null : text(v['login'], 128),
    enabled: bool(v['enabled']),
    administrator: bool(v['administrator']),
    emergency: bool(v['emergency']),
    member_active: bool(v['member_active']),
    has_local_password: bool(v['has_local_password']),
  }
}

/** The list endpoint has a distinct wire projection; platform roles are not tenant account authority. */
export function accountListEntry(value: unknown): Account {
  const v = object(value, [
    'principal_id',
    'login',
    'enabled',
    'administrator',
    'emergency',
    'member_active',
    'has_local_password',
    'platform_administrator',
  ])
  const { platform_administrator, ...entry } = v
  bool(platform_administrator)
  return account(entry)
}
export interface ProviderSettings {
  issuer: string
  client_id: string
  redirect_uri: string
  scopes: string[]
  claims: { email: string | null; groups: string | null }
  jit: boolean
}
export interface Provider {
  id: string
  version: number
  revocation_epoch: number
  credential_version: number
  enabled: boolean
  settings: ProviderSettings
}
export function settings(value: unknown): ProviderSettings {
  const v = object(value, ['issuer', 'client_id', 'redirect_uri', 'scopes', 'claims', 'jit'])
  const c = object(v['claims'], ['email', 'groups'])
  return {
    issuer: text(v['issuer']),
    client_id: text(v['client_id'], 256),
    redirect_uri: text(v['redirect_uri']),
    scopes: list(v['scopes'], (v) => text(v, 128), 16),
    claims: {
      email: c['email'] === null ? null : text(c['email'], 128),
      groups: c['groups'] === null ? null : text(c['groups'], 128),
    },
    jit: bool(v['jit']),
  }
}
export function provider(value: unknown): Provider {
  const v = object(value, [
    'id',
    'version',
    'revocation_epoch',
    'credential_version',
    'enabled',
    'settings',
  ])
  const version = number(v['version'])
  const epoch = number(v['revocation_epoch'])
  const credentialVersion = number(v['credential_version'])
  if (!version || !epoch || !credentialVersion) throw new Error('Invalid version')
  return {
    id: uuid(v['id']),
    version,
    revocation_epoch: epoch,
    credential_version: credentialVersion,
    enabled: bool(v['enabled']),
    settings: settings(v['settings']),
  }
}
export function redirect(value: unknown, key: 'redirect_to' | 'authorization_url'): string {
  const v = text(object(value, [key])[key], 8192)
  const u = new URL(v)
  if (u.protocol !== 'https:' || u.username || u.password) throw new Error('Invalid redirect')
  return v
}
export interface Flow {
  tenant_id: string
  grant_id: string
}
export function flow(value: unknown): Flow {
  const v = object(value, ['tenant_id', 'grant_id'])
  return { tenant_id: uuid(v['tenant_id']), grant_id: uuid(v['grant_id']) }
}
