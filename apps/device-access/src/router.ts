import type { RouteRecordRaw } from 'vue-router'
export const featureRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'overview',
    component: () => import('./features/overview/OverviewView.vue'),
    meta: { protected: true },
  },
  {
    path: '/computers',
    name: 'computers',
    component: () => import('./features/computers/ComputerListView.vue'),
    meta: { protected: true },
  },
  {
    path: '/computers/:deviceId/:tab?',
    name: 'computer',
    component: () => import('./features/computers/ComputerDetailView.vue'),
    meta: { protected: true },
  },
  {
    path: '/configurations',
    name: 'configurations',
    component: () => import('./features/login-configurations/ConfigurationListView.vue'),
    meta: { protected: true },
  },
  {
    path: '/applications',
    name: 'applications',
    component: () => import('./features/applications/ApplicationListView.vue'),
    meta: { protected: true },
  },
  {
    path: '/security',
    name: 'sessions',
    component: () => import('./features/account-security/AccountSecurityView.vue'),
    meta: { protected: true },
  },
  {
    path: '/audit',
    name: 'audit',
    component: () => import('./features/audit/AuditView.vue'),
    meta: { protected: true },
  },
]
