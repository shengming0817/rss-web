export interface NavigationItem {
  name: string
  label: string
}
export const navigation = [
  {
    id: 'devices',
    label: 'devices.directory',
    items: [
      { name: 'devices', label: 'devices.directory' },
      { name: 'device-search', label: 'devices.search' },
      { name: 'device-groups', label: 'devices.groups' },
      { name: 'device-enroll', label: 'devices.enroll' },
      { name: 'registration-quotas', label: 'registration.quotas' },
      { name: 'agent-configurations', label: 'onboarding.configurations' },
    ],
  },
  {
    id: 'policies',
    label: 'policies.policies',
    items: [
      { name: 'policy-policies', label: 'policies.policies' },
      { name: 'policy-scopes', label: 'policies.scopes' },
      { name: 'policy-resources', label: 'policies.resources' },
      { name: 'policy-telemetry', label: 'telemetry.profiles' },
      { name: 'policy-configurations', label: 'policies.configurations' },
      { name: 'policy-scripts', label: 'policies.scripts' },
      { name: 'policy-executions', label: 'policies.executions' },
    ],
  },
  {
    id: 'software',
    label: 'software.catalog',
    items: [
      { name: 'software-catalog', label: 'software.catalog' },
      { name: 'software-deployments', label: 'software.deployments' },
      { name: 'software-publications', label: 'software.publications' },
      { name: 'software-imports', label: 'software.imports' },
      { name: 'software-sources', label: 'software.sources' },
      { name: 'software-updates', label: 'software.updates' },
      { name: 'software-bootstrap', label: 'software.bootstrap' },
    ],
  },
  {
    id: 'security',
    label: 'security.compliance',
    items: [
      { name: 'security-compliance', label: 'security.compliance' },
      { name: 'security-risks', label: 'security.risks' },
      { name: 'security-baselines', label: 'security.baselines' },
      { name: 'security-rules', label: 'security.rules' },
      { name: 'security-actions', label: 'security.actions' },
      { name: 'security-requests', label: 'security.requests' },
      { name: 'security-certificates', label: 'security.certificates' },
      { name: 'security-recovery', label: 'security.pki.recover' },
      { name: 'security-device-trust', label: 'security.pki.title' },
      { name: 'security-certificate-archive', label: 'security.certificate-archive' },
      { name: 'security-materials', label: 'security.materials' },
      { name: 'security-support', label: 'security.support' },
      { name: 'security-experience', label: 'security.experience' },
    ],
  },
  {
    id: 'operations',
    label: 'operations.organization',
    items: [
      { name: 'operations-organization', label: 'operations.organization' },
      { name: 'operations-authorization', label: 'operations.authorization' },
      { name: 'operations-appleAccount', label: 'onboarding.appleAccount' },
      { name: 'operations-appleAde', label: 'onboarding.appleAde' },
      { name: 'operations-windowsEntra', label: 'onboarding.windowsEntra' },
      { name: 'operations-delegations', label: 'operations.delegations' },
      { name: 'operations-audit', label: 'operations.audit' },
      { name: 'operations-diagnostics', label: 'operations.diagnostics' },
      { name: 'operations-alerts', label: 'operations.alerts' },
      { name: 'operations-alertRules', label: 'operations.alertRules' },
      { name: 'operations-reports', label: 'operations.reports' },
    ],
  },
  {
    id: 'settings',
    label: 'settings.title',
    items: [
      { name: 'settings-overview', label: 'settings.overview' },
      { name: 'settings-metrics', label: 'telemetry.metricsSettings' },
      { name: 'settings-access', label: 'settings.access' },
      { name: 'settings-enrollment', label: 'settings.enrollment' },
      { name: 'settings-integrations', label: 'settings.integrations' },
      { name: 'settings-software', label: 'settings.software' },
      { name: 'settings-deployment', label: 'settings.deployment' },
      { name: 'settings-operations', label: 'settings.operations' },
    ],
  },
] as const
export const platformNavigation = [
  {
    ...navigation[navigation.length - 1]!,
    items: navigation[navigation.length - 1]!.items.filter((x) => x.name !== 'settings-metrics'),
  },
  {
    id: 'platform',
    label: 'settings.platform',
    items: [
      { name: 'settings-tenants', label: 'settings.tenants' },
      { name: 'operations-authorization', label: 'operations.authorization' },
    ],
  },
]
export const detailParents: Record<string, string> = {
  'device-detail': 'devices',
  'device-management': 'devices',
  'device-history': 'devices',
  'device-view-detail': 'devices',
  'device-view-management': 'devices',
  'device-view-history': 'devices',
  'policy-execution': 'policy-executions',
}
