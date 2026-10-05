import type { MdmFeature } from '../../features'
export const softwareFeature: MdmFeature = {
  entry: {
    path: '/tenants/:tenant/software',
    name: 'software-sources',
    component: () => import('./views/SourcesView.vue'),
    meta: { protected: true },
  },
  routes: [
    {
      path: '/tenants/:tenant/software/bootstrap',
      name: 'software-bootstrap',
      component: () => import('./views/BootstrapView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/software/updates',
      name: 'software-updates',
      component: () => import('./views/UpdatesView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/software/deployments',
      name: 'software-deployments',
      component: () => import('./views/DeploymentsView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/software/imports',
      name: 'software-imports',
      component: () => import('./views/ImportsView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/software/catalog',
      name: 'software-catalog',
      component: () => import('./views/CatalogView.vue'),
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
