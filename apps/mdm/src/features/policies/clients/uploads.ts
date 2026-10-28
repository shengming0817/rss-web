import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
/** Native content-service upload sessions. No retry or session ownership here. */
import type { HttpTransport } from '@rss/api/mdm'
import { MDM_CONTENT_TIMEOUT_MS } from '@rss/api/mdm-limits'
import {
  count,
  digest,
  enumeration,
  identifier,
  nullable,
  string,
  uuid,
} from '../../../services/decode'
import type { UploadTarget } from './resources'
import { softwareFormats, softwareSource } from './software-definition'
export function decodeUpload(value: unknown, resource: string, upload: string) {
  if (!wireSchemas.getApiV1ResourcesByIdUploadsByUploadResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  const b = v['binding']
  const purpose = b['purpose']
  if (purpose.kind !== 'resource') throw new Error('Wrong upload purpose')
  const r = purpose['binding']
  const binding = {
    purpose: {
      kind: 'resource' as const,
      binding: {
        inspection: nullable(r['inspection'], (value) => enumeration(value, softwareFormats)),
        storage_class: r['storage_class'],
        resource: identifier(r['resource']),
        version: identifier(r['version']),
        variant: identifier(r['variant']),
        platform: r['platform'],
        architecture: r['architecture'],
        resource_digest: digest(r['resource_digest']),
        source: nullable(r['source'], softwareSource),
        origin: nullable(r['origin'], string),
      },
    },
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
    complete: v['complete'],
  }
  if (
    result.id !== upload ||
    binding.purpose.binding.resource !== resource ||
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
  return {
    begin: (id: string, upload: string, target: UploadTarget, signal?: AbortSignal) =>
      api.postApiV1ResourcesByIdUploadsByUpload(
        transport,
        {
          pathParams: { id, upload },
          query: {
            version: target.version,
            variant: target.variant,
            platform: target.platform,
            architecture: target.architecture,
            ...(target.artifact === undefined ? {} : { artifact: target.artifact }),
          },
          ...(signal ? { signal } : {}),
        },
        (v) => {
          const value = decodeUpload(v, id, upload),
            b = value.binding
          if (
            b.purpose.binding.version !== target.version ||
            b.purpose.binding.variant !== target.variant ||
            b.purpose.binding.platform !== target.platform ||
            b.purpose.binding.architecture !== target.architecture ||
            (target.artifact !== undefined && b.reference !== target.artifact)
          )
            throw new Error('Wrong upload selection')
          return value
        },
      ),
    read: (id: string, upload: string, signal?: AbortSignal) =>
      api.getApiV1ResourcesByIdUploadsByUpload(
        transport,
        { pathParams: { id, upload }, ...(signal ? { signal } : {}) },
        (v) => decodeUpload(v, id, upload),
      ),
    append: (id: string, upload: string, offset: number, body: ArrayBuffer, signal?: AbortSignal) =>
      api.patchApiV1ResourcesByIdUploadsByUpload(
        transport,
        {
          timeoutMs: MDM_CONTENT_TIMEOUT_MS,
          pathParams: { id, upload },
          query: { offset },
          body,
          ...(signal ? { signal } : {}),
        },
        (v) => decodeUpload(v, id, upload),
      ),
    complete: (id: string, upload: string, signal?: AbortSignal) =>
      api.postApiV1ResourcesByIdUploadsByUploadComplete(transport, {
        timeoutMs: MDM_CONTENT_TIMEOUT_MS,
        pathParams: { id, upload },
        ...(signal ? { signal } : {}),
      }),
    receipt: (id: string, upload: string, signal?: AbortSignal) =>
      api.getApiV1ResourcesByIdContentOperationsByOperation(
        transport,
        { pathParams: { id: id, operation: upload }, ...(signal ? { signal } : {}) },
        (v) => {
          const r = v
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
      ),
  }
}
