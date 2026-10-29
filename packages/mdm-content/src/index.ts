export type * from './model'
export { chunkBytes } from './model'

import { sha256 } from '@noble/hashes/sha2.js'
import { freeze, uuid } from '@rss/mdm-inventory'
import {
  digest,
  resourceId,
  sameArtifact,
  sameDefinition,
  validateArtifact,
  type MaterialTarget,
} from '@rss/mdm-resources'
import {
  chunkBytes,
  type ContentPort,
  type ContentReceipt,
  type DownloadRequest,
  type DownloadSink,
  type MaterialSource,
  type UploadIntent,
  type UploadSession,
} from './model'

function current(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Content operation cancelled')
}
function target(value: MaterialTarget): void {
  resourceId(value.resource)
  resourceId(value.version)
  resourceId(value.variant)
  validateArtifact(value.artifact)
  if (
    !['windows', 'macos'].includes(value.platform) ||
    !['x86_64', 'aarch64'].includes(value.architecture)
  )
    throw new Error('Invalid material target')
}
function intent(value: UploadIntent): void {
  uuid(value.id)
  target(value.target)
}
function equalTarget(a: MaterialTarget, b: MaterialTarget): boolean {
  return (
    a.resource === b.resource &&
    a.version === b.version &&
    a.variant === b.variant &&
    a.platform === b.platform &&
    a.architecture === b.architecture &&
    sameArtifact(a.artifact, b.artifact)
  )
}
function observed(
  intent: UploadIntent,
  value: UploadSession,
  previous?: UploadSession,
): UploadSession {
  if (
    value.id !== intent.id ||
    !equalTarget(value.target, intent.target) ||
    !Number.isSafeInteger(value.offset) ||
    value.offset < 0 ||
    value.offset > intent.target.artifact.length ||
    (value.complete && value.offset !== intent.target.artifact.length) ||
    !Number.isSafeInteger(value.expires) ||
    !value.actor
  )
    throw new Error('Wrong original upload session')
  digest(value.resourceDigest)
  if (
    previous &&
    (value.actor !== previous.actor ||
      value.storageClass !== previous.storageClass ||
      !sameDefinition(
        [value.inspection, value.source, value.origin],
        [previous.inspection, previous.source, previous.origin],
      ) ||
      !value.resourceDigest.every((byte, index) => byte === previous.resourceDigest[index]))
  )
    throw new Error('Upload binding changed')
  return freeze(value)
}
function receipt(intent: UploadIntent, value: ContentReceipt): ContentReceipt {
  if (
    value.operationId !== intent.id ||
    value.resource !== intent.target.resource ||
    value.version !== intent.target.version ||
    value.committed !== true ||
    !sameArtifact(value, intent.target.artifact)
  )
    throw new Error('Wrong original content receipt')
  return freeze(value)
}
/** Incremental digest over bounded reads. No whole-file buffer or framework dependency. */
export async function hashMaterial(
  source: MaterialSource,
  signal?: AbortSignal,
): Promise<readonly number[]> {
  if (!Number.isSafeInteger(source.length) || source.length < 1)
    throw new Error('Invalid material size')
  const hash = sha256.create(),
    declaredLength = source.length
  try {
    for (let offset = 0; offset < declaredLength; offset += chunkBytes) {
      current(signal)
      const length = Math.min(chunkBytes, declaredLength - offset)
      const bytes = await source.read(offset, length)
      try {
        current(signal)
        if (bytes.byteLength !== length) throw new Error('Material source changed')
        hash.update(new Uint8Array(bytes))
      } finally {
        new Uint8Array(bytes).fill(0)
      }
    }
    return Object.freeze(Array.from(hash.digest()))
  } finally {
    hash.destroy()
  }
}
async function downloadToSink(
  port: ContentPort,
  request: DownloadRequest,
  sink: DownloadSink,
  signal?: AbortSignal,
): Promise<void> {
  request = freeze(request)
  const hash = sha256.create()
  let etag: string | undefined
  try {
    target(request.target)
    for (let start = 0; start < request.target.artifact.length; start += chunkBytes) {
      current(signal)
      const end = Math.min(start + chunkBytes, request.target.artifact.length) - 1
      const part = await port.download(
        freeze(request),
        { start, end, ...(etag ? { etag } : {}) },
        signal,
      )
      try {
        current(signal)
        if (
          part.start !== start ||
          part.end !== end ||
          part.total !== request.target.artifact.length ||
          part.bytes.byteLength !== end - start + 1 ||
          !part.etag ||
          (etag !== undefined && part.etag !== etag)
        )
          throw new Error('Invalid download range or changed material')
        etag = part.etag
        const bytes = new Uint8Array(part.bytes)
        hash.update(bytes)
        await sink.write(bytes)
        current(signal)
      } finally {
        new Uint8Array(part.bytes).fill(0)
      }
    }
    const actual = hash.digest()
    if (!actual.every((byte, index) => byte === request.target.artifact.sha256[index]))
      throw new Error('Downloaded material digest mismatch')
    current(signal)
    await sink.close()
  } catch (error) {
    try {
      await sink.abort()
    } catch {
      throw new Error('Download cleanup unconfirmed')
    }
    throw error
  } finally {
    hash.destroy()
  }
}

