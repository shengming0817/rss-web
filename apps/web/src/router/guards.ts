import { nextTick } from 'vue'
import type { RouteLocationNormalized, Router } from 'vue-router'
import type { IdentitySession, IdentitySessionState } from '@rss/identity'
import type { AuthorizationExperience } from '../features/authorization/authorization-context'

function hasAuthority(state: IdentitySessionState): boolean {
  return state.status === 'authenticated' || state.status === 'refreshing'
}

export function registerSessionRouting(router: Router, session: IdentitySession): () => void {
  const authorize = (to: RouteLocationNormalized) => {
    const authorized = hasAuthority(session.getState())
    if (to.meta.sessionAccess === 'authenticated' && !authorized) return { name: 'login' }
    if (to.meta.sessionAccess === 'anonymous' && authorized) return { name: 'home' }
    return true
  }
  const removeEntryGuard = router.beforeEach(authorize)
  // Re-check after async route components resolve so revoked authority cannot
  // commit a navigation that passed the entry guard with stale state.
  const removeCommitGuard = router.beforeResolve(authorize)
  const unsubscribe = session.subscribe((state) => {
    const route = router.currentRoute.value
    if (route.meta.sessionAccess === 'authenticated' && !hasAuthority(state)) {
      void router.replace({ name: 'login' })
    } else if (route.meta.sessionAccess === 'anonymous' && hasAuthority(state)) {
      void router.replace({ name: 'home' })
    }
  })
  return () => {
    removeEntryGuard()
    removeCommitGuard()
    unsubscribe()
  }
}

export function registerAuthorizationRouting(
  router: Router,
  authorization: AuthorizationExperience,
): () => void {
  return router.beforeEach((to) => {
    const intent = to.meta.authorizationIntent
    if (intent === undefined) return true
    return authorization.getHint(intent).decision === 'deny' ? { name: 'home' } : true
  })
}

/** Restore keyboard and screen-reader focus after an SPA route transition. */
export function registerRouterA11y(router: Router): void {
  router.afterEach((to) => {
    void nextTick(() => {
      document.getElementById(to.meta.focusTarget)?.focus({ preventScroll: true })
    })
  })
}
