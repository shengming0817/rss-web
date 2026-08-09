import { nextTick } from 'vue'
import type { Router } from 'vue-router'

/** Restore keyboard and screen-reader focus after an SPA route transition. */
export function registerRouterA11y(router: Router): void {
  router.afterEach(() => {
    void nextTick(() => {
      document.getElementById('shell-content')?.focus({ preventScroll: true })
    })
  })
}
