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
      path: '/tenants/:tenant/security/compliance',
      name: 'security-compliance',
      component: () => import('./views/ComplianceView.vue'),
      meta: { protected: true },
    },
  ],
}
