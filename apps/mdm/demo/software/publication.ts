import { directoryPage } from '../directory'
import { createHash } from 'node:crypto'
import type { DomainHandler } from '../scenario'
import type { createResourceDemo } from '../policies/resources'
import type { createLifecycleDemo } from './lifecycle'
import { createReceipts, error, ok, operation } from '../http'
import { closed, count, digest, enumeration, identifier, record } from '../../src/services/decode'
import type { Publication } from '../../src/features/software/clients/publication'
const hash = (v: unknown) => [...createHash('sha256').update(JSON.stringify(v)).digest()],
  same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export const publicationTargets = ['winget', 'brew'].map((protocol) => ({
  id: `demo-${protocol}`,
  protocol,
  digest: hash(['target', protocol]),
}))
export function createPublicationDemo(
  resources: ReturnType<typeof createResourceDemo>,
  lifecycle: ReturnType<typeof createLifecycleDemo>,
  canEnableDraft: (actor: string) => boolean,
) {
  const rows = new Map<string, { value: Publication; lifecycle: string | null }>(),
    receipts = createReceipts(),
    operations = new Map<string, string>(),
    recoveries = new Map<string, { fingerprint: number[]; attempt: number }>()
  const refresh = (row: { value: Publication; lifecycle: string | null }) => {
    const state = lifecycle.versionState(row.value.resource, row.value.version)
    if (state?.state === 'withdrawn' || (state && state.operation !== row.lifecycle)) {
      row.value.withdrawn = true
      row.value.withdrawal = 'withdrawn'
    }
    return structuredClone(row.value)
  }
  const handle: DomainHandler = (request, scenario) => {
    const collection = request.path === '/api/v1/software/publications',
      targets = request.path === '/api/v1/software/publication-targets',
      m = /^\/api\/v1\/software\/publications\/([^/]+)$/.exec(request.path)
    if (!collection && !targets && !m) return
    if (scenario === 'denied') return error('permission_denied', 403)
    try {
      if (request.method === 'GET') {
        if (m) {
          const row = rows.get(identifier(decodeURIComponent(m[1]!)))
          return row ? ok(refresh(row)) : error('software_publication_not_found', 404)
        }
        const values: Record<string, unknown>[] = targets
          ? publicationTargets
          : [...rows.values()].map(refresh)
        return ok(
          directoryPage(values, request, ['id'], {
            maxLimit: 100,
            lookup: (row, field) =>
              field === 'operationId'
                ? [...operations].filter(([, id]) => id === row.id).map(([op]) => op)
                : row[field as keyof typeof row],
          }),
        )
      }
      if (request.method !== 'POST' || targets) return
      const op = operation(request.body),
        action = enumeration(record(op.input)['action'], [
          'publish',
          'recover',
          'retry',
          'withdraw',
        ] as const),
        input = closed(
          op.input,
          action === 'publish'
            ? [
                'action',
                'resource',
                'version',
                'expectedResourceRevision',
                'resourceDigest',
                'target',
                'targetDigest',
              ]
            : ['action'],
        ),
        id = collection ? op.operationId : identifier(decodeURIComponent(m![1]!))
      if (collection !== (action === 'publish')) return error('malformed_request', 400)
      if (action === 'recover') {
        const row = rows.get(id)
        if (!row) return error('software_publication_not_found', 404)
        const fingerprint = hash([request.actor.principalId, request.path, request.body]),
          accepted = recoveries.get(op.operationId)
        if (
          accepted
            ? !same(accepted.fingerprint, fingerprint)
            : row.value.revision !== op.expectedRevision
        )
          return error('operation_conflict')
        if (!accepted) recoveries.set(op.operationId, { fingerprint, attempt: row.value.attempt })
        operations.set(op.operationId, id)
        if (accepted && row.value.attempt > accepted.attempt) return ok(refresh(row))
        refresh(row)
        const before = JSON.stringify(row.value)
        if (row.value.withdrawn)
          row.value.withdrawal = scenario === 'unknown' ? 'unknown' : 'withdrawn'
        else
          row.value.outcome =
            scenario === 'unknown'
              ? 'unknown'
              : scenario === 'partial'
                ? 'not_applied'
                : 'published'
        if (before !== JSON.stringify(row.value)) row.value.revision++
        return scenario === 'unknown'
          ? error('operation_unknown', 503)
          : ok(structuredClone(row.value))
      }
      return receipts.write(request, op.operationId, () => {
        const old = rows.get(id)
        if (op.expectedRevision !== (old?.value.revision ?? 0)) return error('operation_conflict')
        if (action === 'publish') {
          if (old) return error('operation_conflict')
          const target = publicationTargets.find((v) => v.id === input['target'])
          if (!target) return error('software_source_not_found', 404)
          if (!same(target.digest, digest(input['targetDigest'])))
            return error('operation_conflict')
          const r = resources.read(identifier(input['resource'])),
            v = r?.versions.find((v) => v.id === input['version'])
          if (
            r?.kind !== 'software' ||
            !v ||
            !['active', 'frozen'].includes(v.state) ||
            r.revision !== count(input['expectedResourceRevision']) ||
            !same(v.digest, digest(input['resourceDigest'])) ||
            !resources.contentReady(r.id, v.id)
          )
            return error('operation_conflict')
          const declaration = v.variants[0]?.declaration
          if (
            declaration?.kind !== 'software' ||
            declaration.definition.export.kind !== target.protocol
          )
            return error('action_not_supported', 501)
          if (!lifecycle.isEnabled(r.id, v.id) && !canEnableDraft(request.actor.principalId))
            return error('permission_denied', 403)
          const d = declaration.definition
          let document: Publication['document']
          if (d.export.kind === 'winget')
            document = {
              kind: 'Winget',
              manifest: {
                PackageIdentifier: d.package,
                Versions: [
                  { PackageVersion: d.version, DefaultLocale: { PackageName: d.export.name } },
                ],
              },
            }
          else if (d.export.kind === 'brew' && d.export.payload.kind === 'cask') {
            const payload = d.export.payload
            document = {
              kind: 'Brew',
              recipe: {
                package: d.package,
                version: d.version,
                name: d.export.name,
                description: d.export.description,
                homepage: d.export.homepage,
                payload: {
                  kind: 'Cask',
                  install: payload.receipts.length
                    ? { kind: 'Pkg', path: payload.path, receipts: payload.receipts }
                    : { kind: 'App', path: payload.path },
                  artifacts: v.variants.flatMap((variant) => {
                    if (variant.declaration.kind !== 'software') return []
                    return Object.entries(variant.declaration.definition.artifacts).map(
                      ([key, a]) => ({
                        architecture: variant.architecture,
                        artifact: {
                          key,
                          url: a.origin ?? `https://demo.invalid/artifacts/${a.reference}`,
                          length: a.length,
                          sha256: a.sha256,
                        },
                      }),
                    )
                  }),
                },
              },
            }
          } else return error('action_not_supported', 501)
          if (!lifecycle.enableDraft(r.id, v.id, request.actor.principalId, op.operationId))
            return error('operation_conflict')
          const value: Publication = {
            id,
            revision: 0,
            target: target.id,
            resource: r.id,
            version: v.id,
            publication: hash([id, target.id, v.digest]),
            contentDigest: v.digest,
            manifestDigest: hash(document),
            targetDigest: target.digest,
            attempt: 1,
            outcome: 'pending',
            withdrawn: false,
            withdrawal: null,
            document,
          }
          rows.set(id, { value, lifecycle: lifecycle.versionState(r.id, v.id)?.operation ?? null })
          operations.set(op.operationId, id)
          return ok(structuredClone(value), 202)
        }
        if (!old) return error('software_publication_not_found', 404)
        refresh(old)
        if (action === 'retry') {
          if (
            old.value.outcome !== 'not_applied' ||
            old.value.withdrawn ||
            !lifecycle.isEnabled(old.value.resource, old.value.version)
          )
            return error('operation_conflict')
          old.value.attempt++
          old.value.outcome = 'pending'
        } else {
          old.value.withdrawn = true
          old.value.withdrawal =
            old.value.outcome === 'unknown'
              ? 'waiting_publication'
              : old.value.outcome === 'published'
                ? 'withdrawn'
                : 'not_published'
          if (old.value.outcome === 'pending') old.value.outcome = 'not_applied'
        }
        old.value.revision++
        operations.set(op.operationId, id)
        return ok(structuredClone(old.value))
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    binding(target: string, resource: string, version: string) {
      const row = [...rows.values()].find((row) => {
        const v = refresh(row)
        return (
          v.target === target &&
          v.resource === resource &&
          v.version === version &&
          v.outcome === 'published' &&
          !v.withdrawn
        )
      })
      return row && lifecycle.isEnabled(resource, version)
        ? JSON.stringify([row.value.publication, row.value.targetDigest])
        : null
    },
    reset() {
      rows.clear()
      receipts.reset()
      operations.clear()
      recoveries.clear()
    },
  }
}
