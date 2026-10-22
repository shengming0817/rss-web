import type { MdmFeature } from '../../features'
export const operationsFeature: MdmFeature = {
  entry: {
    path: '/tenants/:tenant/operations',
    name: 'operations-organization',
    component: () => import('./views/OrganizationView.vue'),
    meta: { protected: true },
  },
  routes: [
    {
      path: '/tenants/:tenant/operations/audit',
      name: 'operations-audit',
      component: () => import('./views/AuditView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/operations/diagnostics',
      name: 'operations-diagnostics',
      component: () => import('./views/DiagnosticsView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/operations/windows-entra',
      name: 'operations-windowsEntra',
      component: () => import('../enrollment/views/WindowsEntraView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/operations/apple-account',
      name: 'operations-appleAccount',
      component: () => import('../enrollment/views/AppleAccountView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/operations/apple-ade',
      name: 'operations-appleAde',
      component: () => import('../enrollment/views/AppleAdeView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/operations/authorization',
      name: 'operations-authorization',
      component: () => import('./views/AuthorizationView.vue'),
      meta: { protected: true },
    },
  ],
}
