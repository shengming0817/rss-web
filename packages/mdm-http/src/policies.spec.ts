import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createPoliciesAdapter } from './policies'
import { createPolicyEventsAdapter } from './policy-events'

const id = '11111111-1111-4111-8111-111111111111',
  operationId = '22222222-2222-4222-8222-222222222222',
  versionId = '33333333-3333-4333-8333-333333333333'
function fixture(value: unknown) {
  const request = vi.fn(async (options: RequestOptions<unknown>) => options.decode(value))
  return { transport: { request } as unknown as HttpTransport, request }
}
const definition = {
  scope: id,
  alias: 'shared.policy',
  customEvent: 'shared.event',
  action: {
    kind: 'unmanage_device' as const,
    schedule: {
      trigger: { kind: 'manual' as const },
      misfire: { kind: 'coalesce_one' as const },
      notBefore: 0,
      until: null,
      jitterSeconds: 0,
      window: null,
    },
    runLifetimeSeconds: 3600,
  },
}
it('reads exact policy identity and keeps configuration and immutable execution versions distinct', async () => {
  const value = { id, revision: 8, version: 2, versionId, state: 'disabled', definition },
    client = createPoliciesAdapter(fixture(value).transport)
  expect(await client.read(id)).toEqual(value)
  await expect(client.read(operationId)).rejects.toThrow('detail')
})
it('binds preview paging to the original scope result and action without accepting another basis', async () => {
  const f = fixture({
      action: definition.action,
      scopeResult: versionId,
      items: [],
      nextCursor: 'next',
    }),
    client = createPoliciesAdapter(f.transport)
  expect(
    (await client.preview(definition, versionId, { cursor: 'previous', limit: 1 })).nextCursor,
  ).toBe('next')
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      body: { definition, scopeResult: versionId },
      query: { cursor: 'previous', limit: 1 },
    }),
  )
  await expect(client.preview(definition, operationId, {})).rejects.toThrow('result')
  await expect(
    client.preview(
      { ...definition, action: { ...definition.action, runLifetimeSeconds: 7200 } },
      versionId,
      {},
    ),
  ).rejects.toThrow('action')
})
it('rejects a batch whose returned request belongs to another event identity', async () => {
  const value = {
    id,
    operationId,
    event: 'shared.event',
    createdAt: 100,
    deadline: 200,
    members: 1,
    admission: { pending: 1 },
    processingFailure: null,
    request: {
      operationId,
      event: 'shared.event',
      source: { kind: 'human' },
      executionContext: null,
    },
  }
  expect(await createPolicyEventsAdapter(fixture(value).transport).batch('endpoint-1', id)).toEqual(
    { ...value, request: { operationId, event: 'shared.event', source: { kind: 'human' } } },
  )
  await expect(
    createPolicyEventsAdapter(
      fixture({ ...value, request: { ...value.request, operationId: versionId } }).transport,
    ).batch('endpoint-1', id),
  ).rejects.toThrow('binding')
})
it('keeps member acceptance separate from native effect and rejects mismatched owner references', async () => {
  const member = {
      id,
      policyId: operationId,
      versionId,
      revision: 2,
      state: 'accepted',
      decision: { state: 'accepted', operations: [{ kind: 'native', id: versionId }] },
      operations: [
        {
          reference: { kind: 'native', id: versionId },
          state: 'queued',
          agentInstallation: null,
          allowedActions: [],
        },
      ],
    },
    client = createPolicyEventsAdapter(fixture({ items: [member], nextCursor: null }).transport)
  const result = await client.members('endpoint-1', id, {})
  expect(result.items[0]?.state).toBe('accepted')
  expect(result.items[0]?.operations[0]?.state).toBe('queued')
  const wrong = {
    ...member,
    operations: [{ ...member.operations[0], reference: { kind: 'native', id: operationId } }],
  }
  await expect(
    createPolicyEventsAdapter(fixture({ items: [wrong], nextCursor: null }).transport).members(
      'endpoint-1',
      id,
      {},
    ),
  ).rejects.toThrow('references')
})
it('preserves native collection delivery and intake without fabricating agent execution or effect', async () => {
  const report = {
      id: operationId,
      result: 'complete',
      reason: null,
      sealedAt: 100,
      projectionPending: true,
    },
    run = {
      kind: 'collection',
      channel: 'mdm',
      taskId: operationId,
      policyId: id,
      versionId,
      device: 'endpoint-1',
      registrationId: id,
      generation: 1,
      occurrence: 'collection:1',
      availableAt: 0,
      deadline: 200,
      delivery: 'sent',
      report,
    },
    result = await createPoliciesAdapter(
      fixture({ items: [run], nextCursor: null }).transport,
    ).runs(id, {})
  expect(result.items[0]).toMatchObject({
    kind: 'collection',
    nativeDelivery: 'sent',
    state: null,
    effect: null,
    report,
  })
})
it('consumes access run state without inventing a software effect', async () => {
  const state = {
      delivery: { kind: 'queued' },
      execution: 'not_started',
      cancellation: 'none',
      deadline: 200,
      startedAt: null,
    },
    run = {
      kind: 'access',
      taskId: operationId,
      policyId: id,
      versionId,
      device: 'endpoint-1',
      registrationId: id,
      generation: 1,
      occurrence: 'access:1',
      availableAt: 0,
      deadline: 200,
      state,
      authorization: null,
      attemptId: null,
      result: null,
    },
    result = await createPoliciesAdapter(
      fixture({ items: [run], nextCursor: null }).transport,
    ).runs(id, {})
  expect(result.items[0]).toMatchObject({
    kind: 'access',
    state,
    effect: null,
    nativeDelivery: null,
  })
})

it('keeps recurring eligibility, current trigger knowledge and restricted execution facts separate', async () => {
  const base = {
    object: { kind: 'endpoint', id: 'endpoint-1' },
    channel: 'agent',
    availability: 'ready',
    reason: null,
    target: { device: 'endpoint-1', channel: 'agent', registrationId: id, generation: 1 },
    qualification: { state: 'eligible', entry: 1 },
    sources: [],
    scopeResult: versionId,
    taskAdmission: { state: 'waiting_trigger', nextAllowedStartAt: 1700000000 },
  }
  const recurring = {
    ...base,
    execution: { kind: 'recurring', latestRun: null, currentRecord: { state: 'unknown' } },
  }
  const page = await createPoliciesAdapter(
    fixture({
      items: [recurring, { ...base, execution: { kind: 'restricted' } }],
      nextCursor: null,
    }).transport,
  ).assignments(id, {})
  expect(page.items[0]?.execution).toEqual(recurring.execution)
  expect(page.items[0]?.taskAdmission?.nextAllowedStartAt).toBe(1700000000)
  expect(page.items[1]?.execution).toEqual({ kind: 'restricted' })
  expect(page.items[1]?.qualification.state).toBe('eligible')
  const absent = await createPoliciesAdapter(
    fixture({
      items: [
        {
          ...base,
          execution: { kind: 'recurring', latestRun: null, currentRecord: { state: 'absent' } },
        },
      ],
      nextCursor: null,
    }).transport,
  ).assignments(id, {})
  expect(absent.items[0]?.execution).toEqual({
    kind: 'recurring',
    latestRun: null,
    currentRecord: { state: 'absent' },
  })
})
