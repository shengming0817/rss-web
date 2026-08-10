import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import type { IdentitySession, IdentitySessionState } from '@rss/identity'
import { createAppRouter } from './index'

window.scrollTo = vi.fn()

function sessionFixture(initial: IdentitySessionState) {
  let state = initial
  const listeners = new Set<(next: IdentitySessionState) => void>()
  const session = {
    getState: () => state,
    subscribe: (listener: (next: IdentitySessionState) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    login: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
  } as unknown as IdentitySession
  return {
    session,
    publish(next: IdentitySessionState) {
      state = next
      for (const listener of listeners) listener(next)
    },
  }
}

describe('session-owned router', () => {
  it('redirects an initial anonymous shell navigation to standalone login', async () => {
    const fixture = sessionFixture({ status: 'anonymous' })
    const router = createAppRouter(fixture.session, createMemoryHistory())

    await router.push('/')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.matched).toHaveLength(1)
  })

  it('allows authenticated and refreshing sessions into the shell', async () => {
    const profile = {
      subject: 'subject',
      tenantId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      kind: 'user',
    } as never
    for (const state of [
      { status: 'authenticated', profile, sessionExpiresAt: 2, accessExpiresAt: 1 },
      { status: 'refreshing', profile, sessionExpiresAt: 2, accessExpiresAt: 1 },
    ] satisfies IdentitySessionState[]) {
      const fixture = sessionFixture(state)
      const router = createAppRouter(fixture.session, createMemoryHistory())
      await router.push('/')
      await router.isReady()
      expect(router.currentRoute.value.name).toBe('home')
    }
  })

  it('keeps transitional states out of shell and redirects verified sessions away from login', async () => {
    const transitional = sessionFixture({ status: 'verifying' })
    const anonymousRouter = createAppRouter(transitional.session, createMemoryHistory())
    await anonymousRouter.push('/')
    await anonymousRouter.isReady()
    expect(anonymousRouter.currentRoute.value.name).toBe('login')

    const profile = {
      subject: 'subject',
      tenantId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      kind: 'user',
    } as never
    transitional.publish({
      status: 'authenticated',
      profile,
      sessionExpiresAt: 2,
      accessExpiresAt: 1,
    })
    await vi.waitFor(() => expect(anonymousRouter.currentRoute.value.name).toBe('home'))
  })

  it('leaves the shell immediately when the session expires', async () => {
    const profile = {
      subject: 'subject',
      tenantId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      kind: 'user',
    } as never
    const fixture = sessionFixture({
      status: 'authenticated',
      profile,
      sessionExpiresAt: 2,
      accessExpiresAt: 1,
    })
    const router = createAppRouter(fixture.session, createMemoryHistory())
    await router.push('/')
    await router.isReady()

    fixture.publish({ status: 'expired' })
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
  })

  it.each(['/access', '/config', '/flags', '/admin', '/observability', '/observe', '/audit'])(
    'does not resolve the removed route %s',
    (path) => {
      const fixture = sessionFixture({ status: 'anonymous' })
      const router = createAppRouter(fixture.session, createMemoryHistory())
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      expect(router.resolve(path).name).toBeUndefined()
      warn.mockRestore()
    },
  )
})