/** Every write is explicit. An unacknowledged chunk requires a new observed frontier. */
export function createContent(port: ContentPort) {
  return Object.freeze({
    intent(id: string, selection: MaterialTarget): UploadIntent {
      const value = {
        id,
        target: {
          resource: selection.resource,
          version: selection.version,
          variant: selection.variant,
          platform: selection.platform,
          architecture: selection.architecture,
          artifact: {
            reference: selection.artifact.reference,
            length: selection.artifact.length,
            sha256: selection.artifact.sha256,
          },
        },
      }
      intent(value)
      return freeze(value)
    },
    async verify(source: MaterialSource, selection: MaterialTarget, signal?: AbortSignal) {
      target(selection)
      if (source.length !== selection.artifact.length)
        throw new Error('Wrong original material length')
      const fixed = freeze(selection),
        hash = await hashMaterial(source, signal)
      if (!hash.every((byte, index) => byte === fixed.artifact.sha256[index]))
        throw new Error('Wrong original material digest')
    },
    async begin(value: UploadIntent, signal?: AbortSignal) {
      intent(value)
      current(signal)
      const original = freeze(value)
      return observed(original, await port.begin(original, signal))
    },
    async read(resource: string, upload: string, signal?: AbortSignal) {
      resourceId(resource)
      uuid(upload)
      current(signal)
      const value = await port.read(resource, upload, signal)
      const original = { id: upload, target: value.target }
      intent(original)
      if (value.target.resource !== resource) throw new Error('Wrong upload resource')
      return observed(original, value)
    },
    async append(
      value: UploadIntent,
      session: UploadSession,
      source: MaterialSource,
      signal?: AbortSignal,
    ) {
      intent(value)
      observed(value, session)
      current(signal)
      value = freeze(value)
      session = freeze(session)
      if (
        source.length !== value.target.artifact.length ||
        session.complete ||
        session.offset >= source.length
      )
        throw new Error('No writable observed frontier')
      const length = Math.min(chunkBytes, source.length - session.offset)
      const bytes = await source.read(session.offset, length)
      try {
        current(signal)
        if (bytes.byteLength !== length) throw new Error('Material source changed')
        const next = observed(
          value,
          await port.append(value, session.offset, bytes, signal),
          session,
        )
        if (next.offset !== session.offset + length) throw new Error('Unconfirmed upload frontier')
        return next
      } finally {
        new Uint8Array(bytes).fill(0)
      }
    },
    async complete(value: UploadIntent, session: UploadSession, signal?: AbortSignal) {
      intent(value)
      observed(value, session)
      if (session.offset !== value.target.artifact.length)
        throw new Error('Upload remains incomplete')
      current(signal)
      await port.complete(freeze(value), signal)
    },
    async receipt(value: UploadIntent) {
      intent(value)
      const original = freeze(value)
      return receipt(original, await port.receipt(original.target.resource, original.id))
    },
    async originalReceipt(resource: string, operationId: string) {
      resourceId(resource)
      uuid(operationId)
      const result = await port.receipt(resource, operationId)
      validateArtifact(result)
      if (
        result.resource !== resource ||
        result.operationId !== operationId ||
        result.committed !== true
      )
        throw new Error('Wrong original content receipt')
      return freeze(result)
    },
    download(request: DownloadRequest, sink: DownloadSink, signal?: AbortSignal) {
      return downloadToSink(port, request, sink, signal)
    },
    async downloadBytes(
      request: DownloadRequest,
      maximum: number,
      signal?: AbortSignal,
    ): Promise<ArrayBuffer> {
      if (
        !Number.isSafeInteger(maximum) ||
        maximum < 1 ||
        maximum > 16 * 1024 * 1024 ||
        request.target.artifact.length > maximum
      )
        throw new Error('Material exceeds the selected small-file budget')
      const buffer = new ArrayBuffer(request.target.artifact.length)
      let offset = 0
      try {
        await downloadToSink(
          port,
          request,
          {
            async write(bytes) {
              new Uint8Array(buffer).set(bytes, offset)
              offset += bytes.byteLength
            },
            async close() {
              if (offset !== buffer.byteLength) throw new Error('Incomplete material download')
            },
            async abort() {
              new Uint8Array(buffer).fill(0)
            },
          },
          signal,
        )
        return buffer
      } catch (error) {
        new Uint8Array(buffer).fill(0)
        throw error
      }
    },
  })
}
