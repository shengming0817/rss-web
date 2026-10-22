import { endpointObject, type DeviceObject } from '../devices/objects'
import { objectKey, type Channel } from '../../src/features/devices/clients/objects'
import { targetFacts } from './targets'
import type { DomainHandler } from '../scenario'
import { randomUUID } from 'node:crypto'
import type { createDeviceDemo } from '../devices/state'
import { closed, enumeration, record, uuid } from '../../src/services/decode'
import {
  scopeDefinition,
  type ScopeRead,
  type Reference,
} from '../../src/features/policies/clients/scopes'
import { createPages, createReceipts, error, ok, operation } from '../http'
type Devices = Pick<ReturnType<typeof createDeviceDemo>, 'facts' | 'publishedGroup' | 'objects'>
type AuthoredScope = Pick<ScopeRead, 'id' | 'revision' | 'definition'>
interface Source {
  reference: Reference
  memberSet: string | null
  memberVersion: number
  definitionVersion: number
  authorityVersion: number
  candidates: { input: DeviceObject; unknown: boolean }[]
}
interface FrozenScope {
  id: string
  revision: number
  definition: ScopeRead['definition']
  sources: Source[]
}
interface Job {
  frozen: FrozenScope
  reads: number
  status: 'running' | 'completed' | 'superseded' | 'failed'
}
export function createScopeDemo(devices: Devices) {
  const managedScopes = new Set<string>()
  const scopes = new Map<string, AuthoredScope>(),
    deleted = new Set<string>(),
    jobs = new Map<string, Job>(),
    current = new Map<string, string>()
  const receipts = createReceipts(),
    pages = createPages()
  function resolve(read: AuthoredScope): Job {
    const sources: Source[] = []
    const facts = devices.facts()
    for (const reference of [
      ...read.definition.targets,
      ...(read.definition.limitations ?? []),
      ...read.definition.exclusions,
    ]) {
      if (
        sources.some((s) => s.reference.kind === reference.kind && s.reference.id === reference.id)
      )
        continue
      const group = reference.kind === 'group' ? devices.publishedGroup(reference.id) : null
      const device = facts.find((d) => d.summary.id === reference.id)
      if (reference.kind === 'group' ? !group : !device) throw new Error('Unknown reference')
      if (group && !group.ready) throw new Error('Group source pending')
      sources.push({
        reference,
        memberSet: group?.memberSet ?? null,
        memberVersion: group?.memberVersion ?? device!.summary.revision,
        definitionVersion: group?.definitionVersion ?? device!.summary.revision,
        authorityVersion: group?.authorityVersion ?? 1,
        candidates: group?.candidates ?? [{ input: endpointObject(device!), unknown: false }],
      })
    }
    return {
      frozen: {
        id: read.id,
        revision: read.revision,
        definition: structuredClone(read.definition),
        sources,
      },
      reads: 0,
      status: 'running',
    }
  }
  function projection(frozen: FrozenScope, channel?: Channel) {
    const ids = (refs: Reference[], known = false) =>
      new Set(
        refs.flatMap((ref) =>
          frozen.sources
            .filter((s) => s.reference.kind === ref.kind && s.reference.id === ref.id)
            .flatMap((s) =>
              s.candidates
                .filter((c) => !known || !c.unknown)
                .flatMap((c) =>
                  c.input.members
                    .filter((m) => !channel || m.channel === channel)
                    .map((m) => m.device),
                ),
            ),
        ),
      )
    const targets = ids(frozen.definition.targets),
      knownTargets = ids(frozen.definition.targets, true),
      limitations =
        frozen.definition.limitations === null ? null : ids(frozen.definition.limitations),
      knownLimitations =
        frozen.definition.limitations === null ? null : ids(frozen.definition.limitations, true),
      exclusions = ids(frozen.definition.exclusions),
      knownExclusions = ids(frozen.definition.exclusions, true)
    const excludedByLimit = [...targets].filter((id) => limitations && !limitations.has(id)),
      excludedExplicitly = [...targets].filter((id) => knownExclusions.has(id)),
      excluded = new Set([...excludedByLimit, ...excludedExplicitly]),
      pending = [...targets].filter(
        (id) =>
          !excluded.has(id) &&
          (!knownTargets.has(id) ||
            (knownLimitations && !knownLimitations.has(id)) ||
            exclusions.has(id)),
      )
    const objects = [
      ...new Map(
        frozen.sources
          .filter((s) =>
            frozen.definition.targets.some(
              (r) => r.kind === s.reference.kind && r.id === s.reference.id,
            ),
          )
          .flatMap((s) => s.candidates.map((c) => c.input))
          .map((o) => [objectKey(o.object), o]),
      ).values(),
    ]
    return {
      ...frozen,
      objects,
      members: [...targets].filter((id) => !excluded.has(id) && !pending.includes(id)),
      devices: [...targets],
      pending,
      excludedByLimit,
      excludedExplicitly,
    }
  }
  function reconcile(id: string) {
    const read = scopes.get(id),
      old = current.get(id),
      job = old ? jobs.get(old) : undefined
    if (!read || !job || deleted.has(id) || job.frozen.revision !== read.revision) return false
    let next: Job
    try {
      next = resolve(read)
    } catch {
      return false
    }
    if (JSON.stringify(next.frozen) === JSON.stringify(job.frozen)) return true
    const task = randomUUID()
    next.status = 'completed'
    jobs.set(task, next)
    current.set(id, task)
    return true
  }
  const handle: DomainHandler = (request, scenario) => {
    const match =
      /^\/api\/v1\/scopes\/([^/]+)(?:\/(tasks|results)\/([^/]+)(?:\/(members|decisions))?)?$/.exec(
        request.path,
      )
    if (request.path === '/api/v1/scopes' && request.method === 'GET') {
      const items = [...scopes.values()]
          .filter((s) => !deleted.has(s.id) && s.id > (request.query.get('after') ?? ''))
          .filter((s) => {
            const ready = request.query.get('ready')
            const job = jobs.get(current.get(s.id) ?? '')
            const fresh = job?.status === 'completed' && job.frozen.revision === s.revision
            return ready === null || fresh === (ready === 'true')
          })
          .sort((a, b) => a.id.localeCompare(b.id)),
        limit = Number(request.query.get('limit') ?? 20)
      return ok({
        items: items.slice(0, limit).map((s) => ({
          id: s.id,
          revision: s.revision,
          deleted: false,
          calculationRevision: s.revision,
          resolution: current.get(s.id) ?? null,
          resolutionRevision: jobs.get(current.get(s.id) ?? '')?.frozen.revision ?? null,
        })),
        nextCursor: items.length > limit ? items[limit - 1]!.id : null,
      })
    }
    if (!match) return
    try {
      const id = uuid(match[1]),
        read = scopes.get(id)
      if (scenario === 'denied') return error('permission_denied', 403)
      if (request.method === 'GET' && match[2]) {
        const task = uuid(match[3]),
          job = jobs.get(task)
        if (!job || job.frozen.id !== id) return error('scope_not_found', 404)
        if (match[2] === 'tasks') {
          if (job.status === 'running' && job.reads++ > 0) {
            job.status =
              deleted.has(id) || read?.revision !== job.frozen.revision
                ? 'superseded'
                : scenario === 'partial'
                  ? 'failed'
                  : 'completed'
            if (job.status === 'completed') current.set(id, task)
          }
          return ok({
            task,
            kind: 'scope',
            target: id,
            status: job.status,
            processed: job.status === 'running' ? 0 : projection(job.frozen).devices.length,
            members: projection(job.frozen).members.length,
            failure: job.status === 'failed' ? 'stale_plan' : null,
            failureDetail: null,
            replacementTask: null,
          })
        }
        if (job.status !== 'completed') return error('operation_conflict')
        const kind = enumeration(match[4], ['members', 'decisions'] as const),
          channel = enumeration(request.query.get('channel'), ['mdm', 'agent'] as const)
        const projected = projection(job.frozen, channel),
          eligible = (id: string) => projected.members.includes(id)
        const values =
          kind === 'members'
            ? projected.members.map((id) => ({ kind: 'endpoint', id }))
            : projected.devices.map((id) => ({
                object: { kind: 'endpoint', id },
                qualification: eligible(id)
                  ? { state: 'eligible', entry: 1 }
                  : projected.excludedByLimit.includes(id) ||
                      projected.excludedExplicitly.includes(id)
                    ? { state: 'excluded' }
                    : { state: 'pending' },
                reasons: [
                  ...(projected.excludedByLimit.includes(id) ? ['missing_limitation_match'] : []),
                  ...(projected.excludedExplicitly.includes(id) ? ['explicit_exclusion'] : []),
                ],
                targets: job.frozen.sources
                  .filter((s) =>
                    s.candidates.some((c) =>
                      c.input.members.some((m) => m.device === id && m.channel === channel),
                    ),
                  )
                  .map((s) => ({ reference: s.reference, version: s.memberVersion })),
                limitations: [],
                exclusions: [],
              }))
        const page = pages.page<unknown>(request.path + ':' + channel, values, request.query, task)
        return ok({
          result: task,
          scope: id,
          current:
            current.get(id) === task && read?.revision === job.frozen.revision && !deleted.has(id),
          channel,
          page: { kind, items: page.items },
          nextCursor: page.nextCursor,
        })
      }
      if (request.method === 'GET')
        return read && !deleted.has(id)
          ? ok({
              ...structuredClone(read),
              resolution: current.get(id) ?? null,
              resolutionRevision: jobs.get(current.get(id) ?? '')?.frozen.revision ?? 0,
            })
          : error('scope_not_found', 404)
      if (request.method !== 'POST' || match[2]) return
      if (managedScopes.has(id)) return error('permission_denied', 403)
      const op = operation(request.body)
      return receipts.write(request, op.operationId, () => {
        if (op.expectedRevision !== (read?.revision ?? 0) || deleted.has(id))
          return error('operation_conflict')
        const input = record(op.input),
          action = enumeration(input['action'], ['put', 'delete'] as const)
        if (action === 'delete') {
          closed(input, ['action'])
          if (!read) return error('scope_not_found', 404)
          read.revision++
          deleted.add(id)
          current.delete(id)
          return ok({ id, revision: read.revision, task: null })
        }
        closed(input, ['action', 'definition'])
        const next = {
          id,
          revision: (read?.revision ?? 0) + 1,
          definition: scopeDefinition(input['definition']),
        }
        const job = resolve(next)
        scopes.set(id, next)
        jobs.set(op.operationId, job)
        return ok({ id, revision: next.revision, task: op.operationId })
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    forManagedDevices<T>(devices: string[], bind: (scope: string) => T): T {
      const id = randomUUID(),
        task = randomUUID()
      const read: AuthoredScope = {
        id,
        revision: 1,
        definition: {
          targets: devices.map((id) => ({ kind: 'device', id })),
          limitations: null,
          exclusions: [],
        },
      }
      const job = resolve(read)
      job.status = 'completed'
      scopes.set(id, read)
      jobs.set(task, job)
      current.set(id, task)
      managedScopes.add(id)
      try {
        return bind(id)
      } catch (error) {
        scopes.delete(id)
        jobs.delete(task)
        current.delete(id)
        managedScopes.delete(id)
        throw error
      }
    },
    snapshot(id: string) {
      reconcile(id)
      const result = current.get(id),
        job = result ? jobs.get(result) : undefined
      if (!result || !job || deleted.has(id)) return null
      return { result, ...projection(job.frozen) }
    },
    list: () =>
      [...scopes.values()]
        .filter((s) => !deleted.has(s.id))
        .map((s) => ({ id: s.id, label: s.id, revision: s.revision, status: 'ready' as const })),
    resolve(id: string, channel?: Channel) {
      const read = scopes.get(id)
      if (!read || deleted.has(id)) return null
      try {
        return projection(structuredClone(resolve(read).frozen), channel)
      } catch {
        return null
      }
    },
    freeze(id: string, channel?: Channel) {
      const task = current.get(id),
        job = task ? jobs.get(task) : null,
        read = scopes.get(id)
      if (!job || !read || deleted.has(id) || read.revision !== job.frozen.revision) return null
      // Published pages remain immutable. Consumers must revalidate source versions
      // before using that publication to authorize a new plan or workflow.
      try {
        if (managedScopes.has(id)) return projection(structuredClone(resolve(read).frozen), channel)
        if (JSON.stringify(resolve(read).frozen) !== JSON.stringify(job.frozen)) return null
        return projection(structuredClone(job.frozen), channel)
      } catch {
        return null
      }
    },
    assignments(id: string, channel: Channel) {
      const ready = reconcile(id)
      const read = scopes.get(id),
        result = current.get(id)
      if (!read || !result || deleted.has(id)) return []
      const projected = projection(jobs.get(result)!.frozen, channel)
      return projected.objects.map((object) => {
        const facts = targetFacts(devices, object, channel),
          device = facts.target?.device
        const qualification =
          ready && device
            ? projected.pending.includes(device)
              ? { state: 'pending' as const }
              : projected.members.includes(device)
                ? { state: 'eligible' as const, entry: 1 }
                : { state: 'excluded' as const }
            : { state: 'pending' as const }
        return {
          ...facts,
          scopeResult: result,
          qualification,
          availability:
            facts.availability === 'ready' && qualification.state === 'eligible'
              ? ('ready' as const)
              : ('unavailable' as const),
          reason:
            facts.reason ??
            (qualification.state === 'pending'
              ? 'source_pending'
              : qualification.state === 'excluded'
                ? 'scope_excluded'
                : null),
        }
      })
    },
    reset() {
      scopes.clear()
      deleted.clear()
      jobs.clear()
      current.clear()
      receipts.reset()
      pages.reset()
      managedScopes.clear()
    },
  }
}
