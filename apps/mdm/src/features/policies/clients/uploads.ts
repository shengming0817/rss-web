/** Native content-service upload sessions. No retry or session ownership here. */
import type { HttpTransport } from '@rss/api/mdm'
import {
  boolean,
  closed,
  count,
  digest,
  enumeration,
  identifier,
  nullable,
  string,
  uuid,
} from '../../../services/decode'
import type { UploadTarget } from './resources'
import { softwareSource } from './software-definition'
export function decodeUpload(value: unknown, resource: string, upload: string) {
  const v = closed(value, ['id', 'binding', 'offset', 'expires', 'complete'])
  const b = closed(v['binding'], [
    'resource',
    'version',
    'variant',
    'platform',
    'architecture',
    'resource_digest',
    'source',
    'origin',
    'reference',
    'length',
    'sha256',
    'actor',
  ])
  const binding = {
    resource: identifier(b['resource']),
    version: identifier(b['version']),
    variant: identifier(b['variant']),
    platform: enumeration(b['platform'], ['windows', 'macos'] as const),
    architecture: enumeration(b['architecture'], ['x86_64', 'aarch64'] as const),
    resource_digest: digest(b['resource_digest']),
    source: nullable(b['source'], softwareSource),
    origin: nullable(b['origin'], string),
    reference: identifier(b['reference']),
    length: count(b['length']),
    sha256: digest(b['sha256']),
    actor: string(b['actor']),
  }
  const result = {
    id: uuid(v['id']),
    binding,
    offset: count(v['offset']),
    expires: count(v['expires']),
    complete: boolean(v['complete']),
  }
  if (
    result.id !== upload ||
    binding.resource !== resource ||
    !binding.length ||
    !binding.actor ||
    result.offset > binding.length ||
    (result.complete && result.offset !== binding.length)
  )
    throw new Error('Invalid upload binding')
  return result
}
export type UploadSession = ReturnType<typeof decodeUpload>
export function createUploadsClient(transport: HttpTransport) {
  const path = '/api/v3/resources/{id}/uploads/{upload}'
  return {
    begin: (id: string, upload: string, target: UploadTarget, signal?: AbortSignal) =>
      transport.request({
        method: 'POST',
        path,
        pathParams: { id, upload },
        query: { ...target },
        ...(signal ? { signal } : {}),
        successStatus: 200,
        decode(v) {
          const value = decodeUpload(v, id, upload),
            b = value.binding
          if (
            b.version !== target.version ||
            b.variant !== target.variant ||
            b.platform !== target.platform ||
            b.architecture !== target.architecture ||
            (target.artifact !== undefined && b.reference !== target.artifact)
          )
            throw new Error('Wrong upload selection')
          return value
        },
      }),
    read: (id: string, upload: string, signal?: AbortSignal) =>
      transport.request({
        method: 'GET',
        path,
        pathParams: { id, upload },
        ...(signal ? { signal } : {}),
        successStatus: 200,
        decode: (v) => decodeUpload(v, id, upload),
      }),
    append: (id: string, upload: string, offset: number, body: ArrayBuffer, signal?: AbortSignal) =>
      transport.request({
        method: 'PATCH',
        path,
        pathParams: { id, upload },
        query: { offset },
        headers: { 'Content-Type': 'application/octet-stream' },
        body,
        ...(signal ? { signal } : {}),
        successStatus: 200,
        decode: (v) => decodeUpload(v, id, upload),
      }),
    complete: (id: string, upload: string, signal?: AbortSignal) =>
      transport.request({
        method: 'POST',
        path: `${path}/complete`,
        pathParams: { id, upload },
        ...(signal ? { signal } : {}),
        successStatus: 201,
        decode(v): void {
          if (v !== '' && v !== undefined) throw new Error('Invalid completion acknowledgement')
        },
      }),
    receipt: (id: string, upload: string, signal?: AbortSignal) =>
      transport.request({
        method: 'GET',
        path: '/api/v3/resources/{id}/content/operations/{upload}',
        pathParams: { id, upload },
        ...(signal ? { signal } : {}),
        successStatus: 200,
        decode(v) {
          const r = closed(v, [
            'operationId',
            'committed',
            'resource',
            'version',
            'reference',
            'length',
            'sha256',
          ])
          if (uuid(r['operationId']) !== upload || r['resource'] !== id || r['committed'] !== true)
            throw new Error('Wrong content receipt')
          return {
            operationId: upload,
            resource: id,
            version: identifier(r['version']),
            reference: identifier(r['reference']),
            length: count(r['length']),
            sha256: digest(r['sha256']),
          }
        },
      }),
  }
}
