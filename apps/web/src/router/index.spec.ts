import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { RSS_SOURCE } from '@rss/shared'
import { createServerAuthorizationPort } from '@rss/authorization'
import { createPreviewAuthorizationPort } from '@rss/authorization/preview'
import type { AuthorizationPort } from '@rss/authorization'
import type { IdentitySession, IdentitySessionState } from '@rss/identity'
import { createAuthorizationExperience } from '../features/authorization/authorization-context'
import { createAppRouter } from './index'
import { createShellNavigation } from './navigation'

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

function appRouter(
  fixture: ReturnType<typeof sessionFixture>,
  port: AuthorizationPort = createServerAuthorizationPort(),
) {
  const authorization = createAuthorizationExperience({
    port,
    session: fixture.session,
  })
  return createAppRouter(fixture.session, authorization, createMemoryHistory())
}

describe('session-owned router', () => {
  it('applies the session gate before a Preview-only route hint', async () => {
    const intent = { contractId: 'runtime.inventory', permission: 'runtime:read' }
    const fixture = sessionFixture({ status: 'anonymous' })
    const port = createPreviewAuthorizationPort({
      enabled: true,
      scenarios: [{ id: 'deny-runtime', intent, decision: 'deny' }],
    })
    const router = appRouter(fixture, port)
    router.addRoute({
      path: '/runtime',
      name: 'runtime',
      component: { template: '<div />' },
      meta: {
        authorizationIntent: intent,
        sessionAccess: 'authenticated',
        focusTarget: 'shell-content',
      },
    })

    await router.push('/runtime')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('login')
  })

  it('redirects an initial anonymous shell navigation to standalone login', async () => {
    const fixture = sessionFixture({ status: 'anonymous' })
    const router = appRouter(fixture)

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
      const router = appRouter(fixture)
      await router.push('/')
      await router.isReady()
      expect(router.currentRoute.value.name).toBe('home')
    }
  })

  it('keeps transitional states out of shell and redirects verified sessions away from login', async () => {
    const transitional = sessionFixture({ status: 'verifying' })
    const anonymousRouter = appRouter(transitional)
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
    const router = appRouter(fixture)
    await router.push('/')
    await router.isReady()

    fixture.publish({ status: 'expired' })
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
  })

  it('rechecks authority before committing a pending protected navigation', async () => {
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
    let componentRequested!: () => void
    const requested = new Promise<void>((resolve) => {
      componentRequested = resolve
    })
    let resolveComponent!: (component: { template: string }) => void
    const pendingComponent = new Promise<{ template: string }>((resolve) => {
      resolveComponent = resolve
    })
    const router = appRouter(fixture)
    router.addRoute({
      path: '/pending',
      name: 'pending',
      component: () => {
        componentRequested()
        return pendingComponent
      },
      meta: { sessionAccess: 'authenticated', focusTarget: 'shell-content' },
    })

    const navigation = router.push('/pending')
    await requested
    fixture.publish({ status: 'expired' })
    resolveComponent({ template: '<div />' })
    await navigation

    expect(router.currentRoute.value.name).toBe('login')
  })

  it.each(['/access', '/config', '/flags', '/admin', '/observability', '/observe', '/audit'])(
    'routes the removed path %s only to the protected catch-all',
    (path) => {
      const fixture = sessionFixture({ status: 'anonymous' })
      const router = appRouter(fixture)
      expect(router.resolve(path).name).toBe('not-found')
    },
  )

  it('derives navigation from the implemented Home and Runtime routes', () => {
    const router = appRouter(sessionFixture({ status: 'anonymous' }))
    expect(createShellNavigation(router, (key) => key)).toEqual([
      {
        id: 'home',
        label: 'navigation.home',
        to: { name: 'home' },
        source: RSS_SOURCE,
      },
      {
        id: 'runtime',
        label: 'navigation.runtime',
        to: { name: 'runtime' },
        source: RSS_SOURCE,
      },
    ])
  })

  it('owns the Runtime details route with session and server-authoritative intent metadata', () => {
    const router = appRouter(sessionFixture({ status: 'anonymous' }))
    const route = router.resolve('/runtime')
    expect(route.name).toBe('runtime')
    expect(route.meta).toMatchObject({
      sessionAccess: 'authenticated',
      focusTarget: 'shell-content',
      authorizationIntent: {
        contractId: 'runtime.inventory',
        permission: 'runtime:inventory:read',
      },
      navigation: { labelKey: 'navigation.runtime', order: 10, source: RSS_SOURCE },
    })
  })

  it('keeps unknown paths behind session authority and shows 404 after authentication', async () => {
    const anonymous = appRouter(sessionFixture({ status: 'anonymous' }))
    await anonymous.push('/unknown')
    await anonymous.isReady()
    expect(anonymous.currentRoute.value.name).toBe('login')

    const profile = {
      subject: 'subject',
      tenantId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      kind: 'user',
    } as never
    const authenticated = appRouter(
      sessionFixture({
        status: 'authenticated',
        profile,
        sessionExpiresAt: 2,
        accessExpiresAt: 1,
      }),
    )
    await authenticated.push('/unknown')
    await authenticated.isReady()
    expect(authenticated.currentRoute.value.name).toBe('not-found')
  })
})
