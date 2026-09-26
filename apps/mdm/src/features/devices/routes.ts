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
