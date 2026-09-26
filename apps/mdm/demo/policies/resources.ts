import { createHash } from 'node:crypto'
import type { DomainHandler } from '../scenario'
import { MDM_CONTENT_BODY_LIMIT } from '@rss/api/mdm-limits'
import { boolean, closed, enumeration, identifier, record } from '../../src/services/decode'
import {
  decodeResource,
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
) => JSON.stringify([resource, version, v.platform, v.architecture, v.key])
export function createResourceDemo(referenced: (id: string, version: string) => boolean) {
  const resources = new Map<string, ResourceRead>(),
    contents = new Map<string, Uint8Array>(),
    receipts = createReceipts()
  const handle: DomainHandler = (request, scenario) => {
    const match = /^\/api\/v3\/resources\/([^/]+)(\/content)?$/.exec(request.path)
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
          artifact = variant.declaration.artifact
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
        contents.set(contentKey(id, version.id, variant), bytes.slice())
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
                !v.declaration.artifact.length ||
                v.declaration.artifact.length > MDM_CONTENT_BODY_LIMIT
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
              existing.variants.some((v) => !contents.has(contentKey(id, versionId, v)))
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
    },
  }
}
