import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

// Layout fork is structural, not a meta flag (AI-HARD): standalone full-screen
// auth pages are top-level routes rendered directly in App.vue's <RouterView/>;
// every in-shell page is a child of AppShellLayout and inherits the chrome.
const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    // Per-view subpath imports → each view is its own async chunk (visiting
    // /login must not also pull the first-run wizard).
    component: () => import('@gocell/access/views/login'),
    meta: { requiresAuth: false, public: true },
  },
  {
    path: '/first-run-setup',
    name: 'first-run-setup',
    component: () => import('@gocell/access/views/first-run'),
    meta: { requiresAuth: false, public: true },
  },
  {
    path: '/',
    component: () => import('../layouts/AppShellLayout.vue'),
    children: [
      {
        // Health overview (Batch 7 / BR-001/002). Degrades to the unavailable
        // panel when the health endpoints are absent.
        path: '',
        name: 'home',
        component: () => import('@gocell/observability/views/landing'),
        meta: { requiresAuth: true },
      },
      {
        // Access · Identities (Batch 2). Behind the auth gate + the PDP gate:
        // `requiredAction` makes the route fail-closed (guards.ts redirects home
        // until the PDP backend allows `read` on `identity`; BR-004 stub denies
        // until /access/decide lands). Own async chunk via the subpath export.
        path: 'access/identities',
        name: 'access-identities',
        component: () => import('@gocell/access/views/identities'),
        meta: { requiresAuth: true, requiredAction: 'read', requiredResource: 'identity' },
      },
      {
        // Access · Policies (Batch 3). PDP-gated like identities: fail-closed until
        // the /access/decide backend ships (BR-004); meta carries no hardcoded role.
        path: 'access/policies',
        name: 'access-policies',
        component: () => import('@gocell/access/views/policies'),
        meta: { requiresAuth: true, requiredAction: 'read', requiredResource: 'policy' },
      },
      {
        // Wave-2 placeholders (T305): reachable but content is "coming soon".
        path: 'access/decisions',
        name: 'access-decisions',
        component: () => import('@gocell/access/views/coming-soon'),
        props: { titleKey: 'nav.decisions' },
        meta: { requiresAuth: true },
      },
      {
        path: 'access/reviews',
        name: 'access-reviews',
        component: () => import('@gocell/access/views/coming-soon'),
        props: { titleKey: 'nav.reviews' },
        meta: { requiresAuth: true },
      },
      {
        // Operate · Audit log (Batch 4). PDP-gated read on `audit` (fail-closed
        // until the /access/decide backend ships, BR-004); own async chunk via
        // the @gocell/audit/views/audit subpath export.
        path: 'audit',
        name: 'audit',
        component: () => import('@gocell/audit/views/audit'),
        meta: { requiresAuth: true, requiredAction: 'read', requiredResource: 'audit' },
      },
      {
        // Operate · Configuration (Batch 4). PDP-gated read on `config`; own
        // async chunk via the @gocell/config/views/config subpath export.
        path: 'config',
        name: 'config',
        component: () => import('@gocell/config/views/config'),
        meta: { requiresAuth: true, requiredAction: 'read', requiredResource: 'config' },
      },
      {
        // Operate · Feature flags (Batch 4). PDP-gated read on `flag`; flags +
        // config share the @gocell/config cell but resolve as separate chunks.
        path: 'flags',
        name: 'flags',
        component: () => import('@gocell/config/views/flags'),
        meta: { requiresAuth: true, requiredAction: 'read', requiredResource: 'flag' },
      },
      {
        // Operate · Cells list (Batch 5). PDP-gated read on `cell` (fail-closed
        // until /access/decide ships, BR-004). Data is the static build-time
        // manifest derived from cell.yaml — no backend endpoint required.
        path: 'cells',
        name: 'cells',
        component: () => import('@gocell/devboard/views/cells-list'),
        meta: { requiresAuth: true, requiredAction: 'read', requiredResource: 'cell' },
      },
      {
        // Operate · Cell detail (Batch 5). Same PDP gate; 12-tab inspector with
        // the active tab carried in the `?tab=` query param. Own async chunk via
        // the @gocell/devboard/views/cell-detail subpath export.
        path: 'cells/:id',
        name: 'cell-detail',
        component: () => import('@gocell/devboard/views/cell-detail'),
        meta: { requiresAuth: true, requiredAction: 'read', requiredResource: 'cell' },
      },
      {
        // Observability v1 (Batch 7). LGTM signals via the @gocell/request BFF proxy;
        // degrades to the unavailable panel until BR-003 lands. Auth-gated only (no PDP).
        path: 'observe',
        name: 'observe',
        component: () => import('@gocell/observability/views/observe'),
        meta: { requiresAuth: true },
      },
      {
        // Build · Contract registry (Batch 6). Read-only; data derived from the
        // static CELL_MANIFEST (governance gates / response envelopes are a
        // labelled static snapshot). The backend has no `contract` PDP resource
        // yet, so the gate degrades to `cell` — same gate as the cells list.
        path: 'contracts',
        name: 'contracts',
        component: () => import('@gocell/devboard/views/contracts'),
        meta: { requiresAuth: true, requiredAction: 'read', requiredResource: 'cell' },
      },
      {
        // Build · Dependency explorer (Batch 6). Read-only; cell dependency
        // graph derived from CELL_MANIFEST.dependsOnCells. No `dep` PDP resource
        // exists, so the gate degrades to `cell`.
        path: 'deps',
        name: 'deps',
        component: () => import('@gocell/devboard/views/deps'),
        meta: { requiresAuth: true, requiredAction: 'read', requiredResource: 'cell' },
      },
      {
        // Meta · Coverage matrix (Batch 6). gocell-web's own implementation
        // progress board — static, self-referential, with no backend resource
        // to authorize against, so it carries only the auth gate (a PDP
        // `requiredAction` would fail-closed against a non-existent resource).
        path: 'coverage',
        name: 'coverage',
        component: () => import('@gocell/devboard/views/coverage'),
        meta: { requiresAuth: true },
      },
      {
        // Operate · Smart Groups preview (Batch 6). Read-only; static group
        // rules with membership computed live from CELL_MANIFEST. Same `cell`
        // gate degradation as the other devboard views.
        path: 'groups',
        name: 'groups',
        component: () => import('@gocell/devboard/views/groups'),
        meta: { requiresAuth: true, requiredAction: 'read', requiredResource: 'cell' },
      },
    ],
  },
]

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  // SPA 路由切换时滚动到顶部（a11y：确保新视图从顶部开始）
  scrollBehavior: () => ({ top: 0 }),
})
