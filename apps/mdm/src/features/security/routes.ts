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
      path: '/tenants/:tenant/security/certificates',
      name: 'security-certificates',
      component: () => import('./views/CertificatesView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/security/materials',
      name: 'security-materials',
      component: () => import('./views/MaterialsView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/security/risks',
      name: 'security-risks',
      component: () => import('./views/RisksView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/security/actions',
      name: 'security-actions',
      component: () => import('./views/ActionsView.vue'),
      meta: { protected: true },
    },
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
