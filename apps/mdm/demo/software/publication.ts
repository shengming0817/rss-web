import { createHash } from 'node:crypto'
import type { DomainHandler } from '../scenario'
import type { createResourceDemo } from '../policies/resources'
import type { createLifecycleDemo } from './lifecycle'
import { createReceipts, error, ok, operation } from '../http'
import { closed, count, digest, enumeration, identifier, record } from '../../src/services/decode'
import { rings, type Publication } from '../../src/features/software/clients/publication'
const hash = (v: unknown) => [...createHash('sha256').update(JSON.stringify(v)).digest()],
  same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export const publicationBindings = [
  { id: 'demo-winget', kind: 'Winget' as const },
  { id: 'demo-brew', kind: 'Brew' as const },
]
export function createPublicationDemo(
  resources: ReturnType<typeof createResourceDemo>,
  lifecycle: ReturnType<typeof createLifecycleDemo>,
) {
  const rows = new Map<
      string,
      { value: Publication; resource: string; version: string; reads: number }
    >(),
    receipts = createReceipts()
  const handle: DomainHandler = (request, scenario) => {
    const m = /^\/api\/v1\/software-sources\/([^/]+)\/candidates\/([^/]+)$/.exec(request.path)
    if (!m) return
    if (scenario === 'denied') return error('permission_denied', 403)
    try {
      const source = identifier(decodeURIComponent(m[1]!)),
        id = identifier(decodeURIComponent(m[2]!)),
        binding = publicationBindings.find((b) => b.id === source),
        key = JSON.stringify([source, id]),
        old = rows.get(key)
      if (!binding) return error('software_source_not_found', 404)
      if (binding.kind === 'Brew') return error('action_not_supported', 501)
      if (request.method === 'GET') {
        if (!old) return error('software_candidate_not_found', 404)
        if (scenario === 'normal' && old.reads++ > 0)
          for (const ring of old.value.rings)
            if (ring.publication?.outcome === 'pending') ring.publication.outcome = 'published'
        return ok(structuredClone(old.value))
      }
      if (request.method !== 'POST') return
      const op = operation(request.body),
        action = enumeration(record(op.input)['action'], [
          'candidate',
          'publish',
          'recover',
          'retry',
          'withdraw',
        ] as const),
        input = closed(
          op.input,
          action === 'candidate'
            ? ['action', 'resource', 'version', 'expectedResourceRevision', 'resourceDigest']
            : action === 'recover'
              ? ['action', 'ring', 'publication', 'attempt']
              : action === 'retry'
                ? ['action', 'ring', 'attempt']
                : ['action', 'ring'],
        )
      return receipts.write(request, op.operationId, () => {
        if (op.expectedRevision !== (old?.value.revision ?? 0)) return error('operation_conflict')
        if (action === 'candidate') {
          if (old) return error('operation_conflict')
          const resource = resources.read(identifier(input['resource'])),
            version = resource?.versions.find((v) => v.id === input['version'])
          if (
            resource?.kind !== 'software' ||
            !version ||
            !['active', 'frozen'].includes(version.state) ||
            resource.revision !== count(input['expectedResourceRevision']) ||
            !same(version.digest, digest(input['resourceDigest'])) ||
            !resources.contentReady(resource.id, version.id)
          )
            return error('operation_conflict')
          const d = version.variants[0]?.declaration
          if (
            d?.kind !== 'software' ||
            d.definition.export.kind === 'disabled' ||
            (d.definition.export.kind === 'winget') !== (binding.kind === 'Winget')
          )
            return error('action_not_supported', 501)
          const document: Publication['document'] =
            binding.kind === 'Winget'
              ? {
                  kind: 'Winget',
                  manifest: {
                    PackageIdentifier: d.definition.package,
                    Versions: [
                      {
                        PackageVersion: d.definition.version,
                        DefaultLocale: {
                          PackageName:
                            d.definition.export.kind === 'winget'
                              ? d.definition.export.name
                              : d.definition.package,
                        },
                      },
                    ],
                  },
                }
              : undefined
          const value: Publication = {
            id,
            revision: 0,
            contentDigest: version.digest,
            manifestDigest: hash(document),
            sourceSnapshot: hash(source),
            disposition: 'active',
            rings: rings.map((ring) => ({ ring, state: 'candidate', publication: null })),
            ...(document ? { document } : {}),
          }
          rows.set(key, { value, resource: resource.id, version: version.id, reads: 0 })
          const { document: _document, ...summary } = value
          void _document
          return ok(summary)
        }
        if (!old) return error('software_candidate_not_found', 404)
        const ring = enumeration(input['ring'], rings),
          index = rings.indexOf(ring),
          r = old.value.rings[index]!
        if (action === 'publish') {
          if (
            r.publication ||
            old.value.disposition !== 'active' ||
            (index > 0 && old.value.rings[index - 1]?.publication?.outcome !== 'published')
          )
            return error('operation_conflict')
          if (
            !lifecycle.enableDraft(
              old.resource,
              old.version,
              request.actor.principalId,
              op.operationId,
            )
          )
            return error('operation_conflict')
          if (!resources.activatePublished(old.resource, old.version))
            return error('operation_conflict')
          r.state = 'publication'
          r.publication = { id: hash([source, id, ring]), attempt: 1, outcome: 'pending' }
        } else if (action === 'recover') {
          if (
            !r.publication ||
            !same(r.publication.id, digest(input['publication'])) ||
            r.publication.attempt !== count(input['attempt'])
          )
            return error('operation_conflict')
          r.publication.outcome =
            scenario === 'unknown'
              ? 'unknown'
              : scenario === 'partial'
                ? 'not_applied'
                : 'published'
        } else if (action === 'retry') {
          if (
            r.publication?.outcome !== 'not_applied' ||
            r.publication.attempt !== count(input['attempt']) ||
            !lifecycle.isEnabled(old.resource, old.version)
          )
            return error('operation_conflict')
          r.publication.attempt++
          r.publication.outcome = 'pending'
        } else {
          if (r.publication?.outcome !== 'published') return error('operation_conflict')
          old.value.disposition = 'deprecated'
        }
        old.value.revision++
        const { document: _document, ...summary } = old.value
        void _document
        return ok(structuredClone(summary), action === 'publish' ? 202 : 200)
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    reset() {
      rows.clear()
      receipts.reset()
    },
  }
}
