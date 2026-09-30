import type { MdmFeature } from '../../features'
export const operationsFeature: MdmFeature = {
  entry: {
    path: '/tenants/:tenant/operations',
    name: 'operations-audit',
    component: () => import('./views/AuditView.vue'),
    meta: { protected: true },
  },
  routes: [
    {
      path: '/tenants/:tenant/operations/alerts',
      name: 'operations-alerts',
      component: () => import('./views/AlertsView.vue'),
      meta: { protected: true },
    },
  ],
}
