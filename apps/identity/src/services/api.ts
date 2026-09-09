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
  flow,
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
    await owner.ready()
    const tenant = anonymousTenant ?? owner.state.value.tenant
    if (!tenant) throw new Error('Tenant required')
    if (anonymousTenant === undefined && owner.state.value.status !== 'authenticated')
      throw new Error('Session required')
    const generation = owner.generation()
    try {
      const result = await owner.transport.request({
        method,
        path: `/api/v1/tenants/{tenant}/${suffix}`,
        pathParams: { tenant: uuid(tenant) },
        headers: method === 'GET' ? {} : owner.headers(anonymousTenant === undefined),
        ...(body === undefined ? {} : { body }),
        successStatus: status,
        decode,
        ...(query === undefined ? {} : { query }),
      })
      if (generation !== owner.generation()) throw new Error('Stale response')
      return result
    } catch (error) {
      if (generation === owner.generation()) owner.failure(error)
      throw error
    }
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
    loginOptions: (tenant: string) =>
      call(
        'GET',
        'login-options',
        (v) =>
          list(object(v, ['providers'])['providers'], (p) => {
            const r = object(p, ['provider_id', 'label'])
            return { id: uuid(r['provider_id']), label: text(r['label']) }
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
          const r = object(v, ['sessions', 'next_cursor'])
          return {
            sessions: list(r['sessions'], session),
            next: r['next_cursor'] === null ? null : uuid(r['next_cursor']),
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
          const r = object(v, ['accounts', 'next_cursor'])
          return {
            accounts: list(r['accounts'], account),
            next: r['next_cursor'] === null ? null : uuid(r['next_cursor']),
          }
        },
        undefined,
        200,
        undefined,
        cursor === undefined ? undefined : { cursor: uuid(cursor) },
      ),
    createAccount: (login: string, password: string, role: string) =>
      call('POST', 'accounts', account, { login, password, role }, 201),
    setAccount: (
      a: Account,
      field: 'enabled' | 'administrator' | 'membership',
      enabled: boolean,
    ) => {
      const work = () =>
        call('POST', `accounts/${uuid(a.principal_id)}/${field}`, account, { enabled })
      return a.principal_id === owner.state.value.identity?.principal_id ? selfWrite(work) : work()
    },
    resetPassword: (id: string, password: string) =>
      call('POST', `accounts/${uuid(id)}/password`, account, { password }),
    ownPassword: (current_password: string, password: string) =>
      selfWrite(() => call('POST', 'account/password', account, { current_password, password })),
    providers: () =>
      call('GET', 'providers', (v) => list(object(v, ['providers'])['providers'], provider)),
    createProvider: (settings: ProviderSettings) =>
      call('POST', 'providers', provider, settings, 201),
    updateProvider: (p: Provider, settings: ProviderSettings) =>
      call('PUT', `providers/${uuid(p.id)}`, provider, { expected_version: p.version, settings }),
    enableProvider: (p: Provider, enabled: boolean) =>
      call('POST', `providers/${uuid(p.id)}/enabled`, provider, {
        expected_version: p.version,
        enabled,
      }),
    testProvider: (p: Provider) => call('POST', `providers/${uuid(p.id)}/test`, testReport),
    beginSso: (tenant: string, id: string) =>
      call(
        'POST',
        `oidc/${uuid(id)}/login`,
        (v) => redirect(v, 'authorization_url'),
        { client_id: 'identity-ui', return_target: 'resume' },
        200,
        tenant,
      ),
    async prepare(kind: 'login' | 'consent', challenge: string) {
      return owner.transport.request({
        method: 'POST',
        path: `/api/v1/downstream/${kind}`,
        headers: owner.headers(false),
        body: { challenge },
        successStatus: 200,
        decode: flow,
      })
    },
    async accept(
      kind: 'login' | 'consent',
      challenge: string,
      value: { tenant_id: string; grant_id: string },
    ) {
      try {
        return await owner.transport.request({
          method: 'POST',
          path: `/api/v1/downstream/${kind}/accept`,
          headers: owner.headers(),
          body: { challenge, flow: value },
          successStatus: 200,
          decode: (v) => redirect(v, 'redirect_to'),
        })
      } catch (error) {
        owner.failure(error)
        throw error
      }
    },
  }
}
const stages = ['binding', 'discovery', 'jwks', 'exchange', 'claims']
const reasons = [
  'unapproved_binding',
  'missing_secret',
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
    const r = object(v['report'], ['checks', 'tls_verified', 'authorization_response_issuer'])
    list(
      r['checks'],
      (v) => {
        const s = text(v)
        if (!stages.includes(s)) throw new Error('Invalid stage')
        return s
      },
      5,
    )
    bool(r['tls_verified'])
    bool(r['authorization_response_issuer'])
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
