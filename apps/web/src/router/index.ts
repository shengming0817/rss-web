import { createRouter, type RouteRecordRaw, type RouterHistory } from 'vue-router'
import type { AuthorizationIntent } from '@rss/authorization'
import type { IdentitySession } from '@rss/identity'
import type { AuthorizationExperience } from '../features/authorization/authorization-context'
import { registerAuthorizationRouting, registerRouterA11y, registerSessionRouting } from './guards'

declare module 'vue-router' {
  interface RouteMeta {
    sessionAccess: 'anonymous' | 'authenticated'
    focusTarget: 'login-content' | 'shell-content'
    authorizationIntent?: AuthorizationIntent
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../features/identity/LoginView.vue'),
    meta: { sessionAccess: 'anonymous', focusTarget: 'login-content' },
  },
  {
    path: '/',
    component: () => import('../layouts/AppShellLayout.vue'),
    meta: { sessionAccess: 'authenticated', focusTarget: 'shell-content' },
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('../views/HomeView.vue'),
        meta: { sessionAccess: 'authenticated', focusTarget: 'shell-content' },
      },
    ],
  },
]

export function createAppRouter(
  session: IdentitySession,
  authorization: AuthorizationExperience,
  history: RouterHistory,
) {
  const router = createRouter({
    history,
    routes,
    scrollBehavior: () => ({ top: 0 }),
  })
  registerSessionRouting(router, session)
  registerAuthorizationRouting(router, authorization)
  registerRouterA11y(router)
  return router
}
