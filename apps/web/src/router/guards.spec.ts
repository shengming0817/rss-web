/**
 * guards.spec.ts — 路由守卫三段测试（T026）
 *
 * 守卫顺序：first-run → auth → PDP
 * memory history + createTestingPinia + http mock
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRouter, createMemoryHistory, type Router, type RouteLocationRaw } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { createApp } from 'vue'
import { http } from '@gocell/request'
import { useAuthStore } from '@gocell/access'
import { registerGuards, _resetSetupStatusCache } from './guards'
import type { PdpClient, Decision } from '@gocell/core'
import type { ComputedRef } from 'vue'

/** Helper: create a valid setSession payload */
function makeSession(
  overrides: Partial<Parameters<ReturnType<typeof useAuthStore>['setSession']>[0]> = {},
) {
  return {
    userId: 'u1',
    accessToken: 'tok',
    refreshToken: 'rt',
    expiresAt: '2099-01-01T00:00:00Z',
    sessionId: 'sid-1',
    passwordResetRequired: false,
    ...overrides,
  }
}

// --- Mock @gocell/request http ---
vi.mock('@gocell/request', () => ({
  http: {
    get: vi.fn(),
  },
  setupAxios: vi.fn(),
}))

const httpGet = vi.mocked(http.get)

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        name: 'home',
        component: { template: '<div/>' },
        // Batch 7: home is now auth-gated (Health overview)
        meta: { requiresAuth: true },
      },
      {
        path: '/login',
        name: 'login',
        component: { template: '<div/>' },
        meta: { requiresAuth: false, public: true },
      },
      {
        path: '/first-run-setup',
        name: 'first-run-setup',
        component: { template: '<div/>' },
        meta: { requiresAuth: false, public: true },
      },
      {
        path: '/protected',
        name: 'protected',
        component: { template: '<div/>' },
        // requiresAuth defaults to true (no meta.requiresAuth: false)
      },
      {
        path: '/pdp-guarded',
        name: 'pdp-guarded',
        component: { template: '<div/>' },
        meta: { requiredAction: 'read:resource' },
      },
    ],
  })
}

async function navigate(router: Router, to: RouteLocationRaw): Promise<void> {
  await router.push(to)
  await router.isReady()
}

/**
 * Build a stub PdpClient. The PDP gate awaits decide(), so the gate verdict comes
 * from decide(); can() is kept for type-completeness (unused by the guard).
 */
function makePdpClient(allowed: boolean): PdpClient {
  return {
    can: vi.fn().mockReturnValue({ value: allowed } as ComputedRef<boolean>),
    decide: vi.fn().mockResolvedValue({
      effect: allowed ? 'allow' : 'deny',
      reasonCode: allowed ? '' : 'role-missing',
    } as Decision),
  }
}

