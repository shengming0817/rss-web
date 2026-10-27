import type { MdmFeature } from '../../features'
const base = '/tenants/:tenant/devices'
export const deviceFeature: MdmFeature = {
  entry: {
    path: base,
    name: 'devices',
    component: () => import('./views/DirectoryView.vue'),
    meta: { protected: true },
  },
  routes: [
    {
      path: `${base}/:device/activities`,
      name: 'device-activities',
      component: () => import('../operations/views/ManagementActivitiesView.vue'),
      meta: { protected: true },
    },
    ...[
      { path: `${base}/:device`, name: 'device' },
      { path: '/tenants/:tenant/device-views/:kind/:view', name: 'device-view' },
    ].flatMap(({ path, name }) => [
      {
        path: `${path}/management`,
        name: `${name}-management`,
        component: () => import('./views/DeviceDetailView.vue'),
        meta: { protected: true },
      },
      {
        path: `${path}/history/:history(activity|performance|collection)`,
        name: `${name}-history`,
        component: () => import('./views/DeviceDetailView.vue'),
        meta: { protected: true },
      },
    ]),
    {
      path: '/tenants/:tenant/device-views/:kind/:view',
      name: 'device-view-detail',
      component: () => import('./views/DeviceDetailView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/settings/agent-configurations',
      name: 'agent-configurations',
      component: () => import('../enrollment/views/ConfigurationsView.vue'),
      meta: { protected: true },
    },
    {
      path: '/enroll',
      name: 'self-enrollments',
      component: () => import('./views/SelfEnrollmentView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/settings/registration-quotas',
      name: 'registration-quotas',
      component: () => import('./views/QuotaView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/groups',
      name: 'device-groups',
      component: () => import('./views/GroupsView.vue'),
      meta: { protected: true },
    },
    {
      path: `${base}/enroll`,
      name: 'device-enroll',
      component: () => import('./views/EnrollmentView.vue'),
      meta: { protected: true },
    },
    {
      path: `${base}/:device`,
      name: 'device-detail',
      component: () => import('./views/DeviceDetailView.vue'),
      meta: { protected: true },
    },
  ],
}
