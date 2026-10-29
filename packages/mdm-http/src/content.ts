import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import { MDM_CONTENT_TIMEOUT_MS } from '@rss/api/mdm-limits'
import type { BinaryResponse, HttpTransport } from '@rss/api/mdm'
import {
  chunkBytes,
  type ContentPort,
  type DownloadChunk,
  type UploadSession,
} from '@rss/mdm-content'
import { resourceId } from '@rss/mdm-resources'
import { identifier } from '@rss/mdm-inventory'
import { boolean, count, enumeration, nullable, text, uuid } from './decode'
import { resourceDigest } from './resource-values'

function uploadSession(value: unknown, resource: string, upload: string): UploadSession {
  if (!schema.getApiV1ResourcesByIdUploadsByUploadResponse.validateRoot(value))
    throw new Error('Invalid upload session')
  const binding = value.binding
  if (binding.purpose.kind !== 'resource') throw new Error('Wrong upload purpose')
  const selected = binding.purpose.binding,
    length = count(binding.length),
    offset = count(value.offset)
  if (
    value.id !== upload ||
    selected.resource !== resource ||
    !length ||
    offset > length ||
    (value.complete && offset !== length)
  )
    throw new Error('Wrong upload binding')
  return {
    id: uuid(value.id),
    target: {
      resource: resourceId(selected.resource),
      version: resourceId(selected.version),
      variant: resourceId(selected.variant),
      platform: selected.platform,
      architecture: selected.architecture,
      artifact: {
        reference: resourceId(binding.reference),
        length,
        sha256: resourceDigest(binding.sha256),
      },
    },
    resourceDigest: resourceDigest(selected.resource_digest),
    actor: identifier(binding.actor, 1024),
    storageClass: selected.storage_class,
    inspection: nullable(selected.inspection ?? null, (value) =>
      enumeration(value, ['exe', 'msi', 'msix', 'pkg', 'bundle', 'winget', 'brew', 'dmg'] as const),
    ),
    source: nullable(selected.source ?? null, (source) => {
      if (!source || typeof source !== 'object') throw new Error('Invalid source snapshot')
      return {
        id: resourceId(text(Reflect.get(source, 'id'))),
        revision: resourceId(text(Reflect.get(source, 'revision'))),
        sha256: resourceDigest(Reflect.get(source, 'sha256')),
      }
    }),
    origin: nullable(selected.origin ?? null, text),
    offset,
    expires: count(value.expires),
    complete: boolean(value.complete),
  }
}
function downloadChunk(
  value: BinaryResponse,
  range: { readonly start: number; readonly end: number; readonly etag?: string },
  total: number,
  sha256: readonly number[],
): DownloadChunk {
  try {
    const expectedEtag =
      '"' + sha256.map((byte) => byte.toString(16).padStart(2, '0')).join('') + '"'
    if (
      value.contentType !== 'application/octet-stream' ||
      value.etag !== expectedEtag ||
      (range.etag !== undefined && value.etag !== range.etag) ||
      value.contentLength === null ||
      !/^\d+$/.test(value.contentLength)
    )
      throw new Error('Wrong material download framing')
    const length = Number(value.contentLength)
    if (!Number.isSafeInteger(length) || length !== value.bytes.byteLength || length > chunkBytes)
      throw new Error('Invalid bounded download length')
    if (value.status === 206) {
      const parsed = value.contentRange?.match(/^bytes (\d+)-(\d+)\/(\d+)$/)
      if (
        !parsed ||
        Number(parsed[1]) !== range.start ||
        Number(parsed[2]) !== range.end ||
        Number(parsed[3]) !== total
      )
        throw new Error('Wrong download range binding')
    } else if (
      value.status !== 200 ||
      range.start !== 0 ||
      range.end !== total - 1 ||
      value.contentRange !== null
    )
      throw new Error('Range request returned an unbound full response')
    if (length !== range.end - range.start + 1) throw new Error('Truncated download range')
    return { bytes: value.bytes, start: range.start, end: range.end, total, etag: value.etag }
  } catch (error) {
    new Uint8Array(value.bytes).fill(0)
    throw error
  }
}
/** The sole content adapter uses the application's session-bound executor. */
export function createContentAdapter(transport: HttpTransport): ContentPort {
  return {
    begin: (intent, signal) =>
      api.postApiV1ResourcesByIdUploadsByUpload(
        transport,
        {
          pathParams: { id: intent.target.resource, upload: intent.id },
          query: {
            version: intent.target.version,
            variant: intent.target.variant,
            platform: intent.target.platform,
            architecture: intent.target.architecture,
            artifact: intent.target.artifact.reference,
          },
          ...(signal ? { signal } : {}),
        },
        (value) => uploadSession(value, intent.target.resource, intent.id),
      ),
    read: (resource, upload, signal) =>
      api.getApiV1ResourcesByIdUploadsByUpload(
        transport,
        { pathParams: { id: resource, upload }, ...(signal ? { signal } : {}) },
        (value) => uploadSession(value, resource, upload),
      ),
    append: (intent, offset, bytes, signal) =>
      api.patchApiV1ResourcesByIdUploadsByUpload(
        transport,
        {
          pathParams: { id: intent.target.resource, upload: intent.id },
          query: { offset },
          body: bytes,
          timeoutMs: MDM_CONTENT_TIMEOUT_MS,
          ...(signal ? { signal } : {}),
        },
        (value) => uploadSession(value, intent.target.resource, intent.id),
      ),
    complete: (intent, signal) =>
      api.postApiV1ResourcesByIdUploadsByUploadComplete(transport, {
        pathParams: { id: intent.target.resource, upload: intent.id },
        timeoutMs: MDM_CONTENT_TIMEOUT_MS,
        ...(signal ? { signal } : {}),
      }),
    receipt: (resource, operation) =>
      api.getApiV1ResourcesByIdContentOperationsByOperation(
        transport,
        { pathParams: { id: resource, operation } },
        (value) => {
          if (
            value.resource !== resource ||
            value.operationId !== operation ||
            value.committed !== true
          )
            throw new Error('Wrong durable content receipt')
          return {
            operationId: uuid(value.operationId),
            resource: resourceId(value.resource),
            version: resourceId(value.version),
            reference: resourceId(value.reference),
            length: count(value.length),
            sha256: resourceDigest(value.sha256),
            committed: true,
          }
        },
      ),
    download: (request, range, signal) => {
      if (
        !Number.isSafeInteger(range.start) ||
        !Number.isSafeInteger(range.end) ||
        range.start < 0 ||
        range.end < range.start ||
        range.end - range.start + 1 > chunkBytes
      )
        throw new Error('Invalid bounded download request')
      const headers = {
          Range: `bytes=${range.start}-${range.end}`,
          ...(range.etag ? { 'If-Range': range.etag } : {}),
        },
        query = {
          variant: request.target.variant,
          platform: request.target.platform,
          architecture: request.target.architecture,
        },
        input = {
          pathParams: { id: request.target.resource, version: request.target.version },
          headers,
          timeoutMs: MDM_CONTENT_TIMEOUT_MS,
          ...(signal ? { signal } : {}),
        },
        decode = (value: BinaryResponse) =>
          downloadChunk(
            value,
            range,
            request.target.artifact.length,
            request.target.artifact.sha256,
          )
      return request.kind === 'script'
        ? api.getApiV1ResourcesByIdVersionsByVersionScript(transport, { ...input, query }, decode)
        : api.getApiV1SoftwareResourcesByIdVersionsByVersionContent(
            transport,
            { ...input, query: { ...query, artifact: request.target.artifact.reference } },
            decode,
          )
    },
  }
}
