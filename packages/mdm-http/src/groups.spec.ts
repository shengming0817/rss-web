import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createGroupsAdapter } from './groups'

const id = '11111111-1111-4111-8111-111111111111',
  task = '22222222-2222-4222-8222-222222222222',
  nested = '33333333-3333-4333-8333-333333333333'
function fixture(value: unknown) {
  const request = vi.fn(async (options: RequestOptions<unknown>) => options.decode(value))
  return { transport: { request } as unknown as HttpTransport, request }
}
function group() {
  return {
    id,
    kind: 'static',
    systemSelector: null,
    assetContext: 'endpoint',
    presentation: { name: 'Static', description: '', unknownKey: { enabled: false, number: 0 } },
    revision: 2,
    calculationRevision: 5,
    memberVersion: 3,
    memberCount: 0,
    ruleVersion: null,
    deleted: false,
  }
}
it('keeps projected zero counts and exact referenceable context with server cursor paging', async () => {
  const f = fixture({ items: [{ id, memberCount: 0 }], nextCursor: 'b3BhcXVl' }),
    client = createGroupsAdapter(f.transport)
  expect(
    (
      await client.list({
        fields: ['id', 'memberCount'],
        referenceableFor: nested,
        filter: "assetContext=='endpoint'",
        sort: ['id'],
        cursor: 'cHJldmlvdXM',
        limit: 1,
      })
    ).items,
  ).toEqual([{ id, memberCount: 0 }])
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      query: {
        fields: 'id,memberCount',
        referenceableFor: nested,
        filter: "assetContext=='endpoint'",
        sort: 'id',
        cursor: 'cHJldmlvdXM',
        limit: 1,
      },
    }),
  )
})
it('reads an empty initial static group without manufacturing a result UUID', async () => {
  const value = { group: group(), criteria: null, memberSet: null, freshness: 'current' },
    f = fixture(value)
  expect(await createGroupsAdapter(f.transport).read(id)).toEqual(value)
  await expect(createGroupsAdapter(f.transport).read(nested)).rejects.toThrow()
})
it('distinguishes asynchronous definition acceptance from a completed membership change', async () => {
  const f = fixture({
      task,
      kind: 'group_definition',
      target: id,
      statusUrl: `/api/v1/groups/${id}/tasks/${task}`,
    }),
    client = createGroupsAdapter(f.transport)
  const change = {
    operationId: task,
    expectedRevision: 2,
    input: {
      action: 'rule' as const,
      criteria: {
        selector: { kind: 'device' as const },
        quantifier: 'one' as const,
        criteria: { kind: 'group' as const, groupId: nested, op: 'member_of' as const },
      },
    },
  }
  expect(await client.change(id, change)).toEqual({
    task,
    kind: 'group_definition',
    target: id,
    statusUrl: `/api/v1/groups/${id}/tasks/${task}`,
  })
  expect(f.request).toHaveBeenCalledWith(expect.objectContaining({ body: change }))
  await expect(client.change(nested, change)).rejects.toThrow()
})
it('retains association versions and exact source registration generations in historical decisions', async () => {
  const decision = {
      object: { kind: 'association', id: nested },
      origin: 'rule',
      decision: 'unknown',
      explanations: [{ context: 'device', path: [0], outcome: 'conflict' }],
      provenance: [
        {
          context: 'device',
          field: 'custom.tag',
          source: 'manual',
          snapshot_id: task,
          observed_at: 100,
        },
      ],
      sourceObjects: [
        {
          object: { kind: 'association', id: nested },
          associationVersion: 4,
          verified: false,
          members: [
            { device: 'endpoint-mdm', channel: 'mdm', registrationId: id, generation: 8 },
            { device: 'endpoint-agent', channel: 'agent', registrationId: task, generation: 3 },
          ],
        },
      ],
    },
    value = {
      result: task,
      group: id,
      current: false,
      sources: [
        {
          group: nested,
          coordinates: {
            definitionVersion: 5,
            memberVersion: 6,
            authorityVersion: 7,
            memberSet: null,
            assetContext: 'associated_device',
          },
        },
      ],
      totalObjects: 9,
      totalMembers: 0,
      page: { kind: 'decisions', items: [decision] },
      nextCursor: null,
    },
    f = fixture(value)
  expect(await createGroupsAdapter(f.transport).result(id, task, 'decisions', {})).toEqual(value)
})
it('preserves deletion protection on an empty permission-filtered reference page', async () => {
  const value = { items: [], nextCursor: 'b3BhcXVl', deletionBlocked: true },
    f = fixture(value)
  expect(
    await createGroupsAdapter(f.transport).references(id, {
      relation: 'indirect',
      kind: 'compliance_rule',
      cursor: 'cHJldmlvdXM',
      limit: 1,
    }),
  ).toEqual(value)
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      query: { relation: 'indirect', kind: 'compliance_rule', cursor: 'cHJldmlvdXM', limit: 1 },
    }),
  )
})
it('rejects a task for another group', async () => {
  const wrong = fixture({
    task,
    kind: 'group',
    target: nested,
    status: 'running',
    processed: 0,
    members: 0,
    failure: null,
    failureDetail: null,
    replacementTask: null,
  })
  await expect(createGroupsAdapter(wrong.transport).task(id, task)).rejects.toThrow(
    'Wrong group task',
  )
})

it('binds a reused calculation task to its returned identity and canonical status URL', async () => {
  const receipt = {
      task: nested,
      target: id,
      kind: 'group',
      statusUrl: `/api/v1/groups/${id}/tasks/${nested}`,
    },
    f = fixture(receipt),
    client = createGroupsAdapter(f.transport)
  expect(
    await client.change(id, {
      operationId: task,
      expectedRevision: 2,
      input: { action: 'recompute' },
    }),
  ).toEqual(receipt)
  f.request.mockImplementation(async (options: RequestOptions<unknown>) =>
    options.decode({ ...receipt, statusUrl: `/api/v1/groups/${id}/tasks/${task}` }),
  )
  await expect(
    client.change(id, { operationId: task, expectedRevision: 2, input: { action: 'recompute' } }),
  ).rejects.toThrow('Wrong group task binding')
})
it('previews unsaved criteria with bounded sample facts and no task identity', async () => {
  const input = {
      criteria: {
        selector: { kind: 'device' as const },
        quantifier: 'one' as const,
        criteria: { kind: 'and' as const, children: [] },
      },
      assetContext: 'endpoint' as const,
      editing: { groupId: id, expectedRevision: 2 },
    },
    value = {
      items: [],
      scanComplete: false,
      inputFingerprint: 'input-1',
      assetCut: { tenant: id, epoch: task, snapshot: '1:2:' },
      objectSnapshot: null,
      sources: [],
      asOf: 0,
    },
    f = fixture(value)
  expect(await createGroupsAdapter(f.transport).preview(input)).toEqual(value)
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({ method: 'POST', path: '/api/v1/groups/previews', body: input }),
  )
  await expect(
    createGroupsAdapter(fixture({ ...value, scanComplete: 'false' }).transport).preview(input),
  ).rejects.toThrow()
})
