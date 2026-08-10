import { createRouter, type RouteRecordRaw, type RouterHistory } from 'vue-router'
import type { AuthorizationIntent } from '@rss/authorization'
import type { IdentitySession } from '@rss/identity'
import { RSS_SOURCE } from '@rss/shared'
import type { SourceMeta } from '@rss/shared'
import type { AuthorizationExperience } from '../features/authorization/authorization-context'
import { RUNTIME_INVENTORY_INTENT } from '../features/runtime/runtime-intent'
import type { NavigationMessageKey } from './navigation'
import { registerAuthorizationRouting, registerRouterA11y, registerSessionRouting } from './guards'

declare module 'vue-router' {
  interface RouteMeta {
    sessionAccess: 'anonymous' | 'authenticated'
    focusTarget: 'login-content' | 'shell-content'
    authorizationIntent?: AuthorizationIntent
    navigation?: {
      readonly labelKey: NavigationMessageKey
      readonly order: number
      readonly source: SourceMeta
    }
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
        meta: {
          sessionAccess: 'authenticated',
          focusTarget: 'shell-content',
          navigation: { labelKey: 'navigation.home', order: 0, source: RSS_SOURCE },
        },
      },
      {
        path: 'runtime',
        name: 'runtime',
        component: () => import('../features/runtime/RuntimeDetailsView.vue'),
        meta: {
          sessionAccess: 'authenticated',
          focusTarget: 'shell-content',
          authorizationIntent: RUNTIME_INVENTORY_INTENT,
          navigation: { labelKey: 'navigation.runtime', order: 10, source: RSS_SOURCE },
        },
      },
      {
        path: ':pathMatch(.*)*',
        name: 'not-found',
        component: () => import('../views/ErrorView.vue'),
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
