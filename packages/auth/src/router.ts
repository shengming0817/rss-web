import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import type { Component } from 'vue'
import type { IdentitySession } from './services/session'
import { loginTarget, type HostLogin } from './context'
import { uuid } from './services/decode'
export interface IdentityRoutePresentation {
  login?: Component
  error?: Component
  /** Product owns its own account-security page. Default Identity/MDM routes are retained. */
  includeManagement?: boolean
}
export function identityRouter(
  session: IdentitySession,
  features: RouteRecordRaw[] = [],
  host?: HostLogin,
  presentation: IdentityRoutePresentation = {},
) {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      ...(features.some((route) => route.path === '/')
        ? []
        : [
            {
              path: '/',
              name: 'entry',
              component: presentation.error ?? (() => import('./views/ErrorView.vue')),
            },
          ]),
      {
        path: '/auth/resume',
        name: 'resume',
        component: presentation.login ?? (() => import('./views/LoginView.vue')),
      },
      {
        path: '/auth/error',
        name: 'error',
        component: presentation.error ?? (() => import('./views/ErrorView.vue')),
      },
      {
        path: host?.path ?? '/tenants/:tenant/login',
        name: 'login',
        component: presentation.login ?? (() => import('./views/LoginView.vue')),
      },
      ...(presentation.includeManagement === false
        ? []
        : [
            {
              path: '/tenants/:tenant/sessions',
              name: 'sessions',
              component: () => import('./views/SessionsView.vue'),
              meta: { protected: true },
            },
            {
              path: '/tenants/:tenant/accounts',
              name: 'accounts',
              component: () => import('./views/AccountsView.vue'),
              meta: { protected: true },
            },
            {
              path: '/tenants/:tenant/providers',
              name: 'providers',
              component: () => import('./views/ProvidersView.vue'),
              meta: { protected: true, oidc: true },
            },
          ]),
      ...features,
      {
        path: '/:pathMatch(.*)*',
        component: presentation.error ?? (() => import('./views/ErrorView.vue')),
      },
    ],
  })
  router.beforeEach(async (to) => {
    if (host && to.params['tenant'] !== undefined && to.params['tenant'] !== host.tenant)
      return { name: 'error' }
    if (to.meta['oidc'] && !session.config.oidcEnabled) return { name: 'error' }
    if (!to.meta['protected']) return true
    let tenant: string
    try {
      tenant = uuid(to.params['tenant'] ?? host?.tenant)
    } catch {
      return { name: 'error' }
    }
    if (session.state.value.tenant !== tenant || session.state.value.status !== 'authenticated') {
      try {
        await session.check(tenant)
      } catch {
        return {
          name: 'error',
          query: { reason: 'unavailable', tenant },
        }
      }
    }
    if (session.state.value.status !== 'authenticated')
      return host ? { name: 'login', query: to.query } : loginTarget(tenant)
    return true
  })
  router.afterEach((to, from, failure) => {
    if (!failure && to.path !== from.path) session.leavePage()
  })
  return router
}
