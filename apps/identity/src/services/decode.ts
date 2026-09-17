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
  authTime: number
  idleExpiresAt: number
  absoluteExpiresAt: number
}
export interface Identity {
  principalId: string
  hasLocalPassword: boolean
}
export interface SessionResponse {
  session: Session
  identity: Identity
  csrfToken: string
}
export function session(value: unknown): Session {
  const v = object(value, ['id', 'authTime', 'idleExpiresAt', 'absoluteExpiresAt'])
  const result = {
    id: uuid(v['id']),
    authTime: number(v['authTime']),
    idleExpiresAt: number(v['idleExpiresAt']),
    absoluteExpiresAt: number(v['absoluteExpiresAt']),
  }
  if (result.authTime >= result.idleExpiresAt || result.idleExpiresAt > result.absoluteExpiresAt)
    throw new Error('Invalid expiry')
  return result
}
export function sessionResponse(value: unknown): SessionResponse {
  const v = object(value, ['session', 'identity', 'csrfToken'])
  const token = text(v['csrfToken'], 128)
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error('Invalid CSRF')
  return {
    session: session(v['session']),
    identity: identity(v['identity']),
    csrfToken: token,
  }
}

export function identity(value: unknown): Identity {
  const i = object(value, ['principalId', 'hasLocalPassword'])
  return {
    principalId: uuid(i['principalId']),
    hasLocalPassword: bool(i['hasLocalPassword']),
  }
}

export interface SessionSecurity {
  sessionId: string
  authentication: {
    authTime: number | null
    acr: 'unspecified' | 'mfa'
    amr: ('mfa' | 'otp' | 'pwd')[]
  }
  eligibleStepUpProviders: { providerId: string; label: string }[]
}
export function sessionSecurity(value: unknown): SessionSecurity {
  const v = object(value, ['sessionId', 'authentication', 'eligibleStepUpProviders'])
  const a = object(v['authentication'], ['authTime', 'acr', 'amr'])
  if (a['acr'] !== 'unspecified' && a['acr'] !== 'mfa') throw new Error('Invalid assurance')
  const authTime = a['authTime'] === null ? null : number(a['authTime'])
  if (authTime === 0) throw new Error('Invalid authentication time')
  const methods = list(
    a['amr'],
    (v): 'mfa' | 'otp' | 'pwd' => {
      if (v !== 'mfa' && v !== 'otp' && v !== 'pwd') throw new Error('Invalid method')
      return v
    },
    3,
  )
  if (methods.some((v, i) => i > 0 && methods[i - 1]! >= v)) throw new Error('Invalid methods')
  const providers = list(v['eligibleStepUpProviders'], (v) => {
    const p = object(v, ['providerId', 'label'])
    return { providerId: uuid(p['providerId']), label: text(p['label'], 4096) }
  })
  if (providers.some((v, i) => i > 0 && providers[i - 1]!.providerId >= v.providerId))
    throw new Error('Invalid providers')
  return {
    sessionId: uuid(v['sessionId']),
    authentication: { authTime: authTime, acr: a['acr'], amr: methods },
    eligibleStepUpProviders: providers,
  }
}

export interface Account {
  principalId: string
  login: string | null
  enabled: boolean
  memberActive: boolean
  hasLocalPassword: boolean
}
export function account(value: unknown): Account {
  const v = object(value, ['principalId', 'login', 'enabled', 'memberActive', 'hasLocalPassword'])
  return {
    principalId: uuid(v['principalId']),
    login: v['login'] === null ? null : text(v['login'], 128),
    enabled: bool(v['enabled']),
    memberActive: bool(v['memberActive']),
    hasLocalPassword: bool(v['hasLocalPassword']),
  }
}

export interface ProviderSettings {
  issuer: string
  clientId: string
  redirectUri: string
  scopes: string[]
  claims: { email: string | null; groups: string | null }
  jit: boolean
}
export interface Provider {
  id: string
  version: number
  revocationEpoch: number
  credentialVersion: number
  enabled: boolean
  settings: ProviderSettings
}
export function settings(value: unknown): ProviderSettings {
  const v = object(value, ['issuer', 'clientId', 'redirectUri', 'scopes', 'claims', 'jit'])
  const c = object(v['claims'], ['email', 'groups'])
  return {
    issuer: text(v['issuer']),
    clientId: text(v['clientId'], 256),
    redirectUri: text(v['redirectUri']),
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
    'revocationEpoch',
    'credentialVersion',
    'enabled',
    'settings',
  ])
  const version = number(v['version'])
  const epoch = number(v['revocationEpoch'])
  const credentialVersion = number(v['credentialVersion'])
  if (!version || !epoch || !credentialVersion) throw new Error('Invalid version')
  return {
    id: uuid(v['id']),
    version,
    revocationEpoch: epoch,
    credentialVersion: credentialVersion,
    enabled: bool(v['enabled']),
    settings: settings(v['settings']),
  }
}
export function redirect(value: unknown, key: 'authorizationUrl'): string {
  const v = text(object(value, [key])[key], 8192)
  const u = new URL(v)
  if (u.protocol !== 'https:' || u.username || u.password) throw new Error('Invalid redirect')
  return v
}

export interface HostContext {
  tenantId: string
  principalId: string
  sessionId: string
  navigation: { manageAccounts: boolean; manageProviders: boolean }
}
export function hostContext(value: unknown): HostContext {
  const v = object(value, ['tenantId', 'principalId', 'sessionId', 'navigation'])
  const navigation = object(v['navigation'], ['manageAccounts', 'manageProviders'])
  return {
    tenantId: uuid(v['tenantId']),
    principalId: uuid(v['principalId']),
    sessionId: uuid(v['sessionId']),
    navigation: {
      manageAccounts: bool(navigation['manageAccounts']),
      manageProviders: bool(navigation['manageProviders']),
    },
  }
}
