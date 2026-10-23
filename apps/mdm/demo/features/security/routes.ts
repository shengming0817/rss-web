import type { RouteRecordRaw } from 'vue-router'
export const routes: RouteRecordRaw[] = [
  {
    path: '/tenants/:tenant/security/experience',
    name: 'security-experience',
    component: () => import('./views/ExperienceView.vue'),
    meta: { protected: true },
  },
  {
    path: '/tenants/:tenant/security/support',
    name: 'security-support',
    component: () => import('./views/SupportView.vue'),
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
]
