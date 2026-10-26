import type { MdmFeature } from '../../features'
const base = '/tenants/:tenant/policies'
export const policyFeature: MdmFeature = {
  entry: {
    path: base,
    name: 'policy-scopes',
    component: () => import('./views/ScopesView.vue'),
    meta: { protected: true },
  },
  routes: [
    {
      path: `${base}/tools`,
      name: 'policy-tools',
      component: () => import('./views/ToolsView.vue'),
      meta: { protected: true },
    },
    {
      path: `${base}/events`,
      name: 'policy-events',
      component: () => import('./views/ToolsView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/devices/:device/policy-event-batches',
      name: 'policy-event-batches',
      component: () => import('./views/EventBatchesView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/devices/:device/policy-event-batches/:batch',
      name: 'policy-event-batch',
      component: () => import('./views/EventBatchesView.vue'),
      meta: { protected: true },
    },
    {
      path: `${base}/assignments/lifecycle`,
      name: 'policy-lifecycle',
      component: () => import('./views/LifecyclePoliciesView.vue'),
      meta: { protected: true },
    },
    {
      path: `${base}/resources/telemetry`,
      name: 'policy-telemetry',
      component: () => import('../telemetry/views/ProfilesView.vue'),
      meta: { protected: true },
    },
    {
      path: `${base}/resources`,
      name: 'policy-resources',
      component: () => import('./views/ResourcesView.vue'),
      meta: { protected: true },
    },
    {
      path: `${base}/assignments`,
      name: 'policy-policies',
      component: () => import('./views/PoliciesView.vue'),
      meta: { protected: true },
    },
    {
      path: `${base}/scripts`,
      name: 'policy-scripts',
      component: () => import('./views/ScriptsView.vue'),
      meta: { protected: true },
    },
    {
      path: `${base}/executions`,
      name: 'policy-executions',
      component: () => import('./views/ExecutionsView.vue'),
      meta: { protected: true },
    },
    {
      path: `${base}/executions/:execution`,
      name: 'policy-execution',
      component: () => import('./views/ExecutionDetailView.vue'),
      meta: { protected: true },
    },
  ],
}
