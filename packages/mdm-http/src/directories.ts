import * as api from '@rss/api/mdm-operations'
import type { DirectoryCapabilities } from '@rss/mdm-devices'

// ref: rss-mdm crates/query/src/directory/field.rs@11559e24b3a82997465d9e36c5611f0f570f60c7
const operations = {
  resources: api.getApiV1Resources,
  devices: api.getApiV1DeviceViews,
  endpoints: api.getApiV1Devices,
  groups: api.getApiV1Groups,
  policies: api.getApiV1Policies,
  certificates: api.getApiV1CertificateArchiveEntries,
  webhooks: api.getApiV1WebhooksSubscriptions,
  ade: api.getApiV1AppleOrganizationsByIdAdeProfiles,
  compliance: api.getApiV1ComplianceRules,
  savedQueries: api.getApiV1SavedQueries,
  userGroups: api.getApiV1AuthorizationUserGroups,
  apiKeys: api.getApiV1ApiKeys,
}
export type DirectoryName = keyof typeof operations
export const directoryCapabilities = Object.freeze(Object.fromEntries(
  Object.entries(operations).map(([name, operation]) => {
    const owner = operation.queryOwner
    if (owner?.kind !== 'directory' || typeof owner.schema['max_limit'] !== 'number')
      throw new Error(`Missing formal directory capabilities: ${name}`)
    return [name, Object.freeze({ fields: owner.schema.fields, maximum: owner.schema['max_limit'] })]
  }),
) as Readonly<Record<DirectoryName, DirectoryCapabilities>>)
