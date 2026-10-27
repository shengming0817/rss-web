import { inject, type InjectionKey } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
export interface NavigationItem {
  name: string
  label: string
  path?: string
  query?: Record<string, string>
}
export const navigation: Navigation = [
  {
    id: 'devices',
    label: 'devices.directory',
    items: [{ name: 'devices', label: 'devices.directory' }],
  },
  {
    id: 'groups',
    label: 'console.groups',
    items: [
      {
        name: 'device-groups',
        label: 'console.deviceDynamic',
        query: { category: 'device-dynamic' },
      },
      {
        name: 'device-groups',
        label: 'console.deviceStatic',
        query: { category: 'device-static' },
      },
      { name: 'device-groups', label: 'console.userDynamic', query: { category: 'user-dynamic' } },
      { name: 'device-groups', label: 'console.userStatic', query: { category: 'user-static' } },
    ],
  },
  {
    id: 'policies',
    label: 'policies.policies',
    items: [
      { name: 'policy-policies', label: 'policies.policies' },
      { name: 'policy-resources', label: 'policies.resources' },
      { name: 'policy-telemetry', label: 'telemetry.profiles' },
      { name: 'policy-executions', label: 'policies.executions' },
      { name: 'security-rules', label: 'security.rules' },
      {
        name: 'policy-metrics',
        label: 'telemetry.metricsSettings',
        path: '/tenants/:tenant/policies/metrics',
      },
    ],
  },
  {
    id: 'software',
    label: 'software.catalog',
    items: [
      { name: 'software-catalog', label: 'software.catalog' },
      { name: 'software-publications', label: 'software.publications' },
      { name: 'software-imports', label: 'software.imports' },
    ],
  },
  {
    id: 'security',
    label: 'console.assessments',
    items: [{ name: 'security-compliance', label: 'console.assessments' }],
  },
  {
    id: 'operations',
    label: 'operations.organization',
    items: [
      { name: 'operations-organization', label: 'console.users' },
      { name: 'operations-authorization', label: 'operations.authorization' },
    ],
  },
  {
    id: 'settings',
    label: 'settings.title',
    items: [
      { name: 'settings-overview', label: 'settings.overview' },
      { name: 'settings-guide', label: 'settings.guide' },
      { name: 'settings-access', label: 'settings.access' },
      { name: 'settings-enrollment', label: 'settings.enrollment' },
      { name: 'settings-integrations', label: 'settings.integrations' },
      { name: 'settings-software', label: 'settings.software' },
      { name: 'settings-deployment', label: 'settings.deployment' },
      { name: 'settings-operations', label: 'settings.operations' },
    ],
  },
]
export const platformNavigation: Navigation = [
  {
    ...navigation[navigation.length - 1]!,
    items: navigation[navigation.length - 1]!.items.filter((x) => x.name !== 'settings-guide'),
  },
  {
    id: 'platform',
    label: 'settings.platform',
    items: [
      { name: 'settings-tenants', label: 'settings.tenants' },
      { name: 'operations-organization', label: 'console.users' },
      { name: 'operations-authorization', label: 'operations.authorization' },
    ],
  },
]
export function navigationTarget(item: NavigationItem, tenant: string): RouteLocationRaw {
  if (item.name === 'self-enrollments' || item.name === 'agent-downloads')
    return { name: item.name, ...(item.query ? { query: item.query } : {}) }
  return item.path
    ? { path: item.path.replace(':tenant', tenant), ...(item.query ? { query: item.query } : {}) }
    : { name: item.name, params: { tenant }, ...(item.query ? { query: item.query } : {}) }
}
export const detailParents: Record<string, string> = {
  'device-detail': 'devices',
  'device-management': 'devices',
  'device-history': 'devices',
  'device-view-management': 'devices',
  'device-view-history': 'devices',
  'device-view-detail': 'devices',
  'policy-execution': 'policy-executions',
  'security-device-trust': 'settings-integrations',
  'security-certificate-archive': 'settings-integrations',
  'registration-quotas': 'settings-enrollment',
  'agent-configurations': 'settings-enrollment',
  'software-sources': 'settings-software',
  providers: 'settings-access',
  'operations-appleAccount': 'settings-enrollment',
  'operations-appleAde': 'settings-enrollment',
  'operations-windowsEntra': 'settings-enrollment',
  'operations-audit': 'settings-operations',
  'operations-diagnostics': 'settings-operations',
  'settings-user-attributes': 'settings-access',
}
export const pageLabels: Record<string, string> = {
  'security-device-trust': 'security.pki.title',
  'security-certificate-archive': 'security.certificate-archive',
  'registration-quotas': 'registration.quotas',
  'agent-configurations': 'onboarding.configurations',
  'software-sources': 'software.sources',
  providers: 'identity.providers',
  'operations-appleAccount': 'onboarding.appleAccount',
  'operations-appleAde': 'onboarding.appleAde',
  'operations-windowsEntra': 'onboarding.windowsEntra',
  'operations-audit': 'operations.audit',
  'operations-diagnostics': 'operations.diagnostics',
  'settings-user-attributes': 'profiles.title',
}
export type Navigation = readonly { id: string; label: string; items: readonly NavigationItem[] }[]
export const navigationKey: InjectionKey<Navigation> = Symbol('mdm-navigation')
export const useNavigation = () => inject(navigationKey, navigation)
