import { createRouter, createWebHistory } from 'vue-router'
import type { IdentitySession } from './services/session'
import { uuid } from './services/decode'
import { operationQuery } from './services/navigation'
export function identityRouter(session: IdentitySession) {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      {
        path: '/tenants/:tenant/platform',
        name: 'platform',
        component: () => import('./views/PlatformView.vue'),
        meta: { protected: true },
      },
      { path: '/', name: 'entry', component: () => import('./views/ErrorView.vue') },
      { path: '/login', name: 'hydra-login', component: () => import('./views/LoginView.vue') },
      { path: '/consent', name: 'hydra-consent', component: () => import('./views/LoginView.vue') },
      { path: '/auth/resume', name: 'resume', component: () => import('./views/LoginView.vue') },
      { path: '/auth/error', name: 'error', component: () => import('./views/ErrorView.vue') },
      {
        path: '/tenants/:tenant/login',
        name: 'login',
        component: () => import('./views/LoginView.vue'),
      },
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
        meta: { protected: true },
      },
      { path: '/:pathMatch(.*)*', component: () => import('./views/ErrorView.vue') },
    ],
  })
  router.beforeEach(async (to) => {
    if (!to.meta['protected']) return true
    let tenant: string
    try {
      tenant = uuid(to.params['tenant'])
    } catch {
      return { name: 'error' }
    }
    if (session.state.value.tenant !== tenant || session.state.value.status !== 'authenticated') {
      try {
        await session.check(tenant)
      } catch {
        return {
          name: 'error',
          query: { reason: 'unavailable', tenant, ...operationQuery(to.query) },
        }
      }
    }
    if (session.state.value.status !== 'authenticated')
      return {
        name: 'login',
        params: { tenant },
        query: { reason: 'expired', ...operationQuery(to.query) },
      }
    return true
  })
  router.afterEach((to, from, failure) => {
    if (!failure && to.path !== from.path) session.leavePage()
  })
  return router
}
