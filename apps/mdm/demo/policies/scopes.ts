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
type Devices = Pick<ReturnType<typeof createDeviceDemo>, 'facts' | 'publishedGroup'>
interface Source {
  reference: Reference
  memberSet: string | null
  memberVersion: number
  definitionVersion: number
  authorityVersion: number
}
interface FrozenScope {
  id: string
  revision: number
  members: string[]
  sources: Source[]
}
interface Job {
  frozen: FrozenScope
  reads: number
  status: 'running' | 'completed' | 'superseded' | 'failed'
  decisions: {
    device: string
    identity: 'active' | 'inactive'
    reasons: ('explicit_exclusion' | 'missing_limitation_match')[]
    sources: number[]
  }[]
}
export function createScopeDemo(devices: Devices) {
  const managedScopes = new Set<string>()
  const scopes = new Map<string, ScopeRead>(),
    deleted = new Set<string>(),
    jobs = new Map<string, Job>(),
    current = new Map<string, string>()
  const receipts = createReceipts(),
    pages = createPages()
  function resolve(read: ScopeRead): Job {
    const sources: Source[] = [],
      membership: string[][] = []
    const facts = devices.facts()
    function expand(refs: Reference[]) {
      return new Set(
        refs.flatMap((reference) => {
          let index = sources.findIndex(
            (s) => s.reference.kind === reference.kind && s.reference.id === reference.id,
          )
          if (index < 0) {
            const group = reference.kind === 'group' ? devices.publishedGroup(reference.id) : null
            const device = facts.find((d) => d.summary.id === reference.id)
            if (reference.kind === 'group' ? !group : !device) throw new Error('Unknown reference')
            index = sources.length
            sources.push({
              reference,
              memberSet: group?.memberSet ?? null,
              memberVersion: group?.memberVersion ?? device!.summary.revision,
              definitionVersion: group?.definitionVersion ?? device!.summary.revision,
              authorityVersion: group?.authorityVersion ?? 1,
            })
            membership.push(group?.members ?? [reference.id])
          }
          return membership[index]!
        }),
      )
    }
    const targets = expand(read.definition.targets),
      limitations =
        read.definition.limitations === null ? null : expand(read.definition.limitations),
      exclusions = expand(read.definition.exclusions)
    const decisions: Job['decisions'] = [...targets].map((device) => ({
      device,
      identity: facts.some((d) => d.summary.id === device) ? 'active' : 'inactive',
      reasons: [
        ...(limitations && !limitations.has(device) ? ['missing_limitation_match' as const] : []),
        ...(exclusions.has(device) ? ['explicit_exclusion' as const] : []),
      ],
      sources: membership.flatMap((members, index) => (members.includes(device) ? [index] : [])),
    }))
    return {
      frozen: {
        id: read.id,
        revision: read.revision,
        members: decisions
          .filter((d) => d.identity === 'active' && !d.reasons.length)
          .map((d) => d.device),
        sources,
      },
      reads: 0,
      status: 'running',
      decisions,
    }
  }
  const handle: DomainHandler = (request, scenario) => {
    const match =
      /^\/api\/v1\/scopes\/([^/]+)(?:\/(tasks|results)\/([^/]+)(?:\/(members|decisions))?)?$/.exec(
        request.path,
      )
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
            processed: job.status === 'running' ? 0 : job.decisions.length,
            members: job.frozen.members.length,
            plan: null,
            failure: job.status === 'failed' ? 'stale_plan' : null,
            failureDetail: null,
            execution: null,
            policyRevision: null,
          })
        }
        if (job.status !== 'completed') return error('operation_conflict')
        const kind = enumeration(match[4], ['members', 'decisions'] as const)
        const page = pages.page<unknown>(
          request.path,
          kind === 'members' ? job.frozen.members : job.decisions,
          request.query,
          task,
        )
        return ok({
          result: task,
          scope: id,
          current:
            current.get(id) === task && read?.revision === job.frozen.revision && !deleted.has(id),
          totalObjects: job.decisions.length,
          totalMembers: job.frozen.members.length,
          sources: job.frozen.sources,
          page: { kind, items: page.items },
          nextCursor: page.nextCursor,
        })
      }
      if (request.method === 'GET')
        return read && !deleted.has(id) ? ok(structuredClone(read)) : error('scope_not_found', 404)
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
      const read: ScopeRead = {
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
      const result = current.get(id),
        job = result ? jobs.get(result) : undefined
      if (!result || !job || deleted.has(id) || scopes.get(id)?.revision !== job.frozen.revision)
        return null
      return { result, devices: job.decisions.map((d) => d.device) }
    },
    list: () =>
      [...scopes.values()]
        .filter((s) => !deleted.has(s.id))
        .map((s) => ({ id: s.id, label: s.id, revision: s.revision, status: 'ready' as const })),
    resolve(id: string) {
      const read = scopes.get(id)
      if (!read || deleted.has(id)) return null
      try {
        return structuredClone(resolve(read).frozen)
      } catch {
        return null
      }
    },
    freeze(id: string) {
      const task = current.get(id),
        job = task ? jobs.get(task) : null,
        read = scopes.get(id)
      if (!job || !read || deleted.has(id) || read.revision !== job.frozen.revision) return null
      // Published pages remain immutable. Consumers must revalidate source versions
      // before using that publication to authorize a new plan or workflow.
      try {
        if (managedScopes.has(id)) return structuredClone(resolve(read).frozen)
        if (JSON.stringify(resolve(read).frozen) !== JSON.stringify(job.frozen)) return null
        return structuredClone(job.frozen)
      } catch {
        return null
      }
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
