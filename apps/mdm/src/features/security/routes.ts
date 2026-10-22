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
      path: '/tenants/:tenant/security/recovery',
      name: 'security-recovery',
      component: () => import('./pki/RecoveryView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/security/device-trust',
      name: 'security-device-trust',
      component: () => import('./pki/TrustView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/security/certificate-archive',
      name: 'security-certificate-archive',
      component: () => import('./certificate-archive/ArchiveView.vue'),
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
