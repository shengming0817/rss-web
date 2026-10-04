import { createResourceUploads } from './uploads'
import { createHash } from 'node:crypto'
import type { DomainHandler } from '../scenario'
import { MDM_CONTENT_BODY_LIMIT } from '@rss/api/mdm-limits'
import { boolean, closed, enumeration, identifier, record, uuid } from '../../src/services/decode'
import {
  decodeResource,
  declarationArtifacts,
  type ResourceRead,
  type Variant,
} from '../../src/features/policies/clients/resources'
import { validateScriptVariant } from './script-validation'
import { createReceipts, error, ok, operation } from '../http'
const hash = (value: string | Uint8Array) => [...createHash('sha256').update(value).digest()]
const contentKey = (
  resource: string,
  version: string,
  v: Pick<Variant, 'platform' | 'architecture' | 'key'>,
  reference: string,
) => JSON.stringify([resource, version, v.platform, v.architecture, v.key, reference])
export interface ImportedFile {
  platform: Variant['platform']
  architecture: Variant['architecture']
  variant: string
  reference: string
  bytes: Uint8Array
}
export interface ResourceImport {
  operation: string
  actor: string
  resource: string
  version: string
  expectedRevision: number
  variants: Variant[]
  files: ImportedFile[]
}
export function createResourceDemo(referenced: (id: string, version: string) => boolean) {
  const resources = new Map<string, ResourceRead>(),
    contents = new Map<string, Uint8Array>(),
    receipts = createReceipts()
  const uploads = createResourceUploads(
    (id) => resources.get(id),
    (binding, bytes) => {
      contents.set(
        contentKey(
          binding.resource,
          binding.version,
          { platform: binding.platform, architecture: binding.architecture, key: binding.variant },
          binding.reference,
        ),
        bytes,
      )
    },
  )
  const imported = new Map<string, { fingerprint: string; revision: number }>()
  /** Atomic synthetic Resource ingress; software import jobs never own a second package copy. */
  function importVersion(input: ResourceImport) {
    uuid(input.operation)
    const id = identifier(input.resource),
      version = identifier(input.version)
    const fingerprint = JSON.stringify({
      ...input,
      files: input.files.map((f) => ({ ...f, bytes: hash(f.bytes) })),
    })
    const previous = imported.get(input.operation)
    if (previous) {
      if (previous.fingerprint !== fingerprint) return { failure: 'resource_conflict' as const }
      return { revision: previous.revision }
    }
    const resource = resources.get(id)
    if (
      (resource?.revision ?? 0) !== input.expectedRevision ||
      (resource &&
        (resource.kind !== 'software' || resource.versions.some((v) => v.id === version)))
    )
      return { failure: 'resource_conflict' as const }
    const declaration = { action: 'version', kind: 'software', version, variants: input.variants }
    const next = decodeResource(
      {
        id,
        kind: 'software',
        revision: input.expectedRevision + 1,
        versions: [
          ...(resource?.versions ?? []),
          {
            id: version,
            configuration: null,
            digest: hash(JSON.stringify(declaration)),
            state: 'frozen',
            variants: input.variants,
          },
        ],
      },
      id,
    )
    const staged = new Map<string, Uint8Array>()
    if (!input.variants.length) return { failure: 'content_invalid' as const }
    for (const v of next.versions.at(-1)!.variants) {
      for (const a of declarationArtifacts(v.declaration)) {
        const files = input.files.filter(
          (f) =>
            f.platform === v.platform &&
            f.architecture === v.architecture &&
            f.variant === v.key &&
            f.reference === a.reference,
        )
        if (
          files.length !== 1 ||
          files[0]!.bytes.length !== a.length ||
          a.length > MDM_CONTENT_BODY_LIMIT ||
          JSON.stringify(hash(files[0]!.bytes)) !== JSON.stringify(a.sha256)
        )
          return { failure: 'content_invalid' as const }
        staged.set(contentKey(id, version, v, a.reference), files[0]!.bytes.slice())
      }
    }
    if (staged.size !== input.files.length) return { failure: 'content_invalid' as const }
    resources.set(id, next)
    for (const [key, value] of staged) contents.set(key, value)
    imported.set(input.operation, { fingerprint, revision: next.revision })
    return { revision: next.revision }
  }
  const handle: DomainHandler = (request, scenario) => {
    const uploaded = uploads.handle(request, scenario)
    if (uploaded) return uploaded
    const match = /^\/api\/v1\/resources\/([^/]+)(\/content)?$/.exec(request.path)
    if (!match) return
    try {
      if (scenario === 'denied') return error('permission_denied', 403)
      const id = identifier(decodeURIComponent(match[1]!)),
        state = resources.get(id)
      if (match[2]) {
        if (request.method !== 'POST') return
        const version = state?.versions.find((v) => v.id === request.query.get('version'))
        const variant = version?.variants.find(
          (v) =>
            v.key === request.query.get('variant') &&
            v.platform === request.query.get('platform') &&
            v.architecture === request.query.get('architecture'),
        )
        if (!version || !variant) return error('resource_not_found', 404)
        if (
          !(request.body instanceof ArrayBuffer) ||
          !request.body.byteLength ||
          request.body.byteLength > MDM_CONTENT_BODY_LIMIT
        )
          return error('malformed_request', 400)
        if (version.state === 'archived') return error('operation_conflict')
        const bytes = new Uint8Array(request.body),
          artifact = request.query.has('artifact')
            ? declarationArtifacts(variant.declaration).find(
                (a) => a.reference === request.query.get('artifact'),
              )
            : variant.declaration.kind === 'software'
              ? variant.declaration.definition.artifacts[variant.declaration.definition.primary]
              : variant.declaration.artifact
        if (!artifact) return error('malformed_request', 400)
        if (
          bytes.byteLength !== artifact.length ||
          JSON.stringify(hash(bytes)) !== JSON.stringify(artifact.sha256)
        )
          return error('operation_conflict')
        if (
          variant.declaration.kind === 'script' &&
          variant.declaration.definition.profile === 'osquery_info_v1' &&
          new TextDecoder().decode(bytes) !== 'SELECT version FROM osquery_info;\n'
        )
          return error('malformed_request', 400)
        contents.set(contentKey(id, version.id, variant, artifact.reference), bytes.slice())
        return ok(undefined, 201)
      }
      if (request.method === 'GET')
        return state ? ok(structuredClone(state)) : error('resource_not_found', 404)
      if (request.method !== 'POST') return
      const op = operation(request.body)
      return receipts.write(request, op.operationId, () => {
        if (op.expectedRevision !== (state?.revision ?? 0)) return error('operation_conflict')
        const input = record(op.input),
          action = enumeration(input['action'], [
            'create',
            'version',
            'firewall_version',
            'activate',
            'deprecate',
            'archive',
          ] as const)
        let next: ResourceRead
        if (action === 'create') {
          closed(input, ['action', 'kind'])
          if (state) return error('operation_conflict')
          next = {
            id,
            revision: 1,
            kind: enumeration(input['kind'], ['script', 'software', 'configuration'] as const),
            versions: [],
          }
        } else {
          if (!state) return error('resource_not_found', 404)
          next = structuredClone(state)
          const versionId = identifier(input['version']),
            existing = next.versions.find((v) => v.id === versionId)
          if (action === 'version' || action === 'firewall_version') {
            if (existing) return error('operation_conflict')
            const firewall = action === 'firewall_version'
            closed(
              input,
              firewall
                ? ['action', 'version', 'enabled']
                : ['action', 'version', 'kind', 'variants'],
            )
            if (firewall ? state.kind !== 'configuration' : input['kind'] !== state.kind)
              return error('malformed_request', 400)
            const configuration = firewall ? { enabled: boolean(input['enabled']) } : null
            const decoded = decodeResource(
              {
                ...next,
                versions: [
                  {
                    id: versionId,
                    configuration,
                    digest: hash(JSON.stringify(input)),
                    state: 'frozen',
                    variants: firewall ? [] : input['variants'],
                  },
                ],
              },
              id,
            ).versions[0]!
            if (!firewall && !decoded.variants.length) return error('malformed_request', 400)
            for (const v of decoded.variants) {
              validateScriptVariant(v)
              if (
                declarationArtifacts(v.declaration).some(
                  (a) => !a.length || a.length > MDM_CONTENT_BODY_LIMIT,
                )
              )
                return error('malformed_request', 400)
            }
            next.versions.push(decoded)
          } else {
            closed(input, ['action', 'version'])
            if (!existing) return error('resource_not_found', 404)
            if (existing.state === 'archived') return error('operation_conflict')
            if (action === 'archive' && referenced(id, versionId))
              return error('operation_conflict')
            if (
              action === 'activate' &&
              existing.variants.some((v) =>
                declarationArtifacts(v.declaration).some(
                  (a) => !contents.has(contentKey(id, versionId, v, a.reference)),
                ),
              )
            )
              return error('operation_conflict')
            existing.state =
              action === 'activate' ? 'active' : action === 'deprecate' ? 'deprecated' : 'archived'
          }
          next.revision++
        }
        resources.set(id, next)
        return ok({ resource: id, request: op.operationId, storageRevision: next.revision })
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    importVersion,
    importReceipt: (operation: string) => imported.get(operation)?.revision ?? null,
    contentReady: (id: string, version: string) => {
      const v = resources.get(id)?.versions.find((v) => v.id === version)
      return (
        !!v &&
        v.variants.every((variant) =>
          declarationArtifacts(variant.declaration).every((a) =>
            contents.has(contentKey(id, version, variant, a.reference)),
          ),
        )
      )
    },
    read: (id: string) => {
      const value = resources.get(id)
      return value ? structuredClone(value) : null
    },
    list: () =>
      [...resources.values()].map((r) => ({
        id: r.id,
        label: r.id,
        revision: r.revision,
        status: 'ready' as const,
      })),
    reset() {
      resources.clear()
      contents.clear()
      receipts.reset()
      imported.clear()
      uploads.reset()
    },
  }
}
