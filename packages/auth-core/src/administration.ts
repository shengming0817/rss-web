/** Identity account management is independent from MDM resource authorization. */
export interface Account {
  readonly principalId: string
  readonly login: string | null
  readonly enabled: boolean
  readonly memberActive: boolean
  readonly hasLocalPassword: boolean
}
export type DirectoryStatus =
  | 'available'
  | 'missing'
  | 'expired'
  | 'unavailable'
  | 'not_yet_valid'
  | 'claim_missing'
  | 'invalid_claim'
  | 'local_identity'
  | 'not_configured'
export interface AccountRow extends Account {
  readonly displayName: string | null
  readonly email: string | null
  readonly profileStatus: DirectoryStatus
  readonly departmentStatus: DirectoryStatus
  readonly departmentSnapshot: {
    readonly version: 1
    readonly sourceRevision: string
    readonly nodes: readonly {
      readonly id: string
      readonly displayName: string
      readonly parentId: string | null
    }[]
    readonly memberships: readonly string[]
  } | null
}
export interface AccountQuery<F extends keyof AccountRow = keyof AccountRow> {
  readonly filter?: string
  readonly sort?: readonly string[]
  readonly fields?: readonly F[]
  readonly source?: string
  readonly limit?: number
  readonly cursor?: string
}
export interface ProviderSettings {
  readonly issuer: string
  readonly clientId: string
  readonly redirectUri: string
  readonly scopes: readonly string[]
  readonly jit: boolean
  readonly claims: {
    readonly subject:
      | { readonly kind: 'oidc' }
      | { readonly kind: 'entra'; readonly tenant: string }
    readonly profile: { readonly extensionsClaim: string | null; readonly maxAgeSeconds: number }
    readonly groups: string | null
    readonly departmentSnapshot: { readonly claim: string; readonly maxAgeSeconds: number } | null
  }
}
export interface IdentityProvider {
  readonly id: string
  readonly version: number
  readonly revocationEpoch: number
  readonly credentialVersion: number
  readonly enabled: boolean
  readonly settings: ProviderSettings
}
export type ProviderTest =
  | {
      readonly passed: true
      readonly checks: readonly string[]
      readonly tlsVerified: boolean
      readonly authorizationResponseIssuer: boolean
    }
  | { readonly passed: false; readonly diagnostic: string }
export type ProfileJson =
  | null
  | string
  | number
  | boolean
  | readonly ProfileJson[]
  | { readonly [key: string]: ProfileJson }
