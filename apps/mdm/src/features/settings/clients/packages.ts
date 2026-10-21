import type { HttpTransport } from '@rss/api/mdm'
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
  enumeration,
  identifier,
} from '../../../services/decode'
import { installer, target } from '../../enrollment/clients/packages'
export function installerFacts(value: unknown) {
  const v = closed(value, ['format', 'version', 'architectures', 'bundleId'])
  return {
    format: enumeration(v['format'], ['exe', 'msi', 'msix', 'pkg'] as const),
    version: nullable(v['version'], identifier),
    architectures: unique(
      array(v['architectures'], (x) => enumeration(x, ['x86_64', 'aarch64'] as const)),
      (x) => x,
    ),
    bundleId: nullable(v['bundleId'], string),
  }
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
export function createManagedPackages(transport: HttpTransport, tenant: string) {
  const uploadPath = '/api/v1/resources/{resource}/uploads/{upload}'
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
  return {
    begin: (
      operationId: string,
      filename: string,
      length: number,
      sha256: number[],
      signal?: AbortSignal,
    ) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/agent-packages/uploads',
        body: { operationId, filename, length, sha256 },
        signal,
        successStatus: 200,
        decode: (value) => {
          const v = closed(value, [
            'packageId',
            'resource',
            'upload',
            'offset',
            'length',
            'complete',
            'href',
          ])
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
          return { packageId: operationId, offset, complete: boolean(v['complete']) }
        },
      }),
    status: (id: string, signal?: AbortSignal) =>
      transport.request({
        method: 'GET',
        path: uploadPath,
        pathParams: { resource: uuid(id), upload: uuid(id) },
        signal,
        successStatus: 200,
        decode: (v) => uploadStatus(v, id),
      }),
    append: (id: string, offset: number, body: ArrayBuffer, signal?: AbortSignal) =>
      transport.request({
        method: 'PATCH',
        path: uploadPath,
        pathParams: { resource: uuid(id), upload: uuid(id) },
        query: { offset },
        body,
        signal,
        successStatus: 200,
        decode: (v) => uploadStatus(v, id),
      }),
    complete: (id: string, signal?: AbortSignal) =>
      transport.request({
        method: 'POST',
        path: uploadPath + '/complete',
        pathParams: { resource: uuid(id), upload: uuid(id) },
        signal,
        successStatus: 201,
        responseType: 'empty',
      }),
    inspect: (id: string, signal?: AbortSignal) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/agent-packages/uploads/{id}',
        pathParams: { id: uuid(id) },
        signal,
        successStatus: 200,
        decode: (value) => {
          const v = closed(value, ['packageId', 'filename', 'length', 'sha256', 'facts'])
          if (uuid(v['packageId']) !== id) throw new Error('Wrong inspected package')
          return {
            packageId: id,
            filename: string(v['filename']),
            length: count(v['length']),
            sha256: digest(v['sha256']),
            facts: installerFacts(v['facts']),
          }
        },
      }),
    save: (
      operationId: string,
      packageId: string,
      version: string | null,
      selected: ReturnType<typeof target>,
    ) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/agent-packages/save',
        body: { operationId, packageId, version, target: selected, behavior: null },
        successStatus: 200,
        decode: (v) => savedInstaller(v, packageId),
      }),
    publish: (operationId: string, packageId: string) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/agent-packages',
        body: { operationId, packageId },
        successStatus: 200,
        decode: (v) => installer(v, tenant),
      }),
    operation: (id: string, action: 'save' | 'publish' | 'withdraw', packageId: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/agent-packages/operations/{id}',
        pathParams: { id: uuid(id) },
        successStatus: 200,
        decode: (v) => {
          if (v === null) return null
          if (action === 'save')
            return { kind: 'save' as const, value: savedInstaller(v, packageId) }
          if (action === 'publish') {
            const value = installer(v, tenant)
            return { kind: 'publish' as const, value }
          }
          const result = closed(v, ['withdrawn'])
          if (uuid(result['withdrawn']) !== packageId) throw new Error('Wrong withdrawal')
          return { kind: 'withdraw' as const, value: packageId }
        },
      }),

    read: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/agent-packages',
        successStatus: 200,
        decode: (v) =>
          unique(
            array(v, (item) => installer(item, tenant)),
            (p) => p.releaseId,
          ),
      }),
    withdraw: (id: string, release: string) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/agent-packages/{id}/withdraw',
        pathParams: { id: uuid(release) },
        body: { operationId: uuid(id) },
        successStatus: 204,
      }),
  }
}
