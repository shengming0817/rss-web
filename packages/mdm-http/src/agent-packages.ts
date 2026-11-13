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
  if (!schema.getApiV1AgentPackagesByIdResponse.validateRoot(value))
    throw new Error('Invalid Agent package')
  return value
}
function receipt(value: unknown): PackageReceipt | null {
  if (!schema.getApiV1AgentPackagesOperationsByIdResponse.validateRoot(value))
    throw new Error('Invalid Agent package operation')
  if (value === null) return null
  if (schema.postApiV1AgentPackagesSaveResponse.validateRoot(value)) return value
  if (schema.postApiV1AgentPackagesResponse.validateRoot(value)) return value
  if ('withdrawn' in value && typeof value.withdrawn === 'string')
    return { withdrawn: value.withdrawn }
  throw new Error('Operation is not an Agent package receipt')
}
export function createAgentPackagesAdapter(transport: HttpTransport): AgentPackagesPort {
  return {
    list: (cursor, signal) =>
      api.getApiV1AgentPackages(
        transport,
        {
          query: queryParameters({ limit: 50, ...(cursor ? { cursor } : {}) }),
          ...(signal ? { signal } : {}),
        },
        (value) => ({ items: value.items.map(managed), nextCursor: nextCursor(value.nextCursor) }),
      ),
    read: (id, signal) =>
      api.getApiV1AgentPackagesById(
        transport,
        { pathParams: { id }, ...(signal ? { signal } : {}) },
        managed,
      ),
    prepare: (input) =>
      api.postApiV1AgentPackagesUploads(
        transport,
        { body: { ...input, sha256: [...input.sha256] } },
        (value) => {
          const expected = `/api/v1/resources/${encodeURIComponent(value.resource)}/uploads/${encodeURIComponent(value.upload)}`
          if (value.href !== expected) throw new Error('Unbound installer upload href')
          return value
        },
      ),
    inspect: (id, signal) =>
      api.getApiV1AgentPackagesUploadsById(
        transport,
        { pathParams: { id }, ...(signal ? { signal } : {}) },
        (value) => {
          if (value.packageId !== id) throw new Error('Wrong upload inspection')
          return value
        },
      ),
    parse: (id) =>
      api.postApiV1AgentPackagesUploadsById(transport, { pathParams: { id } }, (value) => {
        if (value.packageId !== id) throw new Error('Wrong parsed upload')
        return value
      }),
    save: (input) =>
      api.postApiV1AgentPackagesSave(
        transport,
        { body: requestInput(input, schema.postApiV1AgentPackagesSaveBody.validateRoot) },
        (value) => value,
      ),
    publish: (operationId, packageId) =>
      api.postApiV1AgentPackages(transport, { body: { operationId, packageId } }, (value) => value),
    withdraw: (operationId, id) =>
      api.postApiV1AgentPackagesByIdWithdraw(transport, {
        pathParams: { id },
        body: { operationId },
      }),
    operation: (id) =>
      api.getApiV1AgentPackagesOperationsById(transport, { pathParams: { id } }, receipt),
  }
}
