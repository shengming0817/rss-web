import type { RouteRecordRaw } from 'vue-router'
const base = '/tenants/:tenant/policies'
export const routes: RouteRecordRaw[] = [
  {
    path: `${base}/configurations`,
    name: 'policy-configurations',
    component: () => import('./views/ConfigurationsView.vue'),
    meta: { protected: true },
  },
]
