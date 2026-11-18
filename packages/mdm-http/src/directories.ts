import * as api from '@rss/api/mdm-operations'
import type { DirectoryCapabilities } from '@rss/mdm-devices'

// ref: rss-mdm crates/query/src/directory/field.rs@11559e24b3a82997465d9e36c5611f0f570f60c7
const operations = {
  resources: api.getApiV1TenantsByTenantResources,
  devices: api.getApiV1TenantsByTenantDeviceViews,
  endpoints: api.getApiV1TenantsByTenantDevices,
  groups: api.getApiV1TenantsByTenantGroups,
  policies: api.getApiV1TenantsByTenantPolicies,
  certificates: api.getApiV1TenantsByTenantCertificateArchiveEntries,
  webhooks: api.getApiV1TenantsByTenantWebhooksSubscriptions,
  ade: api.getApiV1TenantsByTenantAppleOrganizationsByIdAdeProfiles,
  compliance: api.getApiV1TenantsByTenantComplianceRules,
  savedQueries: api.getApiV1TenantsByTenantSavedQueries,
  userGroups: api.getApiV1TenantsByTenantAuthorizationUserGroups,
  apiKeys: api.getApiV1TenantsByTenantApiKeys,
}
export type DirectoryName = keyof typeof operations
export const directoryCapabilities = Object.freeze(
  Object.fromEntries(
    Object.entries(operations).map(([name, operation]) => {
      const owner = operation.queryOwner
      if (owner?.kind !== 'directory' || typeof owner.schema['max_limit'] !== 'number')
        throw new Error(`Missing formal directory capabilities: ${name}`)
      return [
        name,
        Object.freeze({
          fields: owner.schema.fields,
          maximum: Math.min(1000, owner.schema['max_limit']),
        }),
      ]
    }),
  ) as Readonly<Record<DirectoryName, DirectoryCapabilities>>,
)
