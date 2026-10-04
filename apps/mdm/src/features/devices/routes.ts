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
      path: '/tenants/:tenant/my-enrollments',
      name: 'self-enrollments',
      component: () => import('./views/SelfEnrollmentView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/registration-quotas',
      name: 'registration-quotas',
      component: () => import('./views/QuotaView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/registration-users',
      name: 'registration-users',
      component: () => import('./views/RegistrationUserView.vue'),
      meta: { protected: true },
    },
    {
      path: `${base}/search`,
      name: 'device-search',
      component: () => import('./views/SearchView.vue'),
      meta: { protected: true },
    },
    {
      path: `${base}/groups`,
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
      component: () => import('./views/DetailView.vue'),
      meta: { protected: true },
    },
  ],
}
