import type { RouteLocationRaw } from 'vue-router'
export function settingsDestination(target: string, tenant: string): RouteLocationRaw | undefined {
  if (target === 'deviceMaterials') return undefined
  if (target === 'provision' || target === 'registry' || target.startsWith('tenant:'))
    target = 'tenants'
  const routes: Record<string, string> = {
    pki: 'security-device-trust',
    deployment: 'settings-deployment',
    connections: 'settings-deployment',
    operations: 'settings-operations',
    tenants: 'settings-tenants',
    accounts: 'operations-organization',
    'user-attributes': 'settings-user-attributes',
    providers: 'providers',
    ade: 'operations-appleAde',
    appleAccount: 'operations-appleAccount',
    registration: 'registration-quotas',
    organization: 'operations-organization',
    agent: 'agent-configurations',
    sources: 'software-sources',
    archive: 'security-certificate-archive',
    recovery: 'devices',
    entra: 'operations-windowsEntra',
    audit: 'operations-audit',
    diagnostics: 'operations-diagnostics',
  }
  const name = routes[target]
  return name
    ? { name, params: { tenant } }
    : { name: 'settings-material', params: { tenant, material: target } }
}
