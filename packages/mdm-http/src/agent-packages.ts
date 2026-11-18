import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import { nextCursor, queryParameters } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import type {
  AgentPackagesPort,
  ManagedPackage,
  PackageReceipt,
} from '@rss/mdm-software/agent-packages'
import { requestInput } from './inventory-values'
function managed(value: unknown): ManagedPackage {
  if (!schema.getApiV1TenantsByTenantAgentPackagesByIdResponse.validateRoot(value))
    throw new Error('Invalid Agent package')
  return value
}
function receipt(value: unknown): PackageReceipt | null {
  if (!schema.getApiV1TenantsByTenantAgentPackagesOperationsByIdResponse.validateRoot(value))
    throw new Error('Invalid Agent package operation')
  if (value === null) return null
  if (schema.postApiV1TenantsByTenantAgentPackagesSaveResponse.validateRoot(value)) return value
  if (schema.postApiV1TenantsByTenantAgentPackagesResponse.validateRoot(value)) return value
  if ('withdrawn' in value && typeof value.withdrawn === 'string')
    return { withdrawn: value.withdrawn }
  throw new Error('Operation is not an Agent package receipt')
}
export function createAgentPackagesAdapter(
  transport: HttpTransport,
  tenant: string,
): AgentPackagesPort {
  return {
    list: (cursor, signal) =>
      api.getApiV1TenantsByTenantAgentPackages(
        transport,
        {
          pathParams: { tenant },
          query: queryParameters({ limit: 100, ...(cursor ? { cursor } : {}) }),
          ...(signal ? { signal } : {}),
        },
        (value) => ({ items: value.items.map(managed), nextCursor: nextCursor(value.nextCursor) }),
      ),
    read: (id, signal) =>
      api.getApiV1TenantsByTenantAgentPackagesById(
        transport,
        { pathParams: { tenant, id }, ...(signal ? { signal } : {}) },
        managed,
      ),
    prepare: (input) =>
      api.postApiV1TenantsByTenantAgentPackagesUploads(
        transport,
        { pathParams: { tenant }, body: { ...input, sha256: [...input.sha256] } },
        (value) => {
          const expected = api.getApiV1TenantsByTenantResourcesByIdUploadsByUpload.url({
            tenant,
            id: value.resource,
            upload: value.upload,
          })
          if (value.href !== expected) throw new Error('Unbound installer upload href')
          return value
        },
      ),
    inspect: (id, signal) =>
      api.getApiV1TenantsByTenantAgentPackagesUploadsById(
        transport,
        { pathParams: { tenant, id }, ...(signal ? { signal } : {}) },
        (value) => {
          if (value.packageId !== id) throw new Error('Wrong upload inspection')
          return value
        },
      ),
    parse: (id) =>
      api.postApiV1TenantsByTenantAgentPackagesUploadsById(
        transport,
        { pathParams: { tenant, id } },
        (value) => {
          if (value.packageId !== id) throw new Error('Wrong parsed upload')
          return value
        },
      ),
    save: (input) =>
      api.postApiV1TenantsByTenantAgentPackagesSave(
        transport,
        {
          pathParams: { tenant },
          body: requestInput(
            input,
            schema.postApiV1TenantsByTenantAgentPackagesSaveBody.validateRoot,
          ),
        },
        (value) => value,
      ),
    publish: (operationId, packageId) =>
      api.postApiV1TenantsByTenantAgentPackages(
        transport,
        { pathParams: { tenant }, body: { operationId, packageId } },
        (value) => value,
      ),
    withdraw: (operationId, id) =>
      api.postApiV1TenantsByTenantAgentPackagesByIdWithdraw(transport, {
        pathParams: { tenant, id },
        body: { operationId },
      }),
    operation: (id) =>
      api.getApiV1TenantsByTenantAgentPackagesOperationsById(
        transport,
        { pathParams: { tenant, id } },
        receipt,
      ),
  }
}
