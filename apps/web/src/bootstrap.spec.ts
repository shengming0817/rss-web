import { describe, expect, it, vi } from 'vitest'

const createHttpTransport = vi.fn(() => ({ request: vi.fn() }))
const createIdentitySession = vi.fn(() => ({
  getState: () => ({ status: 'anonymous' }),
  subscribe: () => () => undefined,
}))

vi.mock('@rss/api', () => ({ createHttpTransport }))
vi.mock('@rss/identity', () => ({ createIdentitySession }))

describe('web composition root', () => {
  it('creates one memory session over the same-origin transport', async () => {
    const { createWebRuntime } = await import('./bootstrap')
    createWebRuntime()

    expect(createHttpTransport).toHaveBeenCalledOnce()
    expect(createHttpTransport).toHaveBeenCalledWith({ baseURL: '', defaultTimeoutMs: 10_000 })
    expect(createIdentitySession).toHaveBeenCalledOnce()
    expect(createIdentitySession).toHaveBeenCalledWith({
      transport: createHttpTransport.mock.results[0]?.value,
    })
  })
})
