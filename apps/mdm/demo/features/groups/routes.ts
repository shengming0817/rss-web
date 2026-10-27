import type { Router } from 'vue-router'
/** Demo bootstrap only. Vue Router 4.6.4 matcher.addRoute replaces a same-name record. */
export function registerDemoGroupRoutes(router: Router) {
  const original = router.getRoutes().find((route) => route.name === 'device-groups')
  if (!original) return
  router.addRoute({
    path: original.path,
    name: 'device-groups',
    component: () => import('./GroupsView.vue'),
    meta: { ...original.meta, demo: true },
  })
  const replacement = router.getRoutes().find((route) => route.name === 'device-groups')
  // The shared router may already be resolving the original deep link during composition.
  void router.isReady().then(
    () => {
      const current = router.currentRoute.value
      if (current.name === 'device-groups' && !current.matched.includes(replacement!))
        return router.replace({ path: current.fullPath, force: true })
    },
    () => {},
  )
}
