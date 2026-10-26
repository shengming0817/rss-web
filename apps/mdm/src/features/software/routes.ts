import type { MdmFeature } from '../../features'
export const softwareFeature: MdmFeature = {
  entry: {
    path: '/tenants/:tenant/software',
    name: 'software-catalog',
    component: () => import('./views/CatalogView.vue'),
    meta: { protected: true },
  },
  routes: [
    {
      path: '/tenants/:tenant/settings/software-sources',
      name: 'software-sources',
      component: () => import('./views/SourcesView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/software/imports',
      name: 'software-imports',
      component: () => import('./views/ImportsView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/software/publications',
      name: 'software-publications',
      component: () => import('./views/PublicationsView.vue'),
      meta: { protected: true },
    },
  ],
}