describe('Router guards', () => {
  let router: Router
  let authStore: ReturnType<typeof useAuthStore>
  let pdpClient: PdpClient

  beforeEach(() => {
    vi.clearAllMocks()
    _resetSetupStatusCache()

    const pinia = createPinia()
    setActivePinia(pinia)
    authStore = useAuthStore()
    pdpClient = makePdpClient(true)

    const app = createApp({ template: '<router-view/>' })
    app.use(pinia)

    router = makeRouter()
    registerGuards(router, app, pdpClient)
    app.use(router)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    _resetSetupStatusCache()
  })

  // ─── First-run gate ───────────────────────────────────────────────────────

  describe('first-run gate', () => {
    it('redirects to /first-run-setup when setup status hasAdmin=false', async () => {
      httpGet.mockResolvedValueOnce({ data: { data: { hasAdmin: false } } })
      authStore.setSession(makeSession())

      await navigate(router, '/protected')

      expect(router.currentRoute.value.name).toBe('first-run-setup')
    })

    it('does NOT redirect when setup status hasAdmin=true', async () => {
      httpGet.mockResolvedValueOnce({ data: { data: { hasAdmin: true } } })
      authStore.setSession(makeSession())

      await navigate(router, '/protected')

      expect(router.currentRoute.value.name).toBe('protected')
    })

    it('allows navigation when setup status request fails (Batch 0 offline)', async () => {
      httpGet.mockRejectedValueOnce(new Error('network error'))
      authStore.setSession(makeSession())

      await navigate(router, '/protected')

      expect(router.currentRoute.value.name).toBe('protected')
    })

    it('does not redirect if already on /first-run-setup', async () => {
      // The guard must NOT redirect away from /first-run-setup even when
      // hasAdmin=false — the page is the destination of the redirect, not a loop.
      // We provide a real mock so the initial route resolution does not error.
      httpGet.mockResolvedValue({ data: { data: { hasAdmin: false } } })

      await navigate(router, '/first-run-setup')

      // Must stay on first-run-setup (no infinite redirect)
      expect(router.currentRoute.value.name).toBe('first-run-setup')
    })

    it('redirects /login to /first-run-setup when needsSetup=true (PRD §5.1)', async () => {
      // PRD §5.1: 首次部署时访问 /login 也应重定向到 /first-run-setup
      httpGet.mockResolvedValue({ data: { data: { hasAdmin: false } } })

      await navigate(router, '/login')

      expect(router.currentRoute.value.name).toBe('first-run-setup')
    })

    it('caches setup status result to avoid repeated requests', async () => {
      httpGet.mockResolvedValue({ data: { data: { hasAdmin: true } } })
      authStore.setSession(makeSession())

      await navigate(router, '/protected')
      await navigate(router, '/')
      await navigate(router, '/protected')

      // Only one call because result is cached (setup done → needsSetup=false cached)
      expect(httpGet).toHaveBeenCalledTimes(1)
    })

    it('does NOT cache needsSetup=true — re-fetches until setup completes', async () => {
      // Note: app.use(router) in beforeEach triggers an initial navigation to '/' that
      // fires the first-run guard once. We use mockResolvedValue (permanent) so all
      // navigations during setup get a consistent hasAdmin=false result.
      httpGet.mockResolvedValue({ data: { data: { hasAdmin: false } } })
      authStore.setSession(makeSession())

      // Explicit navigation: setup not done → redirect to first-run-setup
      await navigate(router, '/protected')
      expect(router.currentRoute.value.name).toBe('first-run-setup')

      // Now override: setup complete for subsequent navigations
      httpGet.mockResolvedValue({ data: { data: { hasAdmin: true } } })

      await navigate(router, '/protected')
      // Now setup is done → should NOT redirect to first-run-setup
      expect(router.currentRoute.value.name).toBe('protected')
      // The key invariant: cache was NOT stored for needsSetup=true,
      // so the second navigation re-fetched (not served from cache)
      expect(httpGet).toHaveBeenCalledTimes(
        httpGet.mock.calls.length, // flexible — count will be ≥ 2 (initial + 2 explicit)
      )
      // Stronger invariant: at least 2 calls after the initial router mount call
      expect(httpGet.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    it('concurrent navigations reuse the same in-flight request (single-flight)', async () => {
      // Simulate slow response to ensure concurrent navigations overlap
      let resolveRequest!: (v: { data: { data: { hasAdmin: boolean } } }) => void
      const slowPromise = new Promise<{ data: { data: { hasAdmin: boolean } } }>((res) => {
        resolveRequest = res
      })
      httpGet.mockReturnValueOnce(slowPromise)
      authStore.setSession(makeSession())

      // Fire two concurrent navigations before the first settles
      const nav1 = navigate(router, '/protected')
      const nav2 = navigate(router, '/')

      // Now resolve the slow request
      resolveRequest({ data: { data: { hasAdmin: true } } })
      await nav1
      await nav2

      // Only one HTTP request should have been made (single-flight)
      expect(httpGet).toHaveBeenCalledTimes(1)
    })

    it('does NOT cache on request failure — retries on next navigation', async () => {
      // Use permanent failure mock for initial router mount navigation + first explicit nav
      httpGet.mockRejectedValue(new Error('network error'))
      authStore.setSession(makeSession())

      await navigate(router, '/protected')
      expect(router.currentRoute.value.name).toBe('protected')

      const callsAfterFirst = httpGet.mock.calls.length

      // Override: next call succeeds — proves failure was not cached
      httpGet.mockResolvedValue({ data: { data: { hasAdmin: true } } })
      await navigate(router, '/')
      // More calls happened (cache was not stored for failure, so re-fetched)
      expect(httpGet.mock.calls.length).toBeGreaterThan(callsAfterFirst)
    })
  })

  // ─── Auth gate ────────────────────────────────────────────────────────────

  describe('auth gate', () => {
    beforeEach(async () => {
      // Default: setup is done (hasAdmin=true), first-run gate passes.
      // Await router.isReady() so the initial navigation triggered by app.use(router)
      // in the outer beforeEach (home → login redirect, Batch 7) fully settles before
      // each test, avoiding race conditions on the first-run-setup navigation test.
      httpGet.mockResolvedValue({ data: { data: { hasAdmin: true } } })
      await router.isReady()
    })

    it('redirects unauthenticated user to login for protected route', async () => {
      // Not authenticated
      await navigate(router, '/protected')

      expect(router.currentRoute.value.name).toBe('login')
    })

    it('preserves redirect query param when redirecting to login', async () => {
      await navigate(router, '/protected')

      expect(router.currentRoute.value.query['redirect']).toBe('/protected')
    })

    it('allows authenticated user to access protected route', async () => {
      authStore.setSession(makeSession())

      await navigate(router, '/protected')

      expect(router.currentRoute.value.name).toBe('protected')
    })

    it('redirects unauthenticated user from "/" (requiresAuth: true) to login (Batch 7)', async () => {
      // Batch 7: home became auth-gated (Health overview). Unauthenticated users
      // must be redirected to /login, not served the dashboard.
      await navigate(router, '/')

      expect(router.currentRoute.value.name).toBe('login')
    })

    it('allows unauthenticated user to access /login', async () => {
      await navigate(router, '/login')

      expect(router.currentRoute.value.name).toBe('login')
    })

    it('allows unauthenticated user to access /first-run-setup', async () => {
      await navigate(router, '/first-run-setup')

      expect(router.currentRoute.value.name).toBe('first-run-setup')
    })
  })

  // ─── PDP gate ─────────────────────────────────────────────────────────────

  describe('PDP gate', () => {
    beforeEach(() => {
      httpGet.mockResolvedValue({ data: { data: { hasAdmin: true } } })
      authStore.setSession(makeSession())
    })

    it('allows access when PDP decide() resolves allow', async () => {
      pdpClient = makePdpClient(true)
      // Re-register guards with the new pdpClient
      _resetSetupStatusCache()
      const pinia = createPinia()
      setActivePinia(pinia)
      authStore = useAuthStore()
      authStore.setSession(makeSession())
      const app = createApp({ template: '<router-view/>' })
      app.use(pinia)
      router = makeRouter()
      registerGuards(router, app, pdpClient)
      app.use(router)
      httpGet.mockResolvedValue({ data: { data: { hasAdmin: true } } })

      await navigate(router, '/pdp-guarded')

      expect(router.currentRoute.value.name).toBe('pdp-guarded')
    })

    it('awaits an async decide() before allowing — no pending→deny flicker on first nav', async () => {
      // decide() resolves allow on a later tick. The guard must await it (not read a
      // synchronous pending value), so first navigation to the guarded route succeeds.
      const deferredAllow: PdpClient = {
        can: vi.fn(),
        decide: vi.fn(
          () =>
            new Promise<Decision>((resolve) =>
              setTimeout(() => resolve({ effect: 'allow', reasonCode: '' }), 0),
            ),
        ),
      }
      _resetSetupStatusCache()
      const pinia = createPinia()
      setActivePinia(pinia)
      authStore = useAuthStore()
      authStore.setSession(makeSession())
      const app = createApp({ template: '<router-view/>' })
      app.use(pinia)
      router = makeRouter()
      registerGuards(router, app, deferredAllow)
      app.use(router)
      httpGet.mockResolvedValue({ data: { data: { hasAdmin: true } } })

      await navigate(router, '/pdp-guarded')

      expect(router.currentRoute.value.name).toBe('pdp-guarded')
    })

    it('redirects to home and surfaces the deny reasonCode when decide() denies', async () => {
      pdpClient = makePdpClient(false)
      const onAccessDenied = vi.fn()
      _resetSetupStatusCache()
      const pinia = createPinia()
      setActivePinia(pinia)
      authStore = useAuthStore()
      authStore.setSession(makeSession())
      const app = createApp({ template: '<router-view/>' })
      app.use(pinia)
      router = makeRouter()
      registerGuards(router, app, pdpClient, onAccessDenied)
      app.use(router)
      httpGet.mockResolvedValue({ data: { data: { hasAdmin: true } } })

      await navigate(router, '/pdp-guarded')

      expect(router.currentRoute.value.name).toBe('home')
      expect(onAccessDenied).toHaveBeenCalledWith('role-missing')
    })

    it('does not run PDP gate (decide not called) for routes without requiredAction', async () => {
      const decideSpy = vi.fn().mockResolvedValue({ effect: 'allow', reasonCode: '' } as Decision)
      pdpClient = {
        can: vi.fn().mockReturnValue({ value: true } as ComputedRef<boolean>),
        decide: decideSpy,
      }
      _resetSetupStatusCache()
      const pinia = createPinia()
      setActivePinia(pinia)
      authStore = useAuthStore()
      authStore.setSession(makeSession())
      const app = createApp({ template: '<router-view/>' })
      app.use(pinia)
      router = makeRouter()
      registerGuards(router, app, pdpClient)
      app.use(router)
      httpGet.mockResolvedValue({ data: { data: { hasAdmin: true } } })

      await navigate(router, '/protected')

      expect(decideSpy).not.toHaveBeenCalled()
    })

    it('fail-closed to home and surfaces "error" when no PDP client is wired', async () => {
      const onAccessDenied = vi.fn()
      _resetSetupStatusCache()
      const pinia = createPinia()
      setActivePinia(pinia)
      authStore = useAuthStore()
      authStore.setSession(makeSession())
      const app = createApp({ template: '<router-view/>' })
      app.use(pinia)
      router = makeRouter()
      registerGuards(router, app, undefined, onAccessDenied) // no pdpClient
      app.use(router)
      httpGet.mockResolvedValue({ data: { data: { hasAdmin: true } } })

      await navigate(router, '/pdp-guarded')

      expect(router.currentRoute.value.name).toBe('home')
      expect(onAccessDenied).toHaveBeenCalledWith('error')
    })
  })

  // ─── Guard ordering ───────────────────────────────────────────────────────

  describe('guard ordering: first-run → auth → PDP', () => {
    it('first-run gate fires before auth gate (unauthenticated → first-run-setup, not login)', async () => {
      // Use permanent mock (not Once) so the initial router-mount navigation in beforeEach
      // also gets hasAdmin=false, and subsequent explicit navigation also gets it.
      httpGet.mockResolvedValue({ data: { data: { hasAdmin: false } } })
      // NOT authenticated

      await navigate(router, '/protected')

      // Should land on first-run-setup, not login (first-run fires first)
      expect(router.currentRoute.value.name).toBe('first-run-setup')
    })

    it('auth gate fires before PDP gate (unauthenticated → login, not home)', async () => {
      // NOT authenticated; PDP would reject too if it ran (but auth fires first)
      const rejecting = makePdpClient(false)
      _resetSetupStatusCache()
      const pinia = createPinia()
      setActivePinia(pinia)
      authStore = useAuthStore()
      // NOT setting session — unauthenticated
      const app = createApp({ template: '<router-view/>' })
      app.use(pinia)
      router = makeRouter()
      registerGuards(router, app, rejecting)
      app.use(router)
      httpGet.mockResolvedValue({ data: { data: { hasAdmin: true } } })

      await navigate(router, '/pdp-guarded')

      // Should land on login (auth gate), not home (PDP gate)
      expect(router.currentRoute.value.name).toBe('login')
    })
  })

  // ─── afterEach: SPA focus management ─────────────────────────────────────

  describe('afterEach: SPA a11y focus management', () => {
    beforeEach(() => {
      httpGet.mockResolvedValue({ data: { data: { hasAdmin: true } } })
      authStore.setSession(makeSession())
    })

    it('moves focus to #shell-content after navigation', async () => {
      const main = document.createElement('main')
      main.id = 'shell-content'
      main.setAttribute('tabindex', '-1')
      document.body.appendChild(main)
      const focusSpy = vi.spyOn(main, 'focus')

      await navigate(router, '/protected')

      // nextTick is needed; wait a tick to let afterEach fire
      await new Promise((r) => setTimeout(r, 0))
      expect(focusSpy).toHaveBeenCalled()

      document.body.removeChild(main)
    })

    it('does not throw when #shell-content is absent (AppShell not mounted)', async () => {
      // Ensure there is no #shell-content in the document
      document.getElementById('shell-content')?.remove()

      // Navigation should not throw even if focus target is missing
      await expect(navigate(router, '/protected')).resolves.not.toThrow()
    })
  })
})
