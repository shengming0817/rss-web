/** MOCK_SOURCE: loopback-only synthetic group interaction, never an authorization producer. */
import { randomUUID } from 'node:crypto'
import { TENANT, type DomainHandler } from '../../scenario'
import { createPages, createReceipts, error, ok } from '../../http'
import { directoryPage } from '../../directory'
import { ADMIN } from '../../operations/authorization'
import { closed, count, enumeration, identifier, string, uuid } from '../../../src/services/decode'
import {
  categories,
  defaultRule,
  draft,
  type Draft,
  type Rule,
  type Person,
  type Device,
  type Outcome,
  type ResultRow,
} from './model'
const base = '/api/v1/mdm-candidate/groups'
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
interface Stored {
  id: string
  revision: number
  definition: Draft
  resultId: string | null
  pending: boolean
}
interface Result {
  id: string
  groupId: string
  preview: boolean
  evaluatedAt: number
  rows: ResultRow[]
}
interface Task {
  id: string
  groupId: string
  revision: number
  preview: boolean
  reads: number
  status: 'running' | 'completed' | 'superseded'
  resultId: string | null
}
export function createDemoGroups() {
  const retired = new Set<string>()
  const groups = new Map<string, Stored>(),
    results = new Map<string, Result>(),
    tasks = new Map<string, Task>(),
    receipts = createReceipts(),
    pages = createPages()
  const people: Person[] = [
    {
      id: id(1),
      label: 'Mock User A',
      attributes: { department: 'Engineering', licensed: false, allocation: 0 },
    },
    {
      id: id(2),
      label: 'Mock User B',
      attributes: { department: 'Support', licensed: true, allocation: 50 },
    },
    {
      id: id(3),
      label: 'Mock User C',
      attributes: { department: null, licensed: null, allocation: null },
    },
  ]
  const devices: Device[] = [
    {
      id: id(11),
      label: 'Mock Windows A',
      attributes: { platform: 'windows', managed: true, memory: 16 },
      registrationUser: id(1),
      currentUser: id(2),
      currentKnown: true,
    },
    {
      id: id(12),
      label: 'Mock Mac B',
      attributes: { platform: 'macos', managed: true, memory: 8 },
      registrationUser: id(2),
      currentUser: id(1),
      currentKnown: true,
    },
    {
      id: id(13),
      label: 'Mock Windows C',
      attributes: { platform: 'windows', managed: null, memory: null },
      registrationUser: id(3),
      currentUser: null,
      currentKnown: false,
    },
    {
      id: id(14),
      label: 'Mock Mac D',
      attributes: { platform: 'macos', managed: false, memory: 0 },
      registrationUser: null,
      currentUser: null,
      currentKnown: true,
    },
  ]
  const envelope = (value: object) => ({
    contract: 'groups-interaction-demo',
    source: 'mock',
    tenantId: TENANT,
    ...value,
  })
  function references(rule: Rule | null): string[] {
    return !rule || rule.mode === 'match'
      ? []
      : rule.mode === 'users'
        ? [rule.groupId]
        : rule.rules.flatMap(references)
  }
  function evaluate(rule: Rule, item: Person): { outcome: Outcome; reason: string } {
    if (rule.mode === 'users') {
      const source = groups.get(rule.groupId),
        relation = item as Device
      if (!source || source.pending || !source.resultId)
        return { outcome: 'unknown', reason: 'source_pending' }
      if (!source.definition.enabled) return { outcome: 'no_match', reason: 'source_disabled' }
      if (rule.relation === 'current_user' && !relation.currentKnown)
        return { outcome: 'unknown', reason: 'relation_unknown' }
      const principal =
        rule.relation === 'registration_user' ? relation.registrationUser : relation.currentUser
      if (principal === null) return { outcome: 'no_match', reason: 'no_relation' }
      const member = results.get(source.resultId)?.rows.find((r) => r.id === principal)
      return {
        outcome: member?.outcome ?? 'unknown',
        reason: member?.outcome === 'unknown' ? 'source_unknown' : rule.relation,
      }
    }
    if (rule.mode === 'all' || rule.mode === 'any') {
      const rows = rule.rules.map((r) => evaluate(r, item)),
        decisive = rule.mode === 'all' ? 'no_match' : 'match'
      return (
        rows.find((r) => r.outcome === decisive) ??
        rows.find((r) => r.outcome === 'unknown') ?? {
          outcome: rule.mode === 'all' ? 'match' : 'no_match',
          reason: 'rule',
        }
      )
    }
    const actual = item.attributes[rule.attribute]
    if (actual === null || actual === undefined)
      return { outcome: 'unknown', reason: 'attribute_missing' }
    const values = Array.isArray(rule.operand) ? rule.operand : [rule.operand],
      operand = values[0]!
    const matched = (() => {
      switch (rule.operator) {
        case 'eq':
          return actual === operand
        case 'ne':
          return actual !== operand
        case 'in':
          return values.includes(actual)
        case 'not_in':
          return !values.includes(actual)
        case 'contains':
          return String(actual).includes(String(operand))
        case 'not_contains':
          return !String(actual).includes(String(operand))
        case 'gt':
          return typeof actual === 'number' && typeof operand === 'number' && actual > operand
        case 'ge':
          return typeof actual === 'number' && typeof operand === 'number' && actual >= operand
        case 'lt':
          return typeof actual === 'number' && typeof operand === 'number' && actual < operand
        case 'le':
          return typeof actual === 'number' && typeof operand === 'number' && actual <= operand
      }
    })()
    return { outcome: matched ? 'match' : 'no_match', reason: 'rule' }
  }
  function build(group: Stored, preview: boolean): Result {
    const previous = group.resultId ? results.get(group.resultId) : undefined,
      d = group.definition,
      universe = d.groupType.startsWith('user') ? people : devices
    const rows = universe.map(
      (item): ResultRow => ({
        id: item.id,
        label: item.label,
        ...(d.enabled
          ? d.rule
            ? evaluate(d.rule, item)
            : {
                outcome: d.assignments.includes(item.id)
                  ? ('match' as const)
                  : ('no_match' as const),
                reason: 'assignment',
              }
          : { outcome: 'no_match' as const, reason: 'disabled' }),
        before: previous?.rows.find((r) => r.id === item.id)?.outcome ?? null,
      }),
    )
    const result = {
      id: randomUUID(),
      groupId: group.id,
      preview,
      evaluatedAt: Math.floor(Date.now() / 1000),
      rows,
    }
    results.set(result.id, result)
    if (!preview) {
      group.resultId = result.id
      group.pending = false
    }
    return result
  }
  function wire(group: Stored) {
    const r = group.resultId ? results.get(group.resultId) : undefined
    return {
      id: group.id,
      revision: group.revision,
      definition: group.definition,
      resultId: group.resultId,
      freshness: group.pending ? 'pending' : 'ready',
      memberCount: !group.pending && r ? r.rows.filter((r) => r.outcome === 'match').length : null,
      unknownCount:
        !group.pending && r ? r.rows.filter((r) => r.outcome === 'unknown').length : null,
    }
  }
  function start(group: Stored, preview: boolean, taskId: string = randomUUID()) {
    tasks.set(taskId, {
      id: taskId,
      groupId: group.id,
      revision: group.revision,
      preview,
      reads: 0,
      status: 'running',
      resultId: null,
    })
    if (!preview) {
      group.pending = true
      for (const row of groups.values())
        if (references(row.definition.rule).includes(group.id)) row.pending = true
    }
    return taskId
  }
  function validate(definition: Draft) {
    const universe = definition.groupType.startsWith('user') ? people : devices
    if (definition.assignments.some((v) => !universe.some((item) => item.id === v)))
      throw new Error('Unknown candidate assignment')
    for (const source of references(definition.rule))
      if (!groups.get(source)?.definition.groupType.startsWith('user'))
        throw new Error('Unknown mock user group')
  }
  function reset() {
    retired.clear()
    groups.clear()
    results.clear()
    tasks.clear()
    receipts.reset()
    pages.reset()
    for (const [index, groupType] of categories.entries()) {
      const definition: Draft = {
        name: `Mock ${groupType}`,
        description: 'Synthetic interaction example',
        enabled: true,
        groupType,
        assignments: groupType.endsWith('static')
          ? [groupType.startsWith('user') ? id(1) : id(11)]
          : [],
        rule: groupType.endsWith('dynamic')
          ? defaultRule(groupType.startsWith('user') ? 'user' : 'device')
          : null,
      }
      const group = { id: id(101 + index), revision: 1, definition, resultId: null, pending: false }
      groups.set(group.id, group)
      build(group, false)
    }
  }
  const handle: DomainHandler = (request, scenario) => {
    if (request.path !== base && !request.path.startsWith(base + '/')) return
    if (
      (request.actor.tenantId && request.actor.tenantId !== TENANT) ||
      scenario === 'denied' ||
      scenario === 'forbidden'
    )
      return error('permission_denied', 403)
    if (request.method !== 'GET' && request.actor.principalId !== ADMIN)
      return error('permission_denied', 403)
    try {
      const suffix = request.path.slice(base.length),
        match =
          /^\/([^/]+)(?:\/(preview|recompute|generate-device-group|results)(?:\/([^/]+))?)?$/.exec(
            suffix,
          )
      if (request.method === 'GET' && suffix === '/catalog')
        return ok(
          envelope({
            writable: request.actor.principalId === ADMIN,
            people: people.map(({ id, label }) => ({ id, label })),
            devices: devices.map(({ id, label }) => ({ id, label })),
          }),
        )
      if (request.method === 'GET' && suffix.startsWith('/tasks/')) {
        const job = tasks.get(uuid(suffix.slice(7)))
        if (!job) return error('resource_not_found', 404)
        if (job.status === 'running' && ++job.reads >= 2) {
          const group = groups.get(job.groupId)
          if (!group || group.revision !== job.revision) job.status = 'superseded'
          else {
            const result = build(group, job.preview)
            job.resultId = result.id
            job.status = 'completed'
            if (!job.preview)
              for (const row of groups.values())
                if (references(row.definition.rule).includes(group.id)) build(row, false)
          }
        }
        return ok(
          envelope({
            task: {
              id: job.id,
              groupId: job.groupId,
              status: job.status,
              preview: job.preview,
              resultId: job.resultId,
            },
          }),
        )
      }
      if (request.method === 'GET' && !suffix)
        return ok(
          envelope(
            directoryPage([...groups.values()].map(wire), request, ['id'], {
              binding: JSON.stringify(
                [...groups.values()].map((g) => [g.id, g.revision, g.resultId, g.pending]),
              ),
              lookup: (row, key) =>
                key === 'name' || key === 'groupType' ? row.definition[key] : Reflect.get(row, key),
            }),
          ),
        )
      if (!match) return error('resource_not_found', 404)
      const target = uuid(match[1]),
        action = match[2],
        group = groups.get(target)
      if (request.method === 'GET') {
        if (!group) return error('resource_not_found', 404)
        if (!action) return ok(envelope({ group: wire(group) }))
        if (action === 'results') {
          const result = results.get(uuid(match[3])),
            projection = enumeration(request.query.get('projection'), [
              'members',
              'changes',
              'decisions',
            ] as const)
          if (!result || result.groupId !== target) return error('resource_not_found', 404)
          const rows = result.rows.filter((r) =>
            projection === 'members'
              ? r.outcome === 'match'
              : projection === 'changes'
                ? r.before !== r.outcome
                : true,
          )
          const query = new URLSearchParams(request.query)
          query.delete('projection')
          const page = pages.page(
            `${request.actor.sessionId}:${target}:${result.id}:${projection}`,
            rows,
            query,
            result.id,
          )
          return ok(
            envelope({
              resultId: result.id,
              groupId: target,
              preview: result.preview,
              evaluatedAt: result.evaluatedAt,
              items: page.items,
              nextCursor: page.nextCursor,
            }),
          )
        }
      }
      const body = closed(request.body, ['operationId', 'expectedRevision', 'input']),
        operationId = uuid(body['operationId']),
        expected = count(body['expectedRevision'])
      return receipts.write(request, operationId, () => {
        if (scenario === 'conflict' || retired.has(target) || (group?.revision ?? 0) !== expected)
          return error('operation_conflict')
        let saved = group,
          taskId: string | null = null
        if (request.method === 'PUT' && !action) {
          if (body['input'] === null) {
            if (!group) return error('resource_not_found', 404)
            if ([...groups.values()].some((g) => references(g.definition.rule).includes(target)))
              return error('operation_conflict')
            groups.delete(target)
            retired.add(target)
            return ok(
              envelope({
                receipt: { operationId, groupId: target, revision: expected + 1, taskId: null },
              }),
              202,
            )
          }
          const definition = draft(body['input'])
          validate(definition)
          if (group && group.definition.groupType !== definition.groupType)
            return error('operation_conflict')
          saved = {
            id: target,
            revision: expected + 1,
            definition: structuredClone(definition),
            resultId: group?.resultId ?? null,
            pending: true,
          }
          groups.set(target, saved)
          taskId = start(saved, false, operationId)
        } else if (
          request.method === 'POST' &&
          group &&
          (action === 'preview' || action === 'recompute')
        ) {
          closed(body['input'], [])
          taskId = start(group, action === 'preview', operationId)
        } else if (request.method === 'POST' && group && action === 'generate-device-group') {
          if (!group.definition.groupType.startsWith('user')) return error('malformed_request', 400)
          const input = closed(body['input'], ['id', 'name', 'description', 'relation']),
            generatedId = uuid(input['id'])
          if (groups.has(generatedId)) return error('operation_conflict')
          const definition: Draft = {
            groupType: 'device-dynamic',
            name: identifier(input['name']),
            description: string(input['description']),
            enabled: true,
            assignments: [],
            rule: {
              mode: 'users',
              groupId: target,
              relation: enumeration(input['relation'], [
                'registration_user',
                'current_user',
              ] as const),
            },
          }
          saved = { id: generatedId, revision: 1, definition, resultId: null, pending: true }
          groups.set(generatedId, saved)
          taskId = start(saved, false, operationId)
        } else return error('malformed_request', 400)
        return ok(
          envelope({
            receipt: { operationId, groupId: saved!.id, revision: saved!.revision, taskId },
          }),
          202,
        )
      })
    } catch (e) {
      return error(
        e instanceof Error && e.message === 'Invalidated cursor'
          ? 'operation_conflict'
          : 'malformed_request',
        e instanceof Error && e.message === 'Invalidated cursor' ? 409 : 400,
      )
    }
  }
  reset()
  return { handle, reset }
}
