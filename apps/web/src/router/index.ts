import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

// Standalone authentication is rendered outside AppShell. Every product page
// is a child of the shell so chrome, theme, i18n and accessibility stay shared.
const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@gocell/access/views/login'),
    meta: { requiresAuth: false, public: true },
  },
  {
    path: '/',
    component: () => import('../layouts/AppShellLayout.vue'),
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('@gocell/observability/views/landing'),
        meta: { requiresAuth: true },
      },
      {
        path: 'access/identities',
        name: 'access-identities',
        component: () => import('@gocell/access/views/identities'),
        meta: { requiresAuth: true, requiredAction: 'read', requiredResource: 'identity' },
      },
      {
        path: 'access/policies',
        name: 'access-policies',
        component: () => import('@gocell/access/views/policies'),
        meta: { requiresAuth: true, requiredAction: 'read', requiredResource: 'policy' },
      },
      {
        path: 'audit',
        name: 'audit',
        component: () => import('@gocell/audit/views/audit'),
        meta: { requiresAuth: true, requiredAction: 'read', requiredResource: 'audit' },
      },
      {
        path: 'config',
        name: 'config',
        component: () => import('@gocell/config/views/config'),
        meta: { requiresAuth: true, requiredAction: 'read', requiredResource: 'config' },
      },
    ],
  },
]

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})
