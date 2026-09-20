import { vi } from 'vitest'
import type {
  HttpTransport,
  RequestOptions,
  ResponseRequestOptions,
  NoContentRequest,
} from '@rss/api/identity'
import { createSession } from '../src/services/session'
import { createApi } from '../src/services/api'
import { createFlows } from '../src/services/flow'
export const TENANT = '11111111-1111-4111-8111-111111111111'
export const ID = '22222222-2222-4222-8222-222222222222'
export const OTHER = '33333333-3333-4333-8333-333333333333'
export const TOKEN = 'a'.repeat(64)
export function securityValue() {
  return {
    sessionId: ID,
    authentication: { authTime: 1, acr: 'unspecified', amr: ['pwd'] },
    eligibleStepUpProviders: [] as { providerId: string; label: string }[],
  }
}
export function sessionValue(_admin = true, token = TOKEN) {
  return {
    session: { id: ID, authTime: 1, idleExpiresAt: 4102444800, absoluteExpiresAt: 4102444900 },
    identity: {
      principalId: ID,
      hasLocalPassword: true,
    },
    csrfToken: token,
  }
}
export const accountValue = {
  principalId: OTHER,
  login: 'member',
  enabled: true,
  memberActive: true,
  hasLocalPassword: true,
}
export const settingsValue = {
  issuer: 'https://idp.example.test',
  clientId: 'identity',
  redirectUri: 'https://identity.example.test/api/v2/oidc/callback',
  scopes: ['openid'],
  claims: { email: 'email', groups: null, departmentSnapshot: null },
  jit: false,
}
export const providerValue = {
  id: OTHER,
  version: 1,
  revocationEpoch: 1,
  credentialVersion: 1,
  enabled: false,
  settings: settingsValue,
}
export function fixture(oidcEnabled = true) {
  let manager = true
  let current = sessionValue()
  let currentTenant = TENANT
  const contextReplies: unknown[] = []
  const replies: unknown[] = []
  const request = vi.fn(
    async (
      options: RequestOptions<unknown> | ResponseRequestOptions<unknown> | NoContentRequest,
    ) => {
      const contextRead = options.path.endsWith('/context')
      let result = contextRead
        ? contextReplies.length
          ? contextReplies.shift()
          : {
              tenantId: currentTenant,
              principalId: current.identity.principalId,
              sessionId: current.session.id,
              navigation: { manageAccounts: manager, manageProviders: manager },
            }
        : replies.shift()
      if (typeof result === 'function') result = await (result as () => Promise<unknown>)()
      if (result instanceof Error) throw result
      if (options.successStatus === 204) return undefined
      if (result && typeof result === 'object' && 'csrfToken' in result) {
        current = result as ReturnType<typeof sessionValue>
        currentTenant = String(options.pathParams?.['tenant'] ?? TENANT)
      }
      return options.decode(
        result,
        Array.isArray(options.successStatus)
          ? (result as { active: boolean }).active
            ? 201
            : 202
          : (options.successStatus as number),
      )
    },
  )
  const transport = { request } as HttpTransport
  const session = createSession(transport, {
    canonicalOrigin: 'https://identity.example.test',
    oidcEnabled,
  })
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
    contextReplies,
    request,
    session,
    api,
    flows,
    storage,
    async login(admin = true) {
      manager = admin
      replies.push(sessionValue(admin))
      await session.login(TENANT, 'admin', 'private fixture password')
    },
  }
}
