import { describe, expect, it, vi } from 'vitest'

const createHttpTransport = vi.fn(() => ({ request: vi.fn() }))
const createServerAuthorizationPort = vi.fn(() => ({ preview: vi.fn() }))
const createIdentitySession = vi.fn(() => ({
  transport: { request: vi.fn() },
  getState: () => ({ status: 'anonymous' }),
  subscribe: () => () => undefined,
}))
const createAccountStatusApi = vi.fn(() => ({ get: vi.fn(), set: vi.fn() }))
const createAuthorizationExperience = vi.fn(() => ({ getHint: vi.fn() }))
const createAppRouter = vi.fn(() => ({ install: vi.fn() }))
const createAuditApi = vi.fn(() => ({ listEntries: vi.fn() }))
const createRuntimeApi = vi.fn(() => ({ inventory: vi.fn() }))

vi.mock('@rss/api', () => ({ createHttpTransport }))
vi.mock('@rss/authorization', () => ({ createServerAuthorizationPort }))
vi.mock('@rss/identity', () => ({ createAccountStatusApi, createIdentitySession }))
vi.mock('@rss/audit', () => ({ createAuditApi }))
vi.mock('@rss/runtime', () => ({ createRuntimeApi }))
vi.mock('./features/authorization/authorization-context', () => ({
  createAuthorizationExperience,
}))
vi.mock('./router', () => ({ createAppRouter }))

describe('web composition root', () => {
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
    expect(createAuditApi).toHaveBeenCalledWith(session?.transport)
    expect(createRuntimeApi).toHaveBeenCalledWith(session?.transport)
    expect(createAuthorizationExperience).toHaveBeenCalledWith({
      port: createServerAuthorizationPort.mock.results[0]?.value,
      session: createIdentitySession.mock.results[0]?.value,
    })
    expect(createAppRouter).toHaveBeenCalledWith(
      createIdentitySession.mock.results[0]?.value,
      createAuthorizationExperience.mock.results[0]?.value,
      expect.anything(),
    )
    expect(runtime.authorization).toBe(createAuthorizationExperience.mock.results[0]?.value)
    expect(runtime.accountStatus).toBe(createAccountStatusApi.mock.results[0]?.value)
    expect(runtime.audit).toBe(createAuditApi.mock.results[0]?.value)
    expect(runtime.runtime).toBe(createRuntimeApi.mock.results[0]?.value)
  })
})
