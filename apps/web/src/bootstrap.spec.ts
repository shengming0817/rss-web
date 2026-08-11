import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppRouterOptions } from './router'

const createHttpTransport = vi.fn(() => ({ request: vi.fn() }))
const createServerAuthorizationPort = vi.fn(() => ({ preview: vi.fn() }))
const createIdentitySession = vi.fn(() => ({
  transport: { request: vi.fn() },
  getState: () => ({ status: 'anonymous' }),
  subscribe: () => () => undefined,
}))
const createAccountStatusApi = vi.fn(() => ({ get: vi.fn(), set: vi.fn() }))
const createRolesApi = vi.fn(() => ({ list: vi.fn(), assign: vi.fn(), revoke: vi.fn() }))
const createPoliciesApi = vi.fn(() => ({ list: vi.fn(), get: vi.fn() }))
const createAuthorizationExperience = vi.fn(() => ({ getHint: vi.fn() }))
const createAppRouter = vi.fn(
  (_session: unknown, _authorization: unknown, _history: unknown, _options?: AppRouterOptions) => ({
    install: vi.fn(),
  }),
)
const createAuditApi = vi.fn(() => ({ listEntries: vi.fn() }))
const createRuntimeApi = vi.fn(() => ({ inventory: vi.fn() }))
const createSettingsApi = vi.fn(() => ({ get: vi.fn(), publish: vi.fn(), delete: vi.fn() }))

vi.mock('@rss/api', () => ({ createHttpTransport }))
vi.mock('@rss/authorization', () => ({ createServerAuthorizationPort }))
vi.mock('@rss/identity', () => ({
  createAccountStatusApi,
  createIdentitySession,
  createPoliciesApi,
  createRolesApi,
}))
vi.mock('@rss/audit', () => ({ createAuditApi }))
vi.mock('@rss/runtime', () => ({ createRuntimeApi }))
vi.mock('@rss/settings', () => ({ createSettingsApi }))
vi.mock('./features/authorization/authorization-context', () => ({
  createAuthorizationExperience,
}))
vi.mock('./router', () => ({ createAppRouter }))

describe('web composition root', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('creates one memory session over the same-origin transport', async () => {
    const { createWebRuntime } = await import('./bootstrap')
    const runtime = createWebRuntime()

    expect(createHttpTransport).toHaveBeenCalledOnce()
    expect(createHttpTransport).toHaveBeenCalledWith({ baseURL: '', defaultTimeoutMs: 10_000 })
    expect(createIdentitySession).toHaveBeenCalledOnce()
    expect(createIdentitySession).toHaveBeenCalledWith({
      transport: createHttpTransport.mock.results[0]?.value,
    })
    expect(createServerAuthorizationPort).toHaveBeenCalledOnce()
    const session = createIdentitySession.mock.results[0]?.value
    expect(createAccountStatusApi).toHaveBeenCalledWith(session?.transport)
    expect(createRolesApi).toHaveBeenCalledWith(session?.transport)
    expect(createPoliciesApi).toHaveBeenCalledWith(session?.transport)
    expect(createAuditApi).toHaveBeenCalledWith(session?.transport)
    expect(createRuntimeApi).toHaveBeenCalledWith(session?.transport)
    expect(createSettingsApi).toHaveBeenCalledWith(session?.transport)
    expect(createAuthorizationExperience).toHaveBeenCalledWith({
      port: createServerAuthorizationPort.mock.results[0]?.value,
      session: createIdentitySession.mock.results[0]?.value,
    })
    expect(createAppRouter).toHaveBeenCalledWith(
      createIdentitySession.mock.results[0]?.value,
      createAuthorizationExperience.mock.results[0]?.value,
      expect.anything(),
      {
        configCatalogPreview: false,
        configHistoryPreview: false,
        roleBindingsPreview: false,
      },
    )
    expect(runtime.authorization).toBe(createAuthorizationExperience.mock.results[0]?.value)
    expect(runtime.accountStatus).toBe(createAccountStatusApi.mock.results[0]?.value)
    expect(runtime.audit).toBe(createAuditApi.mock.results[0]?.value)
    expect(runtime.roles).toBe(createRolesApi.mock.results[0]?.value)
    expect(runtime.policies).toBe(createPoliciesApi.mock.results[0]?.value)
    expect(runtime.runtime).toBe(createRuntimeApi.mock.results[0]?.value)
    expect(runtime.settings).toBe(createSettingsApi.mock.results[0]?.value)
  })

  it('passes all four Config Preview flag combinations through one closed composition', async () => {
    const { createWebRuntime } = await import('./bootstrap')
    vi.stubEnv('MODE', 'test')
    for (const [configCatalogPreview, configHistoryPreview] of [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ] as const) {
      vi.stubEnv('VITE_CONFIG_CATALOG_PREVIEW', configCatalogPreview ? 'true' : 'false')
      vi.stubEnv('VITE_CONFIG_HISTORY_PREVIEW', configHistoryPreview ? 'true' : 'false')
      createWebRuntime()
      const options = createAppRouter.mock.lastCall?.[3]
      expect(options).toMatchObject({
        configCatalogPreview,
        configHistoryPreview,
        roleBindingsPreview: false,
      })
      if (configCatalogPreview || configHistoryPreview) {
        expect(options).toHaveProperty('configPreviewDraft', expect.anything())
      } else {
        expect(options).not.toHaveProperty('configPreviewDraft')
      }
    }

    vi.stubEnv('MODE', 'production')
    vi.stubEnv('VITE_CONFIG_CATALOG_PREVIEW', 'true')
    vi.stubEnv('VITE_CONFIG_HISTORY_PREVIEW', 'true')
    createWebRuntime()
    expect(createAppRouter).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      {
        configCatalogPreview: false,
        configHistoryPreview: false,
        roleBindingsPreview: false,
      },
    )
  })
})
