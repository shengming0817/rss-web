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
      path: `${base}/resources`,
      name: 'policy-resources',
      component: () => import('./views/ResourcesView.vue'),
      meta: { protected: true },
    },
    {
      path: `${base}/configurations`,
      name: 'policy-configurations',
      component: () => import('./views/ConfigurationsView.vue'),
      meta: { protected: true },
    },
    {
      path: `${base}/plans`,
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
      path: `${base}/workflows`,
      name: 'policy-workflows',
      component: () => import('./views/WorkflowsView.vue'),
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
    {
      path: `${base}/approvals`,
      name: 'policy-approvals',
      component: () => import('./views/ApprovalsView.vue'),
      meta: { protected: true },
    },
  ],
}
