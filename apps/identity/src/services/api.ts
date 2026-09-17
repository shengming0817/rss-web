import { isRssApiError } from '@rss/api/identity'
import type { IdentitySession } from './session'
import {
  object,
  list,
  text,
  bool,
  uuid,
  account,
  provider,
  redirect,
  session,
  type ProviderSettings,
  type Provider,
  type Account,
} from './decode'
export function createApi(owner: IdentitySession) {
  async function call<T>(
    method: 'GET' | 'POST' | 'PUT',
    suffix: string,
    decode: (v: unknown) => T,
    body?: unknown,
    status: 200 | 201 = 200,
    anonymousTenant?: string,
    query?: Record<string, string>,
  ): Promise<T> {
    if (
      !owner.config.oidcEnabled &&
      (suffix.startsWith('oidc/') || suffix === 'login-options' || suffix.startsWith('providers'))
    )
      return Promise.reject(new Error('OIDC disabled'))
    return owner.perform(async () => {
      const tenant = anonymousTenant ?? owner.state.value.tenant
      if (!tenant) throw new Error('Tenant required')
      if (anonymousTenant === undefined && owner.state.value.status !== 'authenticated')
        throw new Error('Session required')
      return owner.transport.request({
        method,
        path: `/api/v2/tenants/{tenant}/${suffix}`,
        pathParams: { tenant: uuid(tenant) },
        headers: method === 'GET' ? {} : owner.headers(anonymousTenant === undefined),
        ...(body === undefined ? {} : { body }),
        successStatus: status,
        decode,
        ...(query === undefined ? {} : { query }),
      })
    })
  }
  async function selfWrite(work: () => Promise<Account>) {
    try {
      const v = await work()
      owner.clear()
      return v
    } catch (error) {
      if (!isRssApiError(error) || error.status === 503 || error.cause !== 'wire') owner.clear()
      throw error
    }
  }
  return {
    link: (id: string, password: string) =>
      call('POST', `oidc/${uuid(id)}/link`, (v) => redirect(v, 'authorizationUrl'), {
        returnTarget: 'resume',
        password,
      }),
    stepUp: (id: string) =>
      call('POST', `oidc/${uuid(id)}/step-up`, (v) => redirect(v, 'authorizationUrl'), {
        returnTarget: 'resume',
      }),
    loginOptions: (tenant: string) =>
      call(
        'GET',
        'login-options',
        (v) =>
          list(object(v, ['providers'])['providers'], (p) => {
            const r = object(p, ['providerId', 'label'])
            return { id: uuid(r['providerId']), label: text(r['label'], 4096) }
          }),
        undefined,
        200,
        tenant,
      ),
    sessions: (cursor?: string) =>
      call(
        'GET',
        'sessions',
        (v) => {
          const r = object(v, ['sessions', 'nextCursor'])
          return {
            sessions: list(r['sessions'], session),
            next: r['nextCursor'] === null ? null : uuid(r['nextCursor']),
          }
        },
        undefined,
        200,
        undefined,
        cursor === undefined ? undefined : { cursor: uuid(cursor) },
      ),
    accounts: (cursor?: string) =>
      call(
        'GET',
        'accounts',
        (v) => {
          const r = object(v, ['accounts', 'nextCursor'])
          return {
            accounts: list(r['accounts'], account),
            next: r['nextCursor'] === null ? null : uuid(r['nextCursor']),
          }
        },
        undefined,
        200,
        undefined,
        cursor === undefined ? undefined : { cursor: uuid(cursor) },
      ),
    createAccount: (login: string, password: string) =>
      call('POST', 'accounts', account, { login, password }, 201),
    setAccount: (a: Account, field: 'enabled' | 'membership', enabled: boolean) => {
      const work = () =>
        call('POST', `accounts/${uuid(a.principalId)}/${field}`, account, { enabled })
      return a.principalId === owner.state.value.identity?.principalId ? selfWrite(work) : work()
    },
    resetPassword: (id: string, password: string) =>
      call('POST', `accounts/${uuid(id)}/password`, account, { password }),
    ownPassword: (currentPassword: string, password: string) =>
      selfWrite(() => call('POST', 'account/password', account, { currentPassword, password })),
    providers: () =>
      call('GET', 'providers', (v) => list(object(v, ['providers'])['providers'], provider)),
    createProvider: (settings: ProviderSettings, clientSecret: string, caPem: string | null) =>
      call('POST', 'providers', provider, { settings, clientSecret, caPem }, 201),
    updateProvider: (
      p: Provider,
      settings: ProviderSettings,
      clientSecret: string,
      caPem: string | null,
    ) =>
      call('PUT', `providers/${uuid(p.id)}`, provider, {
        expectedVersion: p.version,
        settings,
        clientSecret,
        caPem,
      }),
    enableProvider: (p: Provider, enabled: boolean) =>
      call('POST', `providers/${uuid(p.id)}/enabled`, provider, {
        expectedVersion: p.version,
        enabled,
      }),
    testProvider: (p: Provider) => call('POST', `providers/${uuid(p.id)}/test`, testReport),
    beginSso: (tenant: string, id: string) =>
      call(
        'POST',
        `oidc/${uuid(id)}/login`,
        (v) => redirect(v, 'authorizationUrl'),
        { returnTarget: 'resume' },
        200,
        tenant,
      ),
  }
}
const stages = ['binding', 'discovery', 'jwks', 'exchange', 'claims']
const reasons = [
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
]
export function testReport(value: unknown): { passed: boolean; diagnostic: string } {
  if (typeof value !== 'object' || value === null || !('passed' in value))
    throw new Error('Invalid response')
  if (value.passed === true) {
    const v = object(value, ['passed', 'report'])
    const r = object(v['report'], ['checks', 'tlsVerified', 'authorizationResponseIssuer'])
    list(
      r['checks'],
      (v) => {
        const s = text(v)
        if (!stages.includes(s)) throw new Error('Invalid stage')
        return s
      },
      5,
    )
    bool(r['tlsVerified'])
    bool(r['authorizationResponseIssuer'])
    return { passed: true, diagnostic: '' }
  }
  const v = object(value, ['passed', 'diagnostic'])
  if (bool(v['passed'])) throw new Error('Invalid result')
  const d = object(v['diagnostic'], ['stage', 'reason'])
  const stage = text(d['stage'])
  const reason = text(d['reason'])
  if (!stages.includes(stage) || !reasons.includes(reason)) throw new Error('Invalid diagnostic')
  return { passed: false, diagnostic: `${stage}: ${reason}` }
}
export type IdentityApi = ReturnType<typeof createApi>
