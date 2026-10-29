import type { MdmFeature } from '../../features'

/** The settings composition consumes these canonical pages; device recovery is embedded. */
export const securitySettingsPages = [
  {
    name: 'security-device-trust',
    path: '/tenants/:tenant/settings/device-trust',
    label: 'security.pki.title',
    component: () => import('./pki/TrustView.vue'),
  },
  {
    name: 'security-certificate-archive',
    path: '/tenants/:tenant/settings/certificate-archive',
    label: 'security.certificate-archive',
    component: () => import('./certificate-archive/ArchiveView.vue'),
  },
] as const

export const securityFeature: MdmFeature = {
  entry: {
    path: '/tenants/:tenant/compliance',
    name: 'security-compliance',
    component: () => import('./views/ComplianceView.vue'),
    meta: { protected: true },
  },
  routes: [
    {
      path: '/tenants/:tenant/policies/compliance-rules',
      name: 'security-rules',
      component: () => import('./views/ComplianceRulesView.vue'),
      meta: { protected: true },
    },
    ...securitySettingsPages.map(({ name, path, component }) => ({
      name,
      path,
      component,
      meta: { protected: true },
    })),
  ],
}
