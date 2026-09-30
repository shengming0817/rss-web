import type { MdmFeature } from '../../features'
export const securityFeature: MdmFeature = {
  entry: {
    path: '/tenants/:tenant/security',
    name: 'security-rules',
    component: () => import('./views/ComplianceRulesView.vue'),
    meta: { protected: true },
  },
  routes: [
    {
      path: '/tenants/:tenant/security/baselines',
      name: 'security-baselines',
      component: () => import('./views/BaselinesView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/security/requests',
      name: 'security-requests',
      component: () => import('./views/RequestsView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/security/compliance',
      name: 'security-compliance',
      component: () => import('./views/ComplianceView.vue'),
      meta: { protected: true },
    },
  ],
}