export interface LocalProfile {
  readonly displayName: string | null
  readonly username: string | null
  readonly email: string | null
  readonly extensions: { readonly [key: string]: ProfileJson }
  readonly maxAgeSeconds: number
}
export interface LocalProfileDetail {
  readonly revision: number
  readonly value: LocalProfile | null
}
export interface LocalProfileChange {
  readonly operationId: string
  readonly expectedRevision: number
  readonly value: LocalProfile | null
}
export interface LocalProfileReceipt {
  readonly operationId: string
  readonly revision: number
}
export interface IdentityAdministrationPort {
  accounts<F extends keyof AccountRow = keyof Account>(
    query?: AccountQuery<F>,
  ): Promise<{ readonly items: readonly Pick<AccountRow, F>[]; readonly nextCursor: string | null }>
  account(principal: string): Promise<Account>
  createAccount(login: string, password: string): Promise<Account>
  setAccount(principal: string, field: 'enabled' | 'membership', enabled: boolean): Promise<Account>
  resetPassword(principal: string, password: string): Promise<Account>
  ownPassword(currentPassword: string, password: string): Promise<Account>
  providers(): Promise<readonly IdentityProvider[]>
  createProvider(
    settings: ProviderSettings,
    clientSecret: string,
    caPem: string | null,
  ): Promise<IdentityProvider>
  updateProvider(
    id: string,
    expectedVersion: number,
    settings: ProviderSettings,
    clientSecret: string,
    caPem: string | null,
  ): Promise<IdentityProvider>
  enableProvider(id: string, expectedVersion: number, enabled: boolean): Promise<IdentityProvider>
  testProvider(id: string): Promise<ProviderTest>
  localProfile(principal: string): Promise<LocalProfileDetail>
  saveLocalProfile(principal: string, change: LocalProfileChange): Promise<LocalProfileReceipt>
  localProfileOperation(principal: string, operationId: string): Promise<LocalProfileReceipt | null>
}
const secretKeys = new Set([
  'password',
  'access_token',
  'refresh_token',
  'id_token',
  'client_secret',
  'totp_seed',
  'private_key',
  'recovery_codes',
])
/** Current Identity extension budget, root object depth is one. Unknown allowed keys survive exactly. */
export function profileExtensions(value: unknown): { readonly [key: string]: ProfileJson } {
  let members = 0
  function object(input: unknown, depth: number): { readonly [key: string]: ProfileJson } {
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      depth > 8 ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))
    )
      throw new Error('Invalid profile object')
    const entries = Object.entries(input)
    members += entries.length
    if (members > 256) throw new Error('Profile member budget exceeded')
    return Object.fromEntries(
      entries.map(([key, item]) => {
        const normalized = key
          .replace(/[A-Z]/g, (letter) => letter.toLowerCase())
          .replace(/-/g, '_')
        if (/\p{Cc}/u.test(key) || secretKeys.has(normalized))
          throw new Error('Invalid profile key')
        return [key, check(item, depth)]
      }),
    )
  }
  function check(input: unknown, depth: number): ProfileJson {
    if (input === null || typeof input === 'boolean') return input
    if (
      typeof input === 'number' &&
      Number.isFinite(input) &&
      (!Number.isInteger(input) || Number.isSafeInteger(input))
    )
      return input
    if (typeof input === 'string' && !input.includes('\u0000')) return input
    if (Array.isArray(input)) {
      if (depth >= 8 || input.length > 128) throw new Error('Profile array budget exceeded')
      return input.map((v) => check(v, depth + 1))
    }
    if (input && typeof input === 'object') return object(input, depth + 1)
    throw new Error('Invalid profile value')
  }
  const result = object(value, 1)
  if (new TextEncoder().encode(JSON.stringify(result)).length > 65536)
    throw new Error('Profile byte budget exceeded')
  return result
}
export function validateLocalProfile(value: LocalProfile): void {
  for (const [text, maximum] of [
    [value.displayName, 512],
    [value.username, 256],
    [value.email, 320],
  ] as const)
    if (text !== null && (new TextEncoder().encode(text).length > maximum || /\p{Cc}/u.test(text)))
      throw new Error('Invalid profile text')
  profileExtensions(value.extensions)
  if (
    !Number.isSafeInteger(value.maxAgeSeconds) ||
    value.maxAgeSeconds < 60 ||
    value.maxAgeSeconds > 86400
  )
    throw new Error('Invalid profile age')
}
export function validateNewPassword(password: string): void {
  if ([...password].length < 15 || new TextEncoder().encode(password).length > 1024)
    throw new Error('Invalid password length')
}
export function validateLogin(login: string): void {
  if (!login || login.length > 128 || login.trim() !== login || /[^\x20-\x7e]/.test(login))
    throw new Error('Invalid login')
}
export function createIdentityAdministration(port: IdentityAdministrationPort) {
  return {
    ...port,
    createAccount(login: string, password: string) {
      validateLogin(login)
      validateNewPassword(password)
      return port.createAccount(login, password)
    },
    resetPassword(principal: string, password: string) {
      validateNewPassword(password)
      return port.resetPassword(principal, password)
    },
    ownPassword(currentPassword: string, password: string) {
      validateNewPassword(password)
      return port.ownPassword(currentPassword, password)
    },
    async saveLocalProfile(principal: string, change: LocalProfileChange) {
      if (change.value) validateLocalProfile(change.value)
      if (
        !Number.isSafeInteger(change.expectedRevision) ||
        change.expectedRevision < 0 ||
        change.expectedRevision >= Number.MAX_SAFE_INTEGER
      )
        throw new Error('Invalid profile revision')
      const r = await port.saveLocalProfile(principal, change)
      if (r.operationId !== change.operationId || r.revision !== change.expectedRevision + 1)
        throw new Error('Wrong profile receipt')
      return r
    },
  }
}
