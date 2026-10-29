import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import {
  createGroupsClient,
  decodeGroup,
  decodeGroupPage,
  groupCondition,
  groupReferences,
} from './groups'
const id = '11111111-1111-4111-8111-111111111111'
const task = '22222222-2222-4222-8222-222222222222'
const group = {
  id,
  kind: 'dynamic',
  systemSelector: null,
  assetContext: 'endpoint',
  calculationRevision: 0,
  presentation: { name: 'Managed', description: '' },
  revision: 2,
  memberVersion: 1,
  memberCount: 0,
  ruleVersion: 'v1',
  deleted: false,
}
it('preserves an empty published member set separately from the definition revision', () => {
  expect(
    decodeGroup(
      {
        group,
        criteria: {
          selector: { kind: 'device' },
          quantifier: 'one',
          criteria: { kind: 'and', children: [] },
        },
        memberSet: task,
        freshness: 'current',
      },
      id,
    ).group.memberCount,
  ).toBe(0)
  expect(
    decodeGroup(
      {
        group: {
          ...group,
          presentation: { ...group.presentation, help: { text: 'operator note' } },
        },
        criteria: null,
        memberSet: null,
        freshness: 'pending',
      },
      id,
    ).group.presentation,
  ).toMatchObject({ help: { text: 'operator note' } })
  expect(() =>
    decodeGroup(
      {
        group: { ...group, name: 'retired' },
        criteria: null,
        memberSet: null,
        freshness: 'pending',
      },
      id,
    ),
  ).toThrow()
  expect(() =>
    decodeGroup(
      { group: { ...group, id: task }, criteria: null, memberSet: null, freshness: 'pending' },
      id,
    ),
  ).toThrow()
})
it('decodes unknown explanations and snake-case provenance without claiming membership', () => {
  const decision = {
    object: { kind: 'endpoint', id: 'd1' },
    sourceObjects: [],
    origin: 'rule',
    decision: 'unknown',
    explanations: [{ context: 'device', path: [0], outcome: 'deleted' }],
    provenance: [
      {
        context: 'device',
        field: 'custom.is_loaner',
        source: 'manual',
        snapshot_id: task,
        observed_at: 0,
      },
    ],
  }
  const response = {
    group: id,
    result: task,
    current: false,
    sources: [],
    totalObjects: 1,
    totalMembers: 0,
    page: { kind: 'decisions', items: [decision] },
    nextCursor: 'opaque',
  }
  expect(decodeGroupPage(response, id, task, 'decisions').page).toEqual(response.page)
  expect(() => decodeGroupPage(response, id, task, 'members')).toThrow()
  expect(() => decodeGroupPage({ ...response, result: id }, id, task, 'decisions')).toThrow()
})
it.each([null, id])(
  'preserves a frozen source member set %s, including the initial empty set',
  (memberSet) => {
    const source = {
      group: '33333333-3333-4333-8333-333333333333',
      coordinates: {
        definitionVersion: 1,
        memberVersion: 0,
        authorityVersion: 1,
        memberSet,
        assetContext: 'endpoint',
      },
    }
    for (const kind of ['members', 'changes', 'decisions'] as const) {
      const page = kind === 'changes' ? { kind, added: [], removed: [] } : { kind, items: [] }
      const result = decodeGroupPage(
        {
          group: id,
          result: task,
          current: true,
          sources: [source],
          totalObjects: 0,
          totalMembers: 0,
          page,
          nextCursor: null,
        },
        id,
        task,
        kind,
      )
      expect(result.sources).toEqual([source])
      expect(() =>
        decodeGroupPage(
          {
            ...result,
            sources: [{ ...source, coordinates: { ...source.coordinates, memberSet: 'invalid' } }],
          },
          id,
          task,
          kind,
        ),
      ).toThrow()
    }
  },
)
it('uses current job kinds for definitions, recompute and preview while keeping metadata synchronous', async () => {
  const request = vi.fn(async (o: RequestOptions<unknown>) =>
    o.decode(
      (o.body as { input?: { action: string } })?.input?.action !== 'edit'
        ? {
            task,
            kind: o.path.endsWith('/previews')
              ? 'group_preview'
              : (o.body as { input?: { action: string } })?.input?.action === 'rule'
                ? 'group_definition'
                : 'group',
            target: id,
            statusUrl: `/api/v1/groups/${id}/tasks/${task}`,
          }
        : { operation: task, group, added: 0, removed: 0, task: null },
    ),
  )
  const client = createGroupsClient({ request } as unknown as HttpTransport)
  await client.change(id, {
    operationId: task,
    expectedRevision: 2,
    input: { action: 'edit', presentation: { name: 'Managed', description: '' } },
  })
  await client.change(id, {
    operationId: task,
    expectedRevision: 2,
    input: { action: 'recompute' },
  })
  await client.preview(id, { operationId: task, expectedRevision: 2, input: {} })
  await client.change(id, {
    operationId: task,
    expectedRevision: 2,
    input: {
      action: 'rule',
      criteria: {
        selector: { kind: 'device' },
        quantifier: 'one',
        criteria: { kind: 'and', children: [] },
      },
    },
  })
  expect(request.mock.calls.map(([o]) => o.successStatus)).toEqual([
    [200, 202],
    [200, 202],
    [200, 202],
    [200, 202],
  ])
  expect(request.mock.calls[2]?.[0]).toMatchObject({
    path: '/api/v1/groups/{id}/previews',
    body: { expectedRevision: 2, input: {} },
  })
})

it('accepts safe failed-task details and rejects unknown diagnostic fields', async () => {
  let detail: unknown = { reason: 'group_input_pending' }
  let replacement: unknown = null
  let extra: Record<string, unknown> = {}
  const client = createGroupsClient({
    request: async (o: RequestOptions<unknown>) =>
      o.decode({
        task,
        kind: 'group',
        target: id,
        status: 'failed',
        processed: 0,
        members: 0,
        failure: 'stale_plan',
        failureDetail: detail,
        replacementTask: replacement,
        ...extra,
      }),
  } as unknown as HttpTransport)
  expect((await client.status(id, task)).failureDetail).toEqual(detail)
  replacement = id
  expect((await client.status(id, task)).replacementTask).toBe(id)
  extra = { plan: null }
  await expect(client.status(id, task)).rejects.toThrow()
  extra = {}
  detail = { reason: 'database_secret', device: null, stage: 'execute' }
  await expect(client.status(id, task)).rejects.toThrow()
})

it('keeps group membership rules separate from asset conditions and preserves hidden deletion blockers', () => {
  const value = {
    selector: { kind: 'device' },
    quantifier: 'one',
    criteria: { kind: 'and', children: [{ kind: 'group', groupId: id, op: 'not_member_of' }] },
  }
  expect(groupCondition(value).criteria).toEqual(value.criteria)
  expect(
    groupReferences({ items: [], nextCursor: null, deletionBlocked: true }).deletionBlocked,
  ).toBe(true)
})
