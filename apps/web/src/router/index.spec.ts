import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { EXTERNAL_SOURCE, MOCK_SOURCE, RSS_SOURCE } from '@rss/shared'
import { createServerAuthorizationPort } from '@rss/authorization'
import { createPreviewAuthorizationPort } from '@rss/authorization/preview'
import type { AuthorizationPort } from '@rss/authorization'
import type { IdentitySession, IdentitySessionState } from '@rss/identity'
import { createAuthorizationExperience } from '../features/authorization/authorization-context'
import { createAppRouter, type AppRouterOptions } from './index'
import { createShellNavigation } from './navigation'
import { createConfigPreviewDraftHandoff } from '../features/settings/config-preview-draft-context'
import { createWebReleaseMeta } from '../release-meta'

window.scrollTo = vi.fn()

const releaseMeta = createWebReleaseMeta({
  webRevision: '1234567890abcdef1234567890abcdef12345678',
  roleBindingsPreview: false,
  configCatalogPreview: false,
  configHistoryPreview: false,
})

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
  options?: AppRouterOptions,
) {
  const authorization = createAuthorizationExperience({
    port,
    session: fixture.session,
  })
  return createAppRouter(
    fixture.session,
    authorization,
    createMemoryHistory(),
    options ?? {
      configCatalogPreview: false,
      configHistoryPreview: false,
      releaseMeta,
      roleBindingsPreview: false,
    },
  )
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

  it.each(['/access', '/config', '/flags', '/admin', '/observability', '/observe'])(
    'routes the removed path %s only to the protected catch-all',
    (path) => {
      const fixture = sessionFixture({ status: 'anonymous' })
      const router = appRouter(fixture)
      expect(router.resolve(path).name).toBe('not-found')
    },
  )

  it('derives navigation from only implemented production routes', () => {
    const router = appRouter(sessionFixture({ status: 'anonymous' }))
    expect(createShellNavigation(router, (key) => key)).toEqual([
      {
        id: 'home',
        label: 'navigation.home',
        to: { name: 'home' },
        source: RSS_SOURCE,
      },
      {
        id: 'identity',
        label: 'navigation.identity',
        to: { name: 'identity' },
        source: RSS_SOURCE,
      },
      {
        id: 'account-status',
        label: 'navigation.accountStatus',
        to: { name: 'account-status' },
        source: RSS_SOURCE,
      },
      {
        id: 'roles',
        label: 'navigation.roles',
        to: { name: 'roles' },
        source: RSS_SOURCE,
      },
      {
        id: 'policies',
        label: 'navigation.policies',
        to: { name: 'policies' },
        source: RSS_SOURCE,
      },
      {
        id: 'settings',
        label: 'navigation.settings',
        to: { name: 'settings' },
        source: RSS_SOURCE,
      },
      {
        id: 'secret-reference-publish',
        label: 'navigation.secretReference',
        to: { name: 'secret-reference-publish' },
        source: RSS_SOURCE,
      },
      {
        id: 'secret-material-reveal',
        label: 'navigation.secretMaterial',
        to: { name: 'secret-material-reveal' },
        source: RSS_SOURCE,
      },
      {
        id: 'runtime',
        label: 'navigation.runtime',
        to: { name: 'runtime' },
        source: RSS_SOURCE,
      },
      {
        id: 'audit',
        label: 'navigation.audit',
        to: { name: 'audit' },
        source: RSS_SOURCE,
      },
      {
        id: 'about',
        label: 'navigation.about',
        to: { name: 'about' },
        source: EXTERNAL_SOURCE,
      },
    ])
  })

  it('omits the Preview route and navigation unless composition explicitly enables it', async () => {
    const fixture = sessionFixture({ status: 'anonymous' })
    const production = appRouter(fixture)
    expect(production.resolve('/preview/role-bindings').name).toBe('not-found')
    expect(production.resolve('/preview/config-catalog').name).toBe('not-found')
    expect(production.resolve('/preview/config-history').name).toBe('not-found')
    expect(createShellNavigation(production, (key) => key)).not.toContainEqual(
      expect.objectContaining({ id: 'role-bindings-preview' }),
    )

    const preview = appRouter(fixture, createServerAuthorizationPort(), {
      configCatalogPreview: false,
      configHistoryPreview: false,
      releaseMeta,
      roleBindingsPreview: true,
    })
    expect(preview.resolve('/preview/role-bindings')).toMatchObject({
      name: 'role-bindings-preview',
      meta: {
        sessionAccess: 'authenticated',
        focusTarget: 'shell-content',
        navigation: {
          labelKey: 'navigation.roleBindingsPreview',
          source: MOCK_SOURCE,
        },
      },
    })
    expect(preview.resolve('/preview/role-bindings').meta).not.toHaveProperty('authorizationIntent')
    expect(createShellNavigation(preview, (key) => key)).toContainEqual({
      id: 'role-bindings-preview',
      label: 'navigation.roleBindingsPreview',
      to: { name: 'role-bindings-preview' },
      source: MOCK_SOURCE,
    })

    await preview.push('/preview/role-bindings')
    await preview.isReady()
    expect(preview.currentRoute.value.name).toBe('login')

    const catalogDraft = createConfigPreviewDraftHandoff()
    const catalog = appRouter(fixture, createServerAuthorizationPort(), {
      configCatalogPreview: true,
      configHistoryPreview: false,
      configPreviewDraft: catalogDraft,
      releaseMeta,
      roleBindingsPreview: false,
    })
    expect(catalog.resolve('/preview/config-catalog')).toMatchObject({
      name: 'config-catalog-preview',
      meta: {
        navigation: { labelKey: 'navigation.configCatalogPreview', source: MOCK_SOURCE },
      },
    })
    expect(catalog.resolve('/preview/config-catalog').meta).not.toHaveProperty(
      'authorizationIntent',
    )
    for (const name of ['settings', 'config-catalog-preview']) {
      expect(catalog.getRoutes().find((route) => route.name === name)?.props.default).toEqual({
        configPreviewDraft: catalogDraft,
      })
    }

    const historyDraft = createConfigPreviewDraftHandoff()
    const history = appRouter(fixture, createServerAuthorizationPort(), {
      configCatalogPreview: false,
      configHistoryPreview: true,
      configPreviewDraft: historyDraft,
      releaseMeta,
      roleBindingsPreview: false,
    })
    expect(history.resolve('/preview/config-catalog').name).toBe('not-found')
    expect(history.resolve('/preview/config-history').name).toBe('config-history-preview')
    for (const name of ['settings', 'config-history-preview']) {
      expect(history.getRoutes().find((route) => route.name === name)?.props.default).toEqual({
        configPreviewDraft: historyDraft,
      })
    }

    const sharedDraft = createConfigPreviewDraftHandoff()
    const both = appRouter(fixture, createServerAuthorizationPort(), {
      configCatalogPreview: true,
      configHistoryPreview: true,
      configPreviewDraft: sharedDraft,
      releaseMeta,
      roleBindingsPreview: false,
    })
    expect(both.resolve('/preview/config-history')).toMatchObject({
      name: 'config-history-preview',
      meta: {
        navigation: { labelKey: 'navigation.configHistoryPreview', source: MOCK_SOURCE },
      },
    })
    expect(both.resolve('/preview/config-history').meta).not.toHaveProperty('authorizationIntent')
    for (const name of ['settings', 'config-catalog-preview', 'config-history-preview']) {
      expect(both.getRoutes().find((route) => route.name === name)?.props.default).toEqual({
        configPreviewDraft: sharedDraft,
      })
    }
  })

  it('owns the Audit page with ambient route intent and no client-side SuperAdmin gate', () => {
    const router = appRouter(sessionFixture({ status: 'anonymous' }))
    const route = router.resolve('/audit')
    expect(route.name).toBe('audit')
    expect(route.meta).toMatchObject({
      sessionAccess: 'authenticated',
      focusTarget: 'shell-content',
      authorizationIntent: {
        contractId: 'audit.list-entries',
        permission: 'audit:read',
      },
      navigation: { labelKey: 'navigation.audit', order: 50, source: RSS_SOURCE },
    })
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
      navigation: { labelKey: 'navigation.runtime', order: 41, source: RSS_SOURCE },
    })
  })

  it('owns About as authenticated static release evidence with one injected metadata object', async () => {
    const anonymous = appRouter(sessionFixture({ status: 'anonymous' }))
    const route = anonymous.resolve('/about')
    expect(route.name).toBe('about')
    expect(route.meta).toMatchObject({
      sessionAccess: 'authenticated',
      focusTarget: 'shell-content',
      navigation: { labelKey: 'navigation.about', order: 60, source: EXTERNAL_SOURCE },
    })
    expect(route.meta.authorizationIntent).toBeUndefined()
    expect(anonymous.getRoutes().find((entry) => entry.name === 'about')?.props.default).toEqual({
      releaseMeta,
    })

    await anonymous.push('/about')
    await anonymous.isReady()
    expect(anonymous.currentRoute.value.name).toBe('login')
  })

  it('owns Secret Reference publish with one exact server-authoritative intent', () => {
    const router = appRouter(sessionFixture({ status: 'anonymous' }))
    const route = router.resolve('/settings/secret-reference')
    expect(route.name).toBe('secret-reference-publish')
    expect(route.meta).toMatchObject({
      sessionAccess: 'authenticated',
      focusTarget: 'shell-content',
      authorizationIntent: {
        contractId: 'settings.secret-publish',
        permission: 'settings.secret-publish',
      },
      navigation: {
        labelKey: 'navigation.secretReference',
        order: 39,
        source: RSS_SOURCE,
      },
    })
  })

  it('owns Secret Material Reveal as a distinct protected route and intent', () => {
    const router = appRouter(sessionFixture({ status: 'anonymous' }))
    const route = router.resolve('/settings/secret-material')
    expect(route.name).toBe('secret-material-reveal')
    expect(route.meta).toMatchObject({
      sessionAccess: 'authenticated',
      focusTarget: 'shell-content',
      authorizationIntent: {
        contractId: 'settings.secret-resolve',
        permission: 'settings.secret-resolve',
      },
      navigation: {
        labelKey: 'navigation.secretMaterial',
        order: 40,
        source: RSS_SOURCE,
      },
    })
    expect(route.fullPath).not.toContain('key=')
  })

  it('keeps the Identity self-service route session-only while its command owns authorization', () => {
    const router = appRouter(sessionFixture({ status: 'anonymous' }))
    const route = router.resolve('/identity')
    expect(route.name).toBe('identity')
    expect(route.meta).toMatchObject({
      sessionAccess: 'authenticated',
      focusTarget: 'shell-content',
      navigation: { labelKey: 'navigation.identity', order: 10, source: RSS_SOURCE },
    })
    expect(route.meta.authorizationIntent).toBeUndefined()
  })

  it('keeps Account Status session-only while read and write commands own authorization', () => {
    const router = appRouter(sessionFixture({ status: 'anonymous' }))
    const route = router.resolve('/account-status')
    expect(route.name).toBe('account-status')
    expect(route.meta).toMatchObject({
      sessionAccess: 'authenticated',
      focusTarget: 'shell-content',
      navigation: { labelKey: 'navigation.accountStatus', order: 20, source: RSS_SOURCE },
    })
    expect(route.meta.authorizationIntent).toBeUndefined()
  })

  it('keeps Roles session-only while list, assign, and revoke own independent authorization', () => {
    const router = appRouter(sessionFixture({ status: 'anonymous' }))
    const route = router.resolve('/roles')
    expect(route.name).toBe('roles')
    expect(route.meta).toMatchObject({
      sessionAccess: 'authenticated',
      focusTarget: 'shell-content',
      navigation: { labelKey: 'navigation.roles', order: 30, source: RSS_SOURCE },
    })
    expect(route.meta.authorizationIntent).toBeUndefined()
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
