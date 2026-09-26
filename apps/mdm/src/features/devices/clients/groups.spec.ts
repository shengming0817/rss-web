import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createGroupsClient, decodeGroup, decodeGroupPage } from './groups'
const id = '11111111-1111-4111-8111-111111111111'
const task = '22222222-2222-4222-8222-222222222222'
const group = {
  id,
  kind: 'dynamic',
  name: 'Managed',
  description: '',
  revision: 2,
  memberVersion: 1,
  memberCount: 0,
  ruleVersion: 'v1',
  deleted: false,
}
it('preserves an empty published member set separately from the definition revision', () => {
  expect(
    decodeGroup({ group, criteria: { kind: 'and', children: [] }, memberSet: task }, id).group
      .memberCount,
  ).toBe(0)
  expect(() =>
    decodeGroup({ group: { ...group, id: task }, criteria: null, memberSet: null }, id),
  ).toThrow()
})
it('decodes unknown explanations and snake-case provenance without claiming membership', () => {
  const decision = {
    device: 'd1',
    origin: 'rule',
    decision: 'unknown',
    explanations: [{ path: [0], outcome: 'deleted' }],
    provenance: [
      { field: 'custom.is_loaner', source: 'manual', snapshot_id: task, observed_at: 0 },
    ],
  }
  const response = {
    group: id,
    result: task,
    current: false,
    totalObjects: 1,
    totalMembers: 0,
    page: { kind: 'decisions', items: [decision] },
    nextCursor: 'opaque',
  }
  expect(decodeGroupPage(response, id, task, 'decisions').page).toEqual(response.page)
  expect(() => decodeGroupPage(response, id, task, 'members')).toThrow()
  expect(() => decodeGroupPage({ ...response, result: id }, id, task, 'decisions')).toThrow()
})
it('uses 200 for definition changes and 202 for recompute and preview, preserving CAS', async () => {
  const request = vi.fn(async (o: RequestOptions<unknown>) =>
    o.decode(
      o.successStatus === 202
        ? { task, kind: 'group', target: id, statusUrl: `/api/v2/groups/${id}/tasks/${task}` }
        : { operation: task, group, added: 0, removed: 0, task: null },
    ),
  )
  const client = createGroupsClient({ request } as unknown as HttpTransport)
  await client.change(id, {
    operationId: task,
    expectedRevision: 2,
    input: { action: 'edit', name: 'Managed', description: '' },
  })
  await client.change(id, {
    operationId: task,
    expectedRevision: 2,
    input: { action: 'recompute' },
  })
  await client.preview(id, { operationId: task, expectedRevision: 2, input: {} })
  expect(request.mock.calls.map(([o]) => o.successStatus)).toEqual([200, 202, 202])
  expect(request.mock.calls[2]?.[0]).toMatchObject({
    path: '/api/v2/groups/{id}/previews',
    body: { expectedRevision: 2, input: {} },
  })
})

it('accepts safe failed-task details and rejects unknown diagnostic fields', async () => {
  let detail: unknown = { reason: 'stale_plan', device: 'device-01', stage: 'execute' }
  const client = createGroupsClient({
    request: async (o: RequestOptions<unknown>) =>
      o.decode({
        task,
        kind: 'group',
        target: id,
        status: 'failed',
        processed: 0,
        members: 0,
        plan: null,
        failure: 'stale_plan',
        failureDetail: detail,
        execution: null,
        policyRevision: null,
      }),
  } as unknown as HttpTransport)
  expect((await client.status(id, task)).failureDetail).toEqual(detail)
  detail = { reason: 'database_secret', device: null, stage: 'execute' }
  await expect(client.status(id, task)).rejects.toThrow()
})
