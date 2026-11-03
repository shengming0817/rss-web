import { expect, it, vi } from 'vitest'
import { createGroups, validateRule, type Group, type GroupsPort, type GroupResult } from './index'

const id = '11111111-1111-4111-8111-111111111111',
  operation = '22222222-2222-4222-8222-222222222222',
  nested = '33333333-3333-4333-8333-333333333333'
const group = (): Group => ({
  id,
  kind: 'static',
  systemSelector: null,
  assetContext: 'endpoint',
  presentation: { name: 'Empty static', description: '', extension: { enabled: false, zero: 0 } },
  revision: 7,
  calculationRevision: 9,
  memberVersion: 3,
  memberCount: 0,
  ruleVersion: null,
  deleted: false,
})
function port(methods: Partial<GroupsPort>): GroupsPort {
  return new Proxy(methods as GroupsPort, {
    get(target, key) {
      if (!(key in target)) throw new Error(`Unexpected port call: ${String(key)}`)
      return Reflect.get(target, key)
    },
  })
}
it('preserves an empty initial static source and does not invent a member set or revision', async () => {
  const value = { group: group(), criteria: null, memberSet: null, freshness: 'current' as const },
    groups = createGroups(port({ read: async () => value }))
  expect(await groups.read(id)).toBe(value)
  expect(value.group.revision).not.toBe(value.group.calculationRevision)
})
it('preserves nested criteria and unknown metadata in an immutable definition command', async () => {
  const presentation = { name: 'Nested', extra: { off: false, count: 0 } },
    criteria = {
      selector: { kind: 'all_authorized' as const },
      quantifier: 'any' as const,
      criteria: {
        kind: 'or' as const,
        children: [
          { kind: 'group' as const, groupId: nested, op: 'member_of' as const },
          {
            kind: 'and' as const,
            children: [
              {
                kind: 'predicate' as const,
                field: 'custom.count',
                op: 'eq' as const,
                value: { kind: 'integer' as const, value: 0 },
              },
            ],
          },
        ],
      },
    },
    change = vi.fn(async (_id: string, input: Parameters<GroupsPort['change']>[1]) => {
      expect(Object.isFrozen(input.input)).toBe(true)
      return {
        task: operation,
        kind: 'group_definition' as const,
        target: id,
        statusUrl: `/api/v1/groups/${id}/tasks/${operation}`,
      }
    }),
    groups = createGroups(port({ change }))
  await groups.change(id, {
    operationId: operation,
    expectedRevision: 0,
    input: { action: 'create', presentation, criteria, assetContext: 'associated_device' },
  })
  expect(change).toHaveBeenCalledWith(id, {
    operationId: operation,
    expectedRevision: 0,
    input: { action: 'create', presentation, criteria, assetContext: 'associated_device' },
  })
  validateRule(criteria)
})
it('previews unsaved conditions without publishing or creating a task', async () => {
  const result = {
    items: [],
    scanComplete: false,
    inputFingerprint: 'fixed',
    assetCut: { tenant: id, epoch: nested, snapshot: '1:2:' },
    objectSnapshot: null,
    sources: [],
    asOf: 0,
  }
  const preview = vi.fn(async () => result),
    groups = createGroups(port({ preview }))
  const request = {
    criteria: {
      selector: { kind: 'device' as const },
      quantifier: 'one' as const,
      criteria: { kind: 'and' as const, children: [] },
    },
    assetContext: 'endpoint' as const,
    editing: { groupId: id, expectedRevision: 7 },
  }
  expect(await groups.preview(request)).toEqual(result)
  expect(preview).toHaveBeenCalledWith(request)
  await expect(
    groups.preview({ ...request, editing: { groupId: id, expectedRevision: 0 } }),
  ).rejects.toThrow('revision')
  expect(preview).toHaveBeenCalledTimes(1)
})
it('does not automatically replay an unknown membership patch or accept association members', async () => {
  const change = vi.fn(async () => {
      throw { status: 503, code: 'outcome_unknown' }
    }),
    groups = createGroups(port({ change }))
  await expect(
    groups.change(id, {
      operationId: operation,
      expectedRevision: 7,
      input: { action: 'members', add: [{ kind: 'endpoint', id: 'endpoint' }], remove: [] },
    }),
  ).rejects.toMatchObject({ code: 'outcome_unknown' })
  await expect(
    groups.change(id, {
      operationId: operation,
      expectedRevision: 7,
      input: { action: 'members', add: [{ kind: 'association', id: nested }], remove: [] },
    }),
  ).rejects.toThrow('endpoints')
  await expect(
    groups.change(id, {
      operationId: operation,
      expectedRevision: 7,
      input: {
        action: 'members',
        add: [{ kind: 'endpoint', id: 'endpoint' }],
        remove: [{ kind: 'endpoint', id: 'endpoint' }],
      },
    }),
  ).rejects.toThrow('Conflicting member edit')
  expect(change).toHaveBeenCalledTimes(1)
})
it('keeps historical source coordinates and empty continuable result pages', async () => {
  const value: GroupResult = {
      result: operation,
      group: id,
      current: false,
      sources: [
        {
          group: nested,
          coordinates: {
            definitionVersion: 3,
            memberVersion: 2,
            authorityVersion: 5,
            memberSet: null,
            assetContext: 'associated_device',
          },
        },
      ],
      totalObjects: 37,
      totalMembers: 4,
      page: { kind: 'members', items: [] },
      nextCursor: 'opaque/next',
    },
    result = vi.fn(async () => value),
    groups = createGroups(port({ result }))
  expect(
    await groups.result(id, operation, 'members', { cursor: 'opaque/current', limit: 2 }),
  ).toBe(value)
  expect(result).toHaveBeenCalledWith(id, operation, 'members', {
    cursor: 'opaque/current',
    limit: 2,
  })
  await expect(groups.result(nested, operation, 'members')).rejects.toThrow('Wrong group result')
})
it('retains deletion blocking even when the authorized reference list is empty', async () => {
  const references = vi.fn(async () => ({
      items: [],
      deletionBlocked: true,
      nextCursor: 'opaque',
    })),
    groups = createGroups(port({ references }))
  expect(
    await groups.references(id, { kind: 'compliance_rule', relation: 'indirect', limit: 1 }),
  ).toEqual({ items: [], deletionBlocked: true, nextCursor: 'opaque' })
  expect(references).toHaveBeenCalledWith(id, {
    kind: 'compliance_rule',
    relation: 'indirect',
    limit: 1,
  })
})
it('rejects tasks from another group while keeping computation counters independent of edit CAS', async () => {
  const groups = createGroups(
    port({
      task: async () => ({
        task: operation,
        kind: 'group',
        target: nested,
        status: 'running',
        processed: 4,
        members: 2,
        failure: null,
        failureDetail: null,
        replacementTask: null,
      }),
    }),
  )
  await expect(groups.task(id, operation)).rejects.toThrow('Wrong group task')
})

it('accepts a reused server task without treating the mutation operation ID as the task identity', async () => {
  const receipt = {
      task: nested,
      target: id,
      kind: 'group' as const,
      statusUrl: `/api/v1/groups/${id}/tasks/${nested}`,
    },
    groups = createGroups(
      port({
        change: async () => receipt,
      }),
    )
  expect(
    await groups.change(id, {
      operationId: operation,
      expectedRevision: 7,
      input: { action: 'recompute' },
    }),
  ).toEqual(receipt)
})
