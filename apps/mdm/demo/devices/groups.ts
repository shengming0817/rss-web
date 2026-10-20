import { randomUUID } from 'node:crypto'
import type { DomainHandler } from '../scenario'
import {
  array,
  closed,
  enumeration,
  identifier,
  record,
  string,
  uuid,
} from '../../src/services/decode'
import { criteria } from '../../src/features/devices/clients/asset-model'
import type { GroupRead } from '../../src/features/devices/clients/groups'
import type { DemoDevice } from './fixtures'
import { createPages, createReceipts, error, ok, operation } from '../http'
import { mergedFieldState } from './views'
import { evaluate, referencedFields } from './criteria'
import { objectRef, objectKey, type deviceObject } from '../../src/features/devices/clients/objects'
type DeviceObject = ReturnType<typeof deviceObject>
type Decision = ReturnType<typeof evaluate> & {
  device: string
  origin: 'rule' | 'manual'
  provenance: { field: string; source: string; snapshot_id: string; observed_at: number }[]
}
interface GroupState {
  read: GroupRead
  members: string[]
}
interface Job {
  group: string
  revision: number
  publish: boolean
  reads: number
  status: 'running' | 'completed' | 'superseded' | 'failed'
  members: string[]
  added: string[]
  removed: string[]
  decisions: Decision[]
  ruleVersion: string | null
  inputs: string
}
export function createGroupDemo(
  devices: () => Map<string, DemoDevice>,
  objects: () => DeviceObject[],
) {
  const groups = new Map<string, GroupState>(),
    jobs = new Map<string, Job>()
  const pages = createPages(),
    receipts = createReceipts()
  function inputs(read: GroupRead) {
    const selected = read.criteria ? referencedFields(read.criteria) : []
    return JSON.stringify([
      [read.group.assetContext === 'associated_device' ? objects() : null],
      ...[...devices().values()].map((d) => [
        d.summary.id,
        d.registrations,
        selected.map((f) => d.inventory.fields[f] ?? null),
      ]),
    ])
  }
  function reset() {
    groups.clear()
    jobs.clear()
    pages.reset()
    receipts.reset()
    const id = '33333333-3333-4333-8333-333333333333'
    groups.set(id, {
      read: {
        group: {
          id,
          kind: 'static',
          assetContext: 'endpoint',
          calculationRevision: 0,
          name: 'Pilot devices',
          description: 'Synthetic pilot group',
          revision: 1,
          memberVersion: 0,
          memberCount: 0,
          ruleVersion: null,
          deleted: false,
        },
        criteria: null,
        memberSet: null,
      },
      members: [],
    })
  }
  reset()
  function start(id: string, task: string, publish: boolean, next?: string[]) {
    const state = groups.get(id)!
    const universe =
      state.read.group.assetContext === 'endpoint'
        ? [...devices().values()]
            .filter((d) => d.summary.inventoryAvailable)
            .map((d) => ({ key: d.summary.id, device: d }))
        : objects()
            .map((o) => ({
              key: objectKey(o.object),
              device: (() => {
                const members = [...new Set(o.members.map((m) => m.device))].flatMap((id) => {
                  const d = devices().get(id)
                  return d ? [d] : []
                })
                const first = members[0]
                if (!first) return undefined
                const fields = Object.fromEntries(
                  [...new Set(members.flatMap((d) => Object.keys(d.inventory.fields)))].map(
                    (key) => {
                      const entries = members.flatMap((d) =>
                          d.inventory.fields[key] ? [d.inventory.fields[key]!] : [],
                        ),
                        sources = entries.flatMap((f) => f.sources)
                      return [key, { ...entries[0]!, state: mergedFieldState(sources), sources }]
                    },
                  ),
                )
                return { ...first, inventory: { ...first.inventory, fields } }
              })(),
            }))
            .filter((o): o is { key: string; device: DemoDevice } => !!o.device)
    const decisions: Decision[] = universe.map(({ key, device: d }) => {
      const evaluation =
        state.read.group.kind === 'dynamic'
          ? evaluate(state.read.criteria, d.inventory)
          : {
              decision: (next ?? state.members).includes(key)
                ? ('match' as const)
                : ('no_match' as const),
              explanations: [],
            }
      return {
        device: key,
        origin: state.read.group.kind === 'dynamic' ? 'rule' : 'manual',
        ...evaluation,
        provenance: Object.values(d.inventory.fields).flatMap((f) =>
          f.sources.map((s) => ({
            field: f.field,
            source: s.evidence.source,
            snapshot_id: s.evidence.snapshotId,
            observed_at: s.evidence.observedAt,
          })),
        ),
      }
    })
    const members = decisions.filter((d) => d.decision === 'match').map((d) => d.device)
    jobs.set(task, {
      group: id,
      revision: state.read.group.revision,
      publish,
      reads: 0,
      status: 'running',
      members,
      added: members.filter((d) => !state.members.includes(d)),
      removed: state.members.filter((d) => !members.includes(d)),
      decisions,
      ruleVersion: state.read.group.ruleVersion,
      inputs: inputs(state.read),
    })
    return ok(
      { task, kind: 'group', target: id, statusUrl: `/api/v1/groups/${id}/tasks/${task}` },
      202,
    )
  }
  const handle: DomainHandler = (request, scenario) => {
    const { path, method, query } = request
    if (path === '/api/v1/groups' && method === 'GET') {
      const items = (
          scenario === 'empty'
            ? []
            : [...groups.values()].filter((g) => !g.read.group.deleted).map((g) => g.read.group)
        )
          .filter((g) => g.id > (query.get('after') ?? ''))
          .sort((a, b) => a.id.localeCompare(b.id)),
        limit = Number(query.get('limit') ?? 20)
      return ok({
        items: items.slice(0, limit),
        nextCursor: items.length > limit ? items[limit - 1]!.id : null,
      })
    }
    const match =
      /^\/api\/v1\/groups\/([^/]+)(?:\/(previews|tasks|results)(?:\/([^/]+))?(?:\/(members|changes|decisions))?)?$/.exec(
        path,
      )
    if (!match) return
    const id = uuid(match[1]),
      state = groups.get(id)
    if (match[2] === 'tasks' && method === 'GET') {
      const task = uuid(match[3]),
        job = jobs.get(task)
      if (!job || job.group !== id || !state) return error('group_not_found', 404)
      if (job.status === 'running' && job.reads++ > 0) {
        job.status =
          scenario === 'partial'
            ? 'failed'
            : state.read.group.revision === job.revision
              ? 'completed'
              : 'superseded'
        if (job.status === 'completed' && job.publish) {
          state.read.group.calculationRevision++
          if (job.added.length || job.removed.length) state.read.group.memberVersion++
          state.read.group.memberCount = job.members.length
          state.read.memberSet = task
          state.members = job.members
        }
      }
      return ok({
        task,
        kind: 'group',
        target: id,
        status: job.status,
        processed: job.status === 'running' ? 0 : job.decisions.length,
        members: job.members.length,
        failure:
          job.status === 'failed'
            ? 'stale_plan'
            : job.status === 'superseded'
              ? 'superseded'
              : null,
        failureDetail:
          job.status === 'failed' ? { reason: 'stale_plan', device: null, stage: 'execute' } : null,
        replacementTask: null,
      })
    }
    if (match[2] === 'results' && method === 'GET') {
      const result = uuid(match[3]),
        job = jobs.get(result),
        kind = match[4]
      if (!job || job.group !== id) return error('group_not_found', 404)
      if (job.status !== 'completed') return error('operation_conflict')
      const toObject = (key: string) =>
        state!.read.group.assetContext === 'endpoint'
          ? { kind: 'endpoint' as const, id: key }
          : objectRef({ kind: key.slice(0, key.indexOf(':')), id: key.slice(key.indexOf(':') + 1) })
      const items =
        kind === 'decisions'
          ? job.decisions.map(({ device, ...d }) => ({
              ...d,
              object: toObject(device),
              sourceObjects: objects().filter(
                (o) => objectKey(o.object) === objectKey(toObject(device)),
              ),
            }))
          : kind === 'members'
            ? job.members.map(toObject)
            : [
                ...job.added.map((device) => ({ device, added: true })),
                ...job.removed.map((device) => ({ device, added: false })),
              ]
      const page = pages.page<unknown>(path, items, query, result)
      let projection: object = { kind, items: page.items }
      if (kind === 'changes') {
        const changes = page.items as { device: string; added: boolean }[]
        projection = {
          kind,
          added: changes.filter((v) => v.added).map((v) => toObject(v.device)),
          removed: changes.filter((v) => !v.added).map((v) => toObject(v.device)),
        }
      }
      return ok({
        result,
        group: id,
        current: state?.read.memberSet === result,
        totalObjects: job.decisions.length,
        totalMembers: job.members.length,
        page: projection,
        nextCursor: page.nextCursor,
      })
    }
    if (method === 'GET')
      return state && !state.read.group.deleted ? ok(state.read) : error('group_not_found', 404)
    if (method !== 'POST') return
    const op = operation(request.body)
    return receipts.write(request, op.operationId, () => {
      if (match[2] === 'previews')
        return state &&
          state.read.group.revision === op.expectedRevision &&
          !state.read.group.deleted
          ? start(id, op.operationId, false)
          : error('operation_conflict')
      const input = record(op.input),
        action = enumeration(input['action'], [
          'create',
          'edit',
          'rule',
          'members',
          'delete',
          'recompute',
        ] as const)
      if (action === 'create') {
        if (state || op.expectedRevision !== 0) return error('operation_conflict')
        closed(input, ['action', 'name', 'description', 'assetContext', 'criteria'])
        const rule = input['criteria'] === null ? null : criteria(input['criteria'])
        const assetContext = enumeration(input['assetContext'], [
          'endpoint',
          'associated_device',
        ] as const)
        if (!rule && assetContext !== 'endpoint') return error('malformed_request', 400)
        const read: GroupRead = {
          group: {
            id,
            kind: rule ? 'dynamic' : 'static',
            assetContext,
            calculationRevision: 0,
            name: identifier(input['name']),
            description: string(input['description']),
            revision: 1,
            memberVersion: 0,
            memberCount: 0,
            ruleVersion: rule ? randomUUID() : null,
            deleted: false,
          },
          criteria: rule,
          memberSet: null,
        }
        groups.set(id, { read, members: [] })
        if (rule) start(id, op.operationId, true)
        return ok({
          operation: op.operationId,
          group: read.group,
          added: 0,
          removed: 0,
          task: rule ? op.operationId : null,
        })
      }
      if (!state || state.read.group.deleted) return error('group_not_found', 404)
      if (state.read.group.revision !== op.expectedRevision) return error('operation_conflict')
      if (action === 'members') {
        if (state.read.group.kind !== 'static') return error('operation_conflict')
        const add = array(input['add'], objectRef).map((o) => {
            if (o.kind !== 'endpoint') throw new Error('Invalid static member')
            return o.id
          }),
          remove = array(input['remove'], objectRef).map((o) => {
            if (o.kind !== 'endpoint') throw new Error('Invalid static member')
            return o.id
          })
        if (add.some((id) => !devices().get(id)?.summary.inventoryAvailable))
          return error('inventory_not_found', 404)
        return start(id, op.operationId, true, [
          ...new Set([...state.members.filter((id) => !remove.includes(id)), ...add]),
        ])
      }
      if (action === 'recompute') return start(id, op.operationId, true)
      if (action === 'rule') {
        if (state.read.group.kind !== 'dynamic') return error('operation_conflict')
        state.read.criteria = criteria(input['criteria'])
        state.read.group.ruleVersion = randomUUID()
      } else if (action === 'edit') {
        state.read.group.name = identifier(input['name'])
        state.read.group.description = string(input['description'])
      } else state.read.group.deleted = true
      state.read.group.revision++
      if (action === 'rule') start(id, op.operationId, true)
      return ok({
        operation: op.operationId,
        group: state.read.group,
        added: 0,
        removed: 0,
        task: action === 'rule' ? op.operationId : null,
      })
    })
  }
  return {
    handle,
    reset,
    published(id: string) {
      const state = groups.get(id)
      if (!state || state.read.group.deleted) return null
      const job = state.read.memberSet ? jobs.get(state.read.memberSet) : undefined
      return structuredClone({
        members:
          state.read.group.assetContext === 'endpoint'
            ? state.members
            : [
                ...new Set(
                  objects()
                    .filter((o) => state.members.includes(objectKey(o.object)))
                    .flatMap((o) => o.members.map((m) => m.device)),
                ),
              ],
        objects: objects().filter((o) =>
          state.read.group.assetContext === 'endpoint'
            ? o.object.kind === 'endpoint' && state.members.includes(o.object.id)
            : state.members.includes(objectKey(o.object)),
        ),
        memberSet: state.read.memberSet,
        memberVersion: state.read.group.memberVersion,
        definitionVersion: state.read.group.revision,
        authorityVersion: 1,
        ready:
          state.read.group.kind === 'static' ||
          (!!job &&
            job.ruleVersion === state.read.group.ruleVersion &&
            job.inputs === inputs(state.read)),
      })
    },
  }
}
