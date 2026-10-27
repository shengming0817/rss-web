import * as api from '@rss/api/mdm-operations'
import {
  queryParameters,
  projectedPage,
  type DirectoryQuery,
} from '../../../services/directory-query'
import type { HttpTransport } from '@rss/api/mdm'
import { MDM_CONTENT_TIMEOUT_MS } from '@rss/api/mdm-limits'
import {
  array,
  uuid,
  unique,
  closed,
  count,
  integer,
  boolean,
  digest,
  string,
  nullable,
  record,
  enumeration,
  identifier,
} from '../../../services/decode'
import {
  installer,
  target,
  installerFormats,
  platforms,
  architectures,
} from '../../enrollment/clients/packages'
export function installerFacts(value: unknown) {
  const v = closed(value, ['format', 'version', 'architectures', 'bundleId'])
  return {
    format: enumeration(v['format'], ['exe', 'msi', 'msix', 'pkg'] as const),
    version: nullable(v['version'], string),
    architectures: unique(
      array(v['architectures'], (x) => enumeration(x, ['x86_64', 'aarch64'] as const)),
      (x) => x,
    ),
    bundleId: nullable(v['bundleId'], string),
  }
}
function installerInspection(value: unknown) {
  const status = enumeration(record(value)['status'], [
    'parsed',
    'skipped_size_limit',
    'not_requested',
    'rejected',
  ] as const)
  if (status === 'parsed') {
    const v = closed(value, ['status', 'facts'])
    return { status, facts: installerFacts(v['facts']) }
  }
  closed(value, ['status'])
  return { status }
}
export function savedInstaller(value: unknown, expected: string) {
  const v = closed(value, [
    'packageId',
    'resource',
    'version',
    'variant',
    'productVersion',
    'material',
    'sha256',
    'length',
    'filename',
    'href',
    'storageRevision',
  ])
  if (
    uuid(v['packageId']) !== expected ||
    v['resource'] !== expected ||
    v['href'] !== `/api/v1/software/resources/${expected}/versions/${identifier(v['version'])}`
  )
    throw new Error('Wrong saved package')
  return {
    packageId: expected,
    productVersion: identifier(v['productVersion']),
    material: installerFacts(v['material']),
    sha256: digest(v['sha256']),
    length: count(v['length']),
    filename: string(v['filename']),
    storageRevision: count(v['storageRevision']),
    version: identifier(v['version']),
    variant: identifier(v['variant']),
  }
}
const packageFields = {
  releaseId: uuid,
  tenantId: uuid,
  target,
  state: (v: unknown) => enumeration(v, ['published', 'withdrawn'] as const),
  platform: (v: unknown) => enumeration(v, platforms),
  architecture: (v: unknown) => enumeration(v, architectures),
  format: (v: unknown) => enumeration(v, installerFormats),
  version: identifier,
  filename: identifier,
  length: count,
  installerSha256: digest,
}
export function createManagedPackages(transport: HttpTransport, tenant: string) {
  function uploadStatus(value: unknown, id: string) {
    const v = closed(value, ['id', 'binding', 'offset', 'expires', 'complete'])
    const b = closed(v['binding'], ['purpose', 'reference', 'length', 'sha256', 'actor'])
    const p = closed(b['purpose'], ['kind', 'binding'])
    const binding = closed(p['binding'], ['resource', 'filename'])
    if (uuid(v['id']) !== id || p['kind'] !== 'software' || binding['resource'] !== id)
      throw new Error('Wrong upload')
    const offset = count(v['offset']),
      length = count(b['length'])
    if (offset > length) throw new Error('Invalid frontier')
    return {
      offset,
      length,
      complete: boolean(v['complete']),
      expires: integer(v['expires']),
      sha256: digest(b['sha256']),
      filename: string(binding['filename']),
    }
  }
  function inspection(method: 'GET' | 'POST', id: string, signal?: AbortSignal) {
    return (
      method === 'POST'
        ? api.postApiV1AgentPackagesUploadsById
        : api.getApiV1AgentPackagesUploadsById
    )(
      transport,
      {
        ...(method === 'POST' ? { timeoutMs: MDM_CONTENT_TIMEOUT_MS } : {}),
        pathParams: { id: uuid(id) },
        ...(signal ? { signal } : {}),
      },
      (value) => {
        const v = value
        if (uuid(v['packageId']) !== id) throw new Error('Wrong inspected package')
        return {
          packageId: id,
          filename: string(v['filename']),
          length: count(v['length']),
          sha256: digest(v['sha256']),
          format: enumeration(v['format'], ['exe', 'msi', 'msix', 'pkg'] as const),
          inspection: installerInspection(v['inspection']),
        }
      },
    )
  }
  return {
    begin: (
      operationId: string,
      filename: string,
      length: number,
      sha256: number[],
      signal?: AbortSignal,
    ) =>
      api.postApiV1AgentPackagesUploads(
        transport,
        { body: { operationId, filename, length, sha256 }, ...(signal ? { signal } : {}) },
        (value) => {
          const v = value
          if (
            uuid(v['packageId']) !== operationId ||
            v['resource'] !== operationId ||
            v['upload'] !== operationId ||
            v['length'] !== length ||
            v['href'] !== `/api/v1/resources/${operationId}/uploads/${operationId}`
          )
            throw new Error('Wrong upload preparation')
          const offset = count(v['offset'])
          if (offset > length) throw new Error('Invalid frontier')
          return { packageId: operationId, offset, complete: v['complete'] }
        },
      ),
    status: (id: string, signal?: AbortSignal) =>
      api.getApiV1ResourcesByIdUploadsByUpload(
        transport,
        { pathParams: { id: uuid(id), upload: uuid(id) }, ...(signal ? { signal } : {}) },
        (v) => uploadStatus(v, id),
      ),
    append: (id: string, offset: number, body: ArrayBuffer, signal?: AbortSignal) =>
      api.patchApiV1ResourcesByIdUploadsByUpload(
        transport,
        {
          timeoutMs: MDM_CONTENT_TIMEOUT_MS,
          pathParams: { id: uuid(id), upload: uuid(id) },
          query: { offset },
          body,
          ...(signal ? { signal } : {}),
        },
        (v) => uploadStatus(v, id),
      ),
    complete: (id: string, signal?: AbortSignal) =>
      api.postApiV1ResourcesByIdUploadsByUploadComplete(transport, {
        timeoutMs: MDM_CONTENT_TIMEOUT_MS,
        pathParams: { id: uuid(id), upload: uuid(id) },
        ...(signal ? { signal } : {}),
      }),
    inspect: (id: string, signal?: AbortSignal) => inspection('GET', id, signal),
    parse: (id: string, signal?: AbortSignal) => inspection('POST', id, signal),
    save: (
      operationId: string,
      packageId: string,
      version: string | null,
      selected: ReturnType<typeof target>,
    ) =>
      api.postApiV1AgentPackagesSave(
        transport,
        { body: { operationId, packageId, version, target: selected, behavior: null } },
        (v) => savedInstaller(v, packageId),
      ),
    publish: (operationId: string, packageId: string) =>
      api.postApiV1AgentPackages(transport, { body: { operationId, packageId } }, (v) =>
        installer(v, tenant),
      ),
    operation: (id: string, action: 'save' | 'publish' | 'withdraw', packageId: string) =>
      api.getApiV1AgentPackagesOperationsById(transport, { pathParams: { id: uuid(id) } }, (v) => {
        if (v === null) return null
        if (action === 'save') return { kind: 'save' as const, value: savedInstaller(v, packageId) }
        if (action === 'publish') {
          const value = installer(v, tenant)
          return { kind: 'publish' as const, value }
        }
        const result = closed(v, ['withdrawn'])
        if (uuid(result['withdrawn']) !== packageId) throw new Error('Wrong withdrawal')
        return { kind: 'withdraw' as const, value: packageId }
      }),

    list: <F extends keyof typeof packageFields = keyof typeof packageFields>(
      query: DirectoryQuery<F> = {},
    ) =>
      api.getApiV1AgentPackages(
        transport,
        { query: queryParameters({ limit: 20, ...query }) },
        (value) => {
          const page = projectedPage(value, packageFields, query.fields, ['releaseId'])
          for (const row of page.items) {
            if ('tenantId' in row && row.tenantId !== tenant)
              throw new Error('Wrong package tenant')
            if (!query.fields) {
              const metadataRow = record(row)
              const platform = metadataRow['platform'],
                architecture = metadataRow['architecture']
              const metadata = Object.fromEntries(
                Object.entries(row).filter(
                  ([key]) => !['state', 'platform', 'architecture'].includes(key),
                ),
              )
              const item = installer(metadata, tenant)
              if (item.target.platform !== platform || item.target.architecture !== architecture)
                throw new Error('Wrong package target')
            }
          }
          return page
        },
      ),
    withdraw: (id: string, release: string) =>
      api.postApiV1AgentPackagesByIdWithdraw(transport, {
        pathParams: { id: uuid(release) },
        body: { operationId: uuid(id) },
      }),
  }
}
