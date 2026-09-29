import { createHash } from 'node:crypto'
import type { DomainHandler } from '../scenario'
import type { createResourceDemo } from '../policies/resources'
import { createReceipts, error, ok, operation } from '../http'
import { closed, count, digest, enumeration, identifier, record } from '../../src/services/decode'
import {
  rings,
  submission,
  type Publication,
} from '../../src/features/software/clients/publication'
const hash = (value: unknown) => [...createHash('sha256').update(JSON.stringify(value)).digest()]
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const actorId = (subject: string) => JSON.stringify(['demo-mdm', subject])
// Explicit synthetic publication bindings. Enterprise source admission is a separate owner.
export const publicationBindings = [
  { id: 'demo-winget', kind: 'Winget' as const },
  { id: 'demo-brew', kind: 'Brew' as const },
]
const publishers = new Set(['22222222-2222-4222-8222-222222222222'])
export function createPublicationDemo(resources: ReturnType<typeof createResourceDemo>) {
  const candidates = new Map<string, Publication>(),
    receipts = createReceipts()
  const intents = new Map<string, string>()
  const handle: DomainHandler = (request, scenario) => {
    const match = /^\/api\/v1\/software-sources\/([^/]+)\/candidates\/([^/]+)$/.exec(request.path)
    if (!match) return
    if (scenario === 'denied') return error('permission_denied', 403)
    try {
      const source = identifier(decodeURIComponent(match[1]!)),
        id = identifier(decodeURIComponent(match[2]!))
      const binding = publicationBindings.find((b) => b.id === source)
      if (!binding) return error('software_source_not_found', 404)
      const key = JSON.stringify([source, id]),
        previous = candidates.get(key)
      if (request.method === 'GET')
        return previous ? ok(structuredClone(previous)) : error('software_candidate_not_found', 404)
      if (request.method !== 'POST') return
      const op = operation(request.body)
      const fingerprint = JSON.stringify([request.actor.principalId, request.path, request.body])
      const priorIntent = intents.get(op.operationId)
      if (priorIntent && priorIntent !== fingerprint) return error('operation_conflict')
      return receipts.write(request, op.operationId, () => {
        const action = enumeration(record(op.input)['action'], [
          'candidate',
          'validate',
          'approve',
          'authorize',
          'publish',
          'recover',
          'retry',
          'withdraw',
        ] as const)
        const input = closed(
          op.input,
          action === 'candidate'
            ? ['action', 'resource', 'version', 'expectedResourceRevision', 'submission']
            : action === 'approve'
              ? ['action', 'ring', 'publisherSubject']
              : ['publish', 'recover'].includes(action)
                ? ['action', 'ring', 'publication', 'attempt']
                : action === 'retry'
                  ? ['action', 'ring', 'attempt']
                  : ['action', 'ring'],
        )
        if (!priorIntent && op.expectedRevision !== (previous?.revision ?? 0))
          return error('operation_conflict')
        if (action === 'candidate') {
          if (previous) return error('operation_conflict')
          const resource = resources.read(identifier(input['resource']))
          const version = resource?.versions.find((v) => v.id === identifier(input['version']))
          const value = submission(input['submission'])
          if (
            !resource ||
            resource.kind !== 'software' ||
            !version ||
            !['frozen', 'active'].includes(version.state) ||
            resource.revision !== count(input['expectedResourceRevision']) ||
            !resources.contentReady(resource.id, version.id)
          )
            return error('operation_conflict')
          if (value.kind !== binding.kind) return error('malformed_request', 400)
          const definitions = version.variants.map((v) =>
            v.declaration.kind === 'software' ? v.declaration.definition : null,
          )
          if (!definitions.length || definitions.some((d) => !d))
            return error('malformed_request', 400)
          const first = definitions[0]!
          if (
            definitions.some(
              (d) =>
                d!.package !== first.package ||
                d!.version !== first.version ||
                !same(d!.source, first.source),
            )
          )
            return error('malformed_request', 400)
          const coordinate: Record<string, unknown> =
            value.kind === 'Winget' ? record(value.manifest) : value.recipe
          if (
            (value.kind === 'Winget' ? coordinate['PackageIdentifier'] : coordinate['package']) !==
              first.package ||
            (value.kind === 'Winget' ? coordinate['PackageVersion'] : coordinate['version']) !==
              first.version
          )
            return error('malformed_request', 400)
          const next: Publication = {
            id,
            revision: 0,
            disposition: 'active',
            contentDigest: hash([version.digest, value]),
            manifestDigest: hash(value),
            sourceSnapshot: first.source.sha256,
            submission: value,
            rings: rings.map((ring) => ({
              ring,
              state: 'candidate',
              publication: null,
              approval: null,
            })),
          }
          candidates.set(key, next)
          return ok(structuredClone(next))
        }
        if (!previous) return error('software_candidate_not_found', 404)
        const next = structuredClone(previous),
          ring = enumeration(input['ring'], rings)
        const index = rings.indexOf(ring),
          state = next.rings[index]!
        const actor = actorId(request.actor.principalId)
        if (next.disposition !== 'active' && !['recover', 'withdraw'].includes(action))
          return error('operation_conflict')
        if (
          ['validate', 'approve', 'authorize'].includes(action) &&
          index > 0 &&
          next.rings[index - 1]!.publication?.outcome !== 'published'
        )
          return error('operation_conflict')
        if (action === 'validate') {
          if (state.publication) return error('operation_conflict')
          state.state = scenario === 'partial' ? 'candidate' : 'validated'
          state.approval = null
        } else if (action === 'approve') {
          const subject = identifier(input['publisherSubject'])
          if (!publishers.has(subject) || subject === request.actor.principalId)
            return error('permission_denied', 403)
          if (!['validated', 'approved'].includes(state.state)) return error('operation_conflict')
          state.state = 'approved'
          state.approval = {
            approver: actor,
            publisher: actorId(subject),
            at: Math.floor(Date.now() / 1000),
            digest: hash([op.operationId, next.contentDigest, ring, actor, subject]),
          }
        } else if (action === 'authorize') {
          if (!state.approval) return error('operation_conflict')
          if (state.approval.publisher !== actor) return error('permission_denied', 403)
          if (state.publication?.outcome === 'not_applied') return error('operation_conflict')
          state.state = 'publication'
          state.publication ??= {
            id: hash([key, ring, state.approval.digest]),
            attempt: 1,
            outcome: 'unknown',
          }
        } else if (action === 'retry') {
          if (
            state.publication?.outcome !== 'not_applied' ||
            state.publication.attempt !== count(input['attempt'])
          )
            return error('operation_conflict')
          if (state.approval?.publisher !== actor) return error('permission_denied', 403)
          state.publication.attempt++
          state.publication.outcome = 'unknown'
        } else if (action === 'publish' || action === 'recover') {
          if (
            !state.publication ||
            !same(state.publication.id, digest(input['publication'])) ||
            state.publication.attempt !== count(input['attempt'])
          )
            return error('operation_conflict')
          if (action === 'publish' && state.approval?.publisher !== actor)
            return error('permission_denied', 403)
          if (state.publication.outcome === 'unknown')
            state.publication.outcome =
              scenario === 'unknown'
                ? 'unknown'
                : scenario === 'partial'
                  ? 'not_applied'
                  : 'published'
          intents.set(op.operationId, fingerprint)
        } else {
          if (next.disposition === 'quarantined') return error('operation_conflict')
          next.disposition = 'deprecated'
          // GET retains historical ring results; only this write acknowledges withdrawal.
          intents.set(op.operationId, fingerprint)
        }
        if (!same(previous, next)) next.revision++
        candidates.set(key, next)
        if (
          ((action === 'publish' || action === 'recover') &&
            state.publication?.outcome === 'unknown') ||
          (action === 'withdraw' && ['unknown', 'partial'].includes(scenario))
        )
          return error('operation_unknown', 503)
        return ok(structuredClone(next))
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    list: () =>
      structuredClone(
        [...candidates.entries()].map(([key, value]) => ({
          source: (JSON.parse(key) as string[])[0]!,
          ...value,
        })),
      ),
    reset() {
      candidates.clear()
      receipts.reset()
      intents.clear()
    },
  }
}
