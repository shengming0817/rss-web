/**
 * bootstrap.ts — Application assembly layer.
 *
 * Wires:
 *  1. setupAxios: auth callbacks (getToken / onRefresh / onAuthFail)
 *  2. configureAxios() — exposed for testability (stub router, no full app)
 *  3. bootstrapSession() — silent session restore on app start
 *
 * PDP provide is done in main.ts after app creation (requires app instance).
 */
import type { Router } from 'vue-router'
import { setupAxios } from '@gocell/request'
import { useAuthStore } from '@gocell/access'

/**
 * Configure the axios instance with auth callbacks.
 * Must be called AFTER createPinia() + setActivePinia() so useAuthStore() works.
 *
 * @param router — needed for onAuthFail redirect to /login
 */
export function configureAxios(router: Router): void {
  const auth = useAuthStore()

  setupAxios({
    getToken: () => auth.accessToken,
    onRefresh: () => auth.refresh(),
    onAuthFail: () => {
      auth.clearSession()
      // Refresh exhausted → bounce to login with a reason the LoginView surfaces
      // as a "session expired" notice. NavigationFailure (already on /login) is
      // swallowed.
      router.push({ name: 'login', query: { reason: 'expired' } }).catch(() => {
        // Intentionally ignored
      })
    },
    refreshPath: '/sessions/refresh',
  })
}

/** In-flight memo so concurrent / repeat callers share one restore attempt. */
let bootstrapPromise: Promise<void> | null = null

/**
 * Attempt to restore a session on app start via a single refresh, before the
 * first route guard evaluates auth.
 *
 * Idempotent. The backend ships the refresh token as an httpOnly cookie
 * (`__Host-gocell_rt`, BR-005) that survives a reload, so authStore.refresh()
 * renews silently from the cookie even when nothing is in memory: a warm cold
 * load restores the session (guards let protected pages through), while a logged
 * out / no-cookie load fails the refresh and the guards route to /login. Because
 * main.ts awaits this before app.mount(), the first guard runs post-restore —
 * no /login flash. (See issue #12 H2.)
 *
 * auth.refresh() swallows its own errors and is timeout-bounded, so this Promise
 * never rejects: main.ts mounts in `.finally()` without an unhandled rejection,
 * and a dead/slow backend still lets the app mount and route to /login.
 *
 * Must be called AFTER createPinia() so useAuthStore() resolves.
 */
export function bootstrapSession(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise
  const auth = useAuthStore()
  bootstrapPromise = auth.refresh().then(() => undefined)
  return bootstrapPromise
}
