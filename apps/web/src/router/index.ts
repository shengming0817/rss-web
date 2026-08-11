import { createRouter, type RouteRecordRaw, type RouterHistory } from 'vue-router'
import type { AuthorizationIntent } from '@rss/authorization'
import type { IdentitySession } from '@rss/identity'
import { MOCK_SOURCE, RSS_SOURCE } from '@rss/shared'
import type { SourceMeta } from '@rss/shared'
import type { AuthorizationExperience } from '../features/authorization/authorization-context'
import { AUDIT_AMBIENT_INTENT } from '../features/audit/audit-intent'
import { RUNTIME_INVENTORY_INTENT } from '../features/runtime/runtime-intent'
import { POLICIES_LIST_INTENT } from '../features/identity/policies-intent'
import { CONFIG_GET_INTENT } from '../features/settings/config-intent'
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

const baseRoutes: RouteRecordRaw[] = [
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
        path: 'identity',
        name: 'identity',
        component: () => import('../features/identity/IdentitySelfServiceView.vue'),
        meta: {
          sessionAccess: 'authenticated',
          focusTarget: 'shell-content',
          navigation: { labelKey: 'navigation.identity', order: 10, source: RSS_SOURCE },
        },
      },
      {
        path: 'account-status',
        name: 'account-status',
        component: () => import('../features/identity/AccountStatusView.vue'),
        meta: {
          sessionAccess: 'authenticated',
          focusTarget: 'shell-content',
          navigation: { labelKey: 'navigation.accountStatus', order: 20, source: RSS_SOURCE },
        },
      },
      {
        path: 'roles',
        name: 'roles',
        component: () => import('../features/identity/RolesView.vue'),
        meta: {
          sessionAccess: 'authenticated',
          focusTarget: 'shell-content',
          navigation: { labelKey: 'navigation.roles', order: 30, source: RSS_SOURCE },
        },
      },
      {
        path: 'policies',
        name: 'policies',
        component: () => import('../features/identity/PoliciesView.vue'),
        meta: {
          sessionAccess: 'authenticated',
          focusTarget: 'shell-content',
          authorizationIntent: POLICIES_LIST_INTENT,
          navigation: { labelKey: 'navigation.policies', order: 35, source: RSS_SOURCE },
        },
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('../features/settings/ConfigView.vue'),
        meta: {
          sessionAccess: 'authenticated',
          focusTarget: 'shell-content',
          authorizationIntent: CONFIG_GET_INTENT,
          navigation: { labelKey: 'navigation.settings', order: 38, source: RSS_SOURCE },
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
          navigation: { labelKey: 'navigation.runtime', order: 40, source: RSS_SOURCE },
        },
      },
      {
        path: 'audit',
        name: 'audit',
        component: () => import('../features/audit/AuditEntriesView.vue'),
        meta: {
          sessionAccess: 'authenticated',
          focusTarget: 'shell-content',
          authorizationIntent: AUDIT_AMBIENT_INTENT,
          navigation: { labelKey: 'navigation.audit', order: 50, source: RSS_SOURCE },
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

export interface AppRouterOptions {
  readonly configCatalogPreview: boolean
  readonly roleBindingsPreview: boolean
}

function routes(options: AppRouterOptions): RouteRecordRaw[] {
  return baseRoutes.map((route) => {
    if (route.path !== '/' || route.children === undefined) return route
    const catchAll = route.children.at(-1)!
    const children = route.children.slice(0, -1)
    if (options.roleBindingsPreview) {
      children.push({
        path: 'preview/role-bindings',
        name: 'role-bindings-preview',
        component: () => import('../features/identity/RoleBindingsPreviewView.vue'),
        meta: {
          sessionAccess: 'authenticated',
          focusTarget: 'shell-content',
          navigation: {
            labelKey: 'navigation.roleBindingsPreview',
            order: 35,
            source: MOCK_SOURCE,
          },
        },
      })
    }
    if (options.configCatalogPreview) {
      children.push({
        path: 'preview/config-catalog',
        name: 'config-catalog-preview',
        component: () => import('../features/settings/ConfigCatalogPreviewView.vue'),
        meta: {
          sessionAccess: 'authenticated',
          focusTarget: 'shell-content',
          navigation: {
            labelKey: 'navigation.configCatalogPreview',
            order: 39,
            source: MOCK_SOURCE,
          },
        },
      })
    }
    children.push(catchAll)
    return { ...route, children }
  })
}

export function createAppRouter(
  session: IdentitySession,
  authorization: AuthorizationExperience,
  history: RouterHistory,
  options: AppRouterOptions = { configCatalogPreview: false, roleBindingsPreview: false },
) {
  const router = createRouter({
    history,
    routes: routes(options),
    scrollBehavior: () => ({ top: 0 }),
  })
  registerSessionRouting(router, session)
  registerAuthorizationRouting(router, authorization)
  registerRouterA11y(router)
  return router
}
