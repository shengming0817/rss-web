import { nextTick } from 'vue'
import type { Router } from 'vue-router'
import type { IdentitySession, IdentitySessionState } from '@rss/identity'

function hasAuthority(state: IdentitySessionState): boolean {
  return state.status === 'authenticated' || state.status === 'refreshing'
}

export function registerSessionRouting(router: Router, session: IdentitySession): () => void {
  const removeGuard = router.beforeEach((to) => {
    const authorized = hasAuthority(session.getState())
    if (to.meta.sessionAccess === 'authenticated' && !authorized) return { name: 'login' }
    if (to.meta.sessionAccess === 'anonymous' && authorized) return { name: 'home' }
    return true
  })
  const unsubscribe = session.subscribe((state) => {
    const route = router.currentRoute.value
    if (route.meta.sessionAccess === 'authenticated' && !hasAuthority(state)) {
      void router.replace({ name: 'login' })
    } else if (route.meta.sessionAccess === 'anonymous' && hasAuthority(state)) {
      void router.replace({ name: 'home' })
    }
  })
  return () => {
    removeGuard()
    unsubscribe()
  }
}

/** Restore keyboard and screen-reader focus after an SPA route transition. */
export function registerRouterA11y(router: Router): void {
  router.afterEach((to) => {
    void nextTick(() => {
      document.getElementById(to.meta.focusTarget)?.focus({ preventScroll: true })
    })
  })
}
