import { createHash } from 'node:crypto'
import type { DomainHandler } from '../scenario'
import { error, ok } from '../http'
import { count, identifier, uuid } from '../../src/services/decode'
import {
  declarationArtifacts,
  type ResourceRead,
} from '../../src/features/policies/clients/resources'
import type { UploadSession } from '../../src/features/policies/clients/uploads'
import { MDM_CONTENT_BODY_LIMIT } from '@rss/api/mdm-limits'
type Binding = UploadSession['binding']
export function createResourceUploads(
  read: (id: string) => ResourceRead | undefined,
  write: (binding: Binding, bytes: Uint8Array) => void,
) {
  const sessions = new Map<string, { value: UploadSession; chunks: Uint8Array[] | null }>(),
    receipts = new Map<string, object>()
  function resolve(id: string, query: URLSearchParams, actor: string): Binding | undefined {
    const r = read(id),
      version = r?.versions.find((v) => v.id === query.get('version')),
      v = version?.variants.find(
        (v) =>
          v.key === query.get('variant') &&
          v.platform === query.get('platform') &&
          v.architecture === query.get('architecture'),
      )
    if (!version || !v || version.state === 'archived') return
    const d = v.declaration,
      artifact = query.has('artifact')
        ? declarationArtifacts(d).find((a) => a.reference === query.get('artifact'))
        : d.kind === 'software'
          ? d.definition.artifacts[d.definition.primary]
          : d.artifact
    if (
      !artifact ||
      !artifact.length ||
      (d.kind === 'script' && artifact.length > MDM_CONTENT_BODY_LIMIT)
    )
      return
    if (d.kind === 'script' && d.definition.profile === 'osquery') {
      const expected = new TextEncoder().encode(d.definition.sql!)
      if (
        artifact.length !== expected.length ||
        JSON.stringify(artifact.sha256) !==
          JSON.stringify([...createHash('sha256').update(expected).digest()])
      )
        return
    }
    return {
      purpose: {
        kind: 'resource',
        binding: {
          storage_class: d.kind === 'configuration' ? 'native_configuration' : 'artifact',
          resource: id,
          version: version.id,
          variant: v.key,
          platform: v.platform,
          architecture: v.architecture,
          resource_digest: version.digest,
          source: d.kind === 'software' ? d.definition.source : null,
          origin:
            d.kind === 'software'
              ? (Object.values(d.definition.artifacts).find(
                  (a) => a.reference === artifact.reference,
                )?.origin ?? null)
              : null,
        },
      },
      reference: artifact.reference,
      length: artifact.length,
      sha256: artifact.sha256,
      actor,
    }
  }
  const handle: DomainHandler = (request, scenario) => {
    const match =
      /^\/api\/v1\/resources\/([^/]+)\/(uploads|content\/operations)\/([^/]+)(\/complete)?$/.exec(
        request.path,
      )
    if (!match) return
    if (scenario === 'denied') return error('permission_denied', 403)
    const now = Math.floor(Date.now() / 1000)
    // Keep operation identity and receipts, but release abandoned payloads on the next request.
    for (const stored of sessions.values()) if (stored.value.expires <= now) stored.chunks = null
    try {
      const id = identifier(decodeURIComponent(match[1]!)),
        upload = uuid(match[3]),
        actor = `demo-mdm:${request.actor.principalId}`,
        key = JSON.stringify([actor, upload])
      if (match[2] === 'content/operations') {
        if (request.method !== 'GET' || match[4]) return error('malformed_request', 400)
        const receipt = receipts.get(key)
        return receipt && (receipt as { resource: string }).resource === id
          ? ok(structuredClone(receipt))
          : error('operation_not_found', 404)
      }
      let stored = sessions.get(key)
      if (request.method === 'POST' && !match[4]) {
        const binding = resolve(id, request.query, actor)
        if (!binding) return error('operation_conflict')
        if (stored && JSON.stringify(stored.value.binding) !== JSON.stringify(binding))
          return error('operation_conflict')
        if (!stored) {
          stored = {
            value: {
              id: upload,
              binding,
              offset: 0,
              expires: now + 86400,
              complete: false,
            },
            chunks: [],
          }
          sessions.set(key, stored)
        }
      }
      if (!stored) return error('operation_not_found', 404)
      const { value } = stored,
        b = value.binding,
        r = b.purpose.binding
      if (r.resource !== id) return error('permission_denied', 403)
      if (value.expires <= now || (!stored.chunks && !value.complete))
        return error('operation_conflict')
      const binding = resolve(
        id,
        new URLSearchParams({
          version: r.version,
          variant: r.variant,
          platform: r.platform,
          architecture: r.architecture,
          artifact: b.reference,
        }),
        actor,
      )
      if (!binding || JSON.stringify(binding) !== JSON.stringify(b)) {
        stored.chunks = null
        return error('operation_conflict')
      }
      if (request.method === 'PATCH' && !match[4]) {
        const raw = request.query.get('offset'),
          offset = count(raw === null ? undefined : Number(raw))
        if (offset !== value.offset)
          return { status: 409, body: { code: 'upload_offset_conflict', offset: value.offset } }
        if (value.complete || !stored.chunks) return error('operation_conflict')
        if (
          !(request.body instanceof ArrayBuffer) ||
          !request.body.byteLength ||
          request.body.byteLength > MDM_CONTENT_BODY_LIMIT ||
          offset + request.body.byteLength > b.length
        )
          return error('malformed_request', 400)
        stored.chunks.push(new Uint8Array(request.body).slice())
        value.offset += request.body.byteLength
      } else if (request.method === 'POST' && match[4]) {
        if (value.offset !== b.length) return error('operation_conflict')
        if (!value.complete) {
          if (!stored.chunks) return error('operation_conflict')
          const bytes = new Uint8Array(b.length)
          let offset = 0
          for (const chunk of stored.chunks) {
            bytes.set(chunk, offset)
            offset += chunk.length
          }
          const digest = [...createHash('sha256').update(bytes).digest()]
          if (JSON.stringify(digest) !== JSON.stringify(b.sha256)) {
            stored.chunks = null
            return error('malformed_request', 400)
          }
          write(b, bytes)
          value.complete = true
          stored.chunks = null
        }
        receipts.set(key, {
          operationId: upload,
          committed: true,
          resource: id,
          version: r.version,
          reference: b.reference,
          length: b.length,
          sha256: b.sha256,
        })
        return ok(undefined, 201)
      } else if (!['GET', 'POST'].includes(request.method) || match[4])
        return error('malformed_request', 400)
      return ok(structuredClone(value))
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    reset() {
      sessions.clear()
      receipts.clear()
    },
  }
}
