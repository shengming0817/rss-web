import {
  profileExtensions,
  validateLocalProfile,
  type Account,
  type AccountRow,
  type AccountQuery,
  type DirectoryStatus,
  type IdentityProvider,
  type LocalProfileDetail,
  type LocalProfileReceipt,
  type ProviderSettings,
  type ProviderTest,
} from '@rss/auth-core'
import { object, text, number, uuid, bool, list } from './decode'
const nullable = <T>(v: unknown, decode: (v: unknown) => T): T | null =>
  v === null ? null : decode(v)
export function account(value: unknown): Account {
  const v = object(value, ['principalId', 'login', 'enabled', 'memberActive', 'hasLocalPassword'])
  return {
    principalId: uuid(v['principalId']),
    login: nullable(v['login'], (v) => text(v, 128)),
    enabled: bool(v['enabled']),
    memberActive: bool(v['memberActive']),
    hasLocalPassword: bool(v['hasLocalPassword']),
  }
}
export function providerSettings(value: unknown): ProviderSettings {
  const v = object(value, ['issuer', 'clientId', 'redirectUri', 'scopes', 'claims', 'jit'])
  const c = object(v['claims'], ['subject', 'profile', 'groups', 'departmentSnapshot'])
  const raw = c['subject'] as { kind?: unknown } | null
  const s = object(raw, raw?.kind === 'oidc' ? ['kind'] : ['kind', 'tenant'])
  if (s['kind'] !== 'oidc' && s['kind'] !== 'entra') throw new Error('Invalid subject mapping')
  const subject =
    s['kind'] === 'oidc'
      ? { kind: 'oidc' as const }
      : { kind: 'entra' as const, tenant: uuid(s['tenant']) }
  const p = object(c['profile'], ['extensionsClaim', 'maxAgeSeconds'])
  const age = number(p['maxAgeSeconds'])
  if (age < 60 || age > 86400) throw new Error('Invalid profile age')
  const department = nullable(c['departmentSnapshot'], (value) => {
    const d = object(value, ['claim', 'maxAgeSeconds']),
      age = number(d['maxAgeSeconds'])
    if (age < 1 || age > 300) throw new Error('Invalid department age')
    return { claim: text(d['claim'], 64), maxAgeSeconds: age }
  })
  return {
    issuer: text(v['issuer']),
    clientId: text(v['clientId'], 256),
    redirectUri: text(v['redirectUri']),
    scopes: list(v['scopes'], (v) => text(v, 128), 16),
    jit: bool(v['jit']),
    claims: {
      subject,
      profile: {
        extensionsClaim: nullable(p['extensionsClaim'], (v) => text(v, 128)),
        maxAgeSeconds: age,
      },
      groups: nullable(c['groups'], (v) => text(v, 64)),
      departmentSnapshot: department,
    },
  }
}
export function provider(value: unknown): IdentityProvider {
  const v = object(value, [
    'id',
    'version',
    'revocationEpoch',
    'credentialVersion',
    'enabled',
    'settings',
  ])
  const version = number(v['version']),
    revocationEpoch = number(v['revocationEpoch']),
    credentialVersion = number(v['credentialVersion'])
  if (!version || !revocationEpoch || !credentialVersion)
    throw new Error('Invalid provider revision')
  return {
    id: uuid(v['id']),
    version,
    revocationEpoch,
    credentialVersion,
    enabled: bool(v['enabled']),
    settings: providerSettings(v['settings']),
  }
}
export function localProfile(value: unknown): LocalProfileDetail {
  const v = object(value, ['revision', 'value']),
    revision = number(v['revision'])
  if (v['value'] === null) return { revision, value: null }
  const p = object(v['value'], ['displayName', 'username', 'email', 'extensions', 'maxAgeSeconds'])
  const profile = {
    displayName: nullable(p['displayName'], (v) => text(v, 512)),
    username: nullable(p['username'], (v) => text(v, 256)),
    email: nullable(p['email'], (v) => text(v, 320)),
    extensions: profileExtensions(p['extensions']),
    maxAgeSeconds: number(p['maxAgeSeconds']),
  }
  validateLocalProfile(profile)
  return { revision, value: profile }
}
export function localProfileReceipt(
  value: unknown,
  operationId: string,
): LocalProfileReceipt | null {
  if (value === null) return null
  const v = object(value, ['operationId', 'revision']),
    revision = number(v['revision'])
  if (uuid(v['operationId']) !== operationId || !revision) throw new Error('Wrong profile receipt')
  return { operationId, revision }
}
const directoryStatuses: readonly DirectoryStatus[] = [
  'available',
  'missing',
  'expired',
  'unavailable',
  'not_yet_valid',
  'claim_missing',
  'invalid_claim',
  'local_identity',
  'not_configured',
]
function status(value: unknown): DirectoryStatus {
  if (!directoryStatuses.includes(value as DirectoryStatus))
    throw new Error('Invalid directory status')
  return value as DirectoryStatus
}
function departmentSnapshot(value: unknown): AccountRow['departmentSnapshot'] {
  if (value === null) return null
  const v = object(value, ['version', 'sourceRevision', 'nodes', 'memberships'])
  if (v['version'] !== 1) throw new Error('Invalid department snapshot')
  const nodes = list(
    v['nodes'],
    (value) => {
      const n = object(value, ['id', 'displayName', 'parentId'])
      return {
        id: text(n['id']),
        displayName: text(n['displayName']),
        parentId: nullable(n['parentId'], text),
      }
    },
    10000,
  )
  if (new Set(nodes.map((n) => n.id)).size !== nodes.length) throw new Error('Duplicate department')
  return {
    version: 1,
    sourceRevision: text(v['sourceRevision']),
    nodes,
    memberships: list(v['memberships'], text, 10000),
  }
}
const fields = {
  principalId: uuid,
  login: (v: unknown) => nullable(v, text),
  enabled: bool,
  memberActive: bool,
  hasLocalPassword: bool,
  displayName: (v: unknown) => nullable(v, text),
  email: (v: unknown) => nullable(v, text),
  profileStatus: status,
  departmentStatus: status,
  departmentSnapshot,
}
const baseFields: (keyof Account)[] = [
  'principalId',
  'login',
  'enabled',
  'memberActive',
  'hasLocalPassword',
]
function cursor(value: unknown): string {
  const v = text(value, 4096)
  if (!/^[A-Za-z0-9_-]+$/.test(v) || /^[0-9a-f-]{36}$/.test(v))
    throw new Error('Invalid account cursor')
  return v
}
export function accountQuery(query: AccountQuery): Record<string, string> {
  const result: Record<string, string> = {}
  if (query.filter !== undefined) {
    if (!query.filter || new TextEncoder().encode(query.filter).length > 8192)
      throw new Error('Invalid account filter')
    result['filter'] = query.filter
  }
  if (query.source !== undefined)
    result['source'] = query.source === 'local' ? 'local' : uuid(query.source)
  for (const name of ['fields', 'sort'] as const) {
    const values = query[name]
    if (values !== undefined) {
      if (
        !values.length ||
        new Set(values.map((v) => v.replace(/^-/, ''))).size !== values.length ||
        values.some(
          (v) =>
            !Object.hasOwn(fields, v.replace(/^-/, '')) ||
            (name === 'fields' && v.startsWith('-')) ||
            (name === 'sort' && v.replace(/^-/, '') === 'departmentSnapshot'),
        )
      )
        throw new Error('Invalid account fields')
      result[name] = values.join(',')
    }
  }
  if (query.limit !== undefined) {
    if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100)
      throw new Error('Invalid account page size')
    result['limit'] = String(query.limit)
  }
  if (query.cursor !== undefined) result['cursor'] = cursor(query.cursor)
  return result
}
export function accounts<F extends keyof AccountRow = keyof Account>(
  value: unknown,
  selected?: readonly F[],
): { items: Pick<AccountRow, F>[]; nextCursor: string | null } {
  const v = object(value, ['accounts', 'nextCursor']),
    projected = selected ?? baseFields
  const items = list(v['accounts'], (value) => {
    const row = object(value, projected)
    return Object.fromEntries(projected.map((field) => [field, fields[field](row[field])])) as Pick<
      AccountRow,
      F
    >
  })
  if (projected.includes('principalId' as never)) {
    const ids = items.map((item) => Reflect.get(item, 'principalId'))
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate account')
  }
  return { items, nextCursor: nullable(v['nextCursor'], cursor) }
}
export function providerTest(value: unknown): ProviderTest {
  const raw = value as { passed?: unknown } | null
  if (raw?.passed === true) {
    const v = object(value, ['passed', 'report']),
      r = object(v['report'], ['checks', 'tlsVerified', 'authorizationResponseIssuer'])
    const stages = list(r['checks'], text, 5)
    if (
      new Set(stages).size !== stages.length ||
      stages.some((s) => !['binding', 'discovery', 'jwks', 'exchange', 'claims'].includes(s))
    )
      throw new Error('Invalid provider test')
    return {
      passed: true,
      checks: stages,
      tlsVerified: bool(r['tlsVerified']),
      authorizationResponseIssuer: bool(r['authorizationResponseIssuer']),
    }
  }
  const v = object(value, ['passed', 'diagnostic']),
    d = object(v['diagnostic'], ['stage', 'reason'])
  if (bool(v['passed'])) throw new Error('Invalid provider test')
  const stage = text(d['stage']),
    reason = text(d['reason'])
  if (
    !['binding', 'discovery', 'jwks', 'exchange', 'claims'].includes(stage) ||
    ![
      'invalid_trust_anchor',
      'egress_denied',
      'tls_rejected',
      'unavailable',
      'timeout',
      'invalid_response',
      'issuer_mismatch',
      'issuer_response_unsupported',
      'code_rejected',
      'invalid_token',
    ].includes(reason)
  )
    throw new Error('Invalid provider diagnostic')
  return { passed: false, diagnostic: `${stage}: ${reason}` }
}
