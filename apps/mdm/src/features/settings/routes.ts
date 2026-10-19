import type { MdmFeature } from '../../features'
export const settingsSections = [
  'overview',
  'access',
  'enrollment',
  'integrations',
  'software',
  'deployment',
  'operations',
] as const
const view = () => import('./views/SettingsView.vue')
export const settingsFeature: MdmFeature = {
  entry: {
    path: '/tenants/:tenant/settings',
    name: 'settings-overview',
    component: view,
    meta: { protected: true },
  },
  routes: [
    ...settingsSections
      .filter((section) => section !== 'overview')
      .map((section) => ({
        path: '/tenants/:tenant/settings/' + section,
        name: 'settings-' + section,
        component: view,
        meta: { protected: true },
      })),
    {
      path: '/tenants/:tenant/settings/guide',
      name: 'settings-guide',
      component: view,
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/settings/materials/:material',
      name: 'settings-material',
      component: () => import('./views/MaterialView.vue'),
      meta: { protected: true },
    },
    {
      path: '/tenants/:tenant/settings/tenants',
      name: 'settings-tenants',
      component: () => import('./views/TenantsView.vue'),
      meta: { protected: true },
    },
  ],
}
