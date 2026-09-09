import { vi } from 'vitest'
import type { HttpTransport, RequestOptions, NoContentRequest } from '@rss/api/identity'
import { createSession } from '../src/services/session'
import { createApi } from '../src/services/api'
import { createFlows } from '../src/services/flow'
export const TENANT = '11111111-1111-4111-8111-111111111111'
export const ID = '22222222-2222-4222-8222-222222222222'
export const OTHER = '33333333-3333-4333-8333-333333333333'
export const TOKEN = 'a'.repeat(64)
export function sessionValue(admin = true, token = TOKEN) {
  return {
    session: { id: ID, auth_time: 1, idle_expires_at: 4102444800, absolute_expires_at: 4102444900 },
    identity: { principal_id: ID, administrator: admin, has_local_password: true },
    csrf_token: token,
  }
}
export const accountValue = {
  principal_id: OTHER,
  login: 'member',
  enabled: true,
  administrator: false,
  emergency: false,
  member_active: true,
  has_local_password: true,
}
export const settingsValue = {
  issuer: 'https://idp.example.test',
  client_id: 'identity',
  secret_ref: 'idp@1',
  redirect_uri: 'https://identity.example.test/api/v1/oidc/callback',
  scopes: ['openid'],
  claims: { email: 'email', groups: null },
  jit: false,
}
export const providerValue = {
  id: OTHER,
  version: 1,
  revocation_epoch: 1,
  enabled: false,
  settings: settingsValue,
}
export function fixture() {
  const replies: unknown[] = []
  const request = vi.fn(async (options: RequestOptions<unknown> | NoContentRequest) => {
    let result = replies.shift()
    if (typeof result === 'function') result = await (result as () => Promise<unknown>)()
    if (result instanceof Error) throw result
    if (options.successStatus === 204) return undefined
    return options.decode(result)
  })
  const transport = { request } as HttpTransport
  const session = createSession(transport)
  const api = createApi(session)
  const storage = new Map<string, string>()
  const flows = createFlows({
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, v) => {
      storage.set(key, v)
    },
    removeItem: (key) => {
      storage.delete(key)
    },
  })
  return {
    replies,
    request,
    session,
    api,
    flows,
    storage,
    async login(admin = true) {
      replies.push(sessionValue(admin))
      await session.login(TENANT, 'admin', 'private fixture password')
    },
  }
}
