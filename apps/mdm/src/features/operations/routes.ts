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
      path: '/tenants/:tenant/operations/alert-rules',
      name: 'operations-alertRules',
      component: () => import('./views/AlertRulesView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/operations/audit',
      name: 'operations-audit',
      component: () => import('./views/AuditView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/operations/authorization',
      name: 'operations-authorization',
      component: () => import('./views/AuthorizationView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/operations/reports',
      name: 'operations-reports',
      component: () => import('./views/ReportsView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/operations/integrations',
      name: 'operations-integrations',
      component: () => import('./views/IntegrationsView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/operations/settings',
      name: 'operations-settings',
      component: () => import('./views/SettingsView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/operations/approvals',
      name: 'operations-approvals',
      component: () => import('./views/ApprovalsView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/operations/alerts',
      name: 'operations-alerts',
      component: () => import('./views/AlertsView.vue'),
      meta: { protected: true },
    },
  ],
}
