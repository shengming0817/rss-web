import type { RouteRecordRaw } from 'vue-router'
export const routes: RouteRecordRaw[] = [
  {
    path: '/tenants/:tenant/operations/delegations',
    name: 'operations-delegations',
    component: () => import('./views/DelegationsView.vue'),
    meta: { protected: true },
  },
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
    path: '/tenants/:tenant/operations/reports',
    name: 'operations-reports',
    component: () => import('./views/ReportsView.vue'),
    meta: { protected: true },
  },
  {
    path: '/tenants/:tenant/operations/alerts',
    name: 'operations-alerts',
    component: () => import('./views/AlertsView.vue'),
    meta: { protected: true },
  },
]
