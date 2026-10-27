import type { MdmFeature } from '../../features'
import LoginView from './views/LoginView.vue'
import ErrorView from './views/ErrorView.vue'
export const operationsFeature: MdmFeature = {
  identityPresentation: { login: LoginView, error: ErrorView, includeManagement: false },
  entry: {
    path: '/tenants/:tenant/operations',
    name: 'operations-organization',
    component: () => import('./views/OrganizationView.vue'),
    meta: { protected: true },
  },
  routes: [
    {
      path: '/tenants/:tenant/sessions',
      name: 'sessions',
      component: () => import('./views/AccountSecurityView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/settings/providers',
      name: 'providers',
      component: () => import('./views/ProvidersView.vue'),
      meta: { protected: true, oidc: true },
    },
    {
      path: '/tenants/:tenant/settings/audit',
      name: 'operations-audit',
      component: () => import('./views/AuditView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/settings/diagnostics',
      name: 'operations-diagnostics',
      component: () => import('./views/DiagnosticsView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/settings/windows-entra',
      name: 'operations-windowsEntra',
      component: () => import('../enrollment/views/WindowsEntraView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/settings/apple-account',
      name: 'operations-appleAccount',
      component: () => import('../enrollment/views/AppleAccountView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/settings/apple-ade',
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
