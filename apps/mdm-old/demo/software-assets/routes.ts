import type { Router } from 'vue-router'
/** Called only from demo/bootstrap. Production routes never import this module. */
export function registerDemoSoftwareAssetRoutes(router: Router) {
  for (const section of ['assets', 'standards', 'mappings'] as const)
    router.addRoute({
      path: `/tenants/:tenant/software/${section}`,
      name: `software-${section}`,
      component: () => import('./WorkspaceView.vue'),
      props: { section },
      meta: { protected: true },
    })
}
