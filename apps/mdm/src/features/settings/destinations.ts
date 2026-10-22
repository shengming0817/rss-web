import type { RouteLocationRaw } from 'vue-router'
export function settingsDestination(target: string, tenant: string): RouteLocationRaw | undefined {
  if (target === 'deviceMaterials') return undefined
  if (target === 'provision' || target === 'registry' || target.startsWith('tenant:'))
    target = 'tenants'
  const routes: Record<string, string> = {
    deployment: 'settings-deployment',
    operations: 'settings-operations',
    tenants: 'settings-tenants',
    accounts: 'accounts',
    'user-attributes': 'settings-user-attributes',
    providers: 'providers',
    ade: 'operations-appleAde',
    appleAccount: 'operations-appleAccount',
    registration: 'registration-quotas',
    organization: 'operations-organization',
  }
  const name = routes[target]
  return name
    ? { name, params: { tenant } }
    : { name: 'settings-material', params: { tenant, material: target } }
}
