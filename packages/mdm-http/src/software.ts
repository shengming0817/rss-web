import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import { projectedPage, queryParameters } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import type { SoftwareSource } from '@rss/mdm-resources'
import { resourceId } from '@rss/mdm-resources'
import {
  validateSource,
  type Lifecycle,
  type SoftwarePort,
  type SourceDefinition,
  type SourceView,
  type SourceRow,
} from '@rss/mdm-software'
import { count, enumeration, nullable, text, uuid } from './decode'
import { requestInput } from './inventory-values'
import { resourceDigest, resourcePresentation } from './resource-values'

export function softwareSource(value: unknown): SoftwareSource {
  if (!schema.postApiV1TenantsByTenantResourcesByIdBody.validateSoftwareSource(value))
    throw new Error('Invalid software source snapshot')
  return {
    id: resourceId(value.id),
    revision: resourceId(value.revision),
    sha256: resourceDigest(value.sha256),
  }
}
function sourceDefinition(value: unknown): SourceDefinition {
  if (!schema.getApiV1TenantsByTenantSoftwareSourcesResponse.validateSourceDefinition(value))
    throw new Error('Invalid software source definition')
  const result = structuredClone(value)
  validateSource(result)
  return result
}
function lifecycle(value: unknown): Lifecycle {
  if (!schema.getApiV1TenantsByTenantSoftwareSourcesResponse.validateLifecycle(value))
    throw new Error('Invalid software lifecycle')
  return {
    revision: count(value.revision),
    state: value.state,
    operation: uuid(value.operation),
    actor: text(value.actor),
    at: count(value.at),
    digest: resourceDigest(value.digest),
  }
}
function sourceView(value: unknown, id: string, revision: string): SourceView {
  if (
    !schema.getApiV1TenantsByTenantSoftwareSourcesByIdRevisionsByRevisionResponse.validateRoot(
      value,
    )
  )
    throw new Error('Invalid source view')
  const source = sourceDefinition(value.source),
    snapshot = softwareSource(value.snapshot)
  if (
    source.id !== id ||
    source.revision !== revision ||
    snapshot.id !== id ||
    snapshot.revision !== revision
  )
    throw new Error('Wrong source revision')
  return { source, snapshot, lifecycle: lifecycle(value.lifecycle) }
}
const sourceFields = {
  id: text,
  revision: text,
  protocol: (value: unknown) =>
    enumeration(value, ['private', 'winget_rest', 'winget_community', 'brew_tap'] as const),
  state: (value: unknown) => enumeration(value, ['enabled', 'disabled'] as const),
  source: sourceDefinition,
  snapshot: softwareSource,
  lifecycle,
}
const versionFields = {
  resource: text,
  version: text,
  state: (value: unknown) =>
    enumeration(value, ['frozen', 'active', 'deprecated', 'archived'] as const),
}
/** Sources, exact import and software admission never create a second Resource catalog. */
export function createSoftwareAdapter(transport: HttpTransport, tenant: string): SoftwarePort {
  return {
    sources: (query) => {
      const selected = query.fields
        ? [...new Set<keyof SourceRow>(['id', 'revision', ...query.fields])]
        : undefined
      return api.getApiV1TenantsByTenantSoftwareSources(
        transport,
        {
          pathParams: { tenant },
          query: queryParameters({
            ...query,
            ...(selected ? { fields: selected } : {}),
          }),
        },
        (value) => projectedPage(value, sourceFields, selected, ['id', 'revision']),
      )
    },
    source: (id, revision) =>
      api.getApiV1TenantsByTenantSoftwareSourcesByIdRevisionsByRevision(
        transport,
        { pathParams: { tenant, id, revision } },
        (value) => sourceView(value, id, revision),
      ),
    changeSource: (id, revision, change) =>
      api.postApiV1TenantsByTenantSoftwareSourcesByIdRevisionsByRevision(
        transport,
        {
          pathParams: { tenant, id, revision },
          body: requestInput(
            change,
            schema.postApiV1TenantsByTenantSoftwareSourcesByIdRevisionsByRevisionBody.validateRoot,
          ),
        },
        (value) => sourceView(value, id, revision),
      ),
    import: (change) =>
      api.postApiV1TenantsByTenantSoftwareImports(
        transport,
        {
          pathParams: { tenant },
          body: requestInput(
            change,
            schema.postApiV1TenantsByTenantSoftwareImportsBody.validateRoot,
          ),
        },
        (value) => ({
          resource: resourceId(value.resource),
          version: resourceId(value.version),
          resourceDigest: resourceDigest(value.resourceDigest),
          storageRevision: count(value.storageRevision),
        }),
      ),
    versions: (id, query) =>
      api.getApiV1TenantsByTenantSoftwareResourcesByIdVersions(
        transport,
        { pathParams: { tenant, id }, query: queryParameters(query) },
        (value) => {
          const page = projectedPage(value, versionFields, query.fields, ['version'])
          if (page.items.some((item) => item.resource !== undefined && item.resource !== id))
            throw new Error('Wrong resource version directory')
          return page
        },
      ),
    version: (id, version) =>
      api.getApiV1TenantsByTenantSoftwareResourcesByIdVersionsByVersion(
        transport,
        { pathParams: { tenant, id, version } },
        (value) => {
          if (value.resource !== id || value.version !== version)
            throw new Error('Wrong software admission detail')
          return {
            resource: id,
            version,
            resourceDigest: resourceDigest(value.resourceDigest),
            resourceRevision: count(value.resourceRevision),
            presentation: resourcePresentation(value.presentation),
            lifecycle: nullable(value.lifecycle, lifecycle),
          }
        },
      ),
    changeVersion: (id, version, change) =>
      api.postApiV1TenantsByTenantSoftwareResourcesByIdVersionsByVersion(
        transport,
        {
          pathParams: { tenant, id, version },
          body: requestInput(
            change,
            schema.postApiV1TenantsByTenantSoftwareResourcesByIdVersionsByVersionBody.validateRoot,
          ),
        },
        (value) => {
          if (value.resource !== id || value.version !== version)
            throw new Error('Wrong software admission receipt')
          return { resource: id, version, lifecycle: lifecycle(value.lifecycle) }
        },
      ),
  }
}
