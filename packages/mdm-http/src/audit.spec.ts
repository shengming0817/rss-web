import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createAudit, createAuditPolicyLookup } from '@rss/mdm-audit'
import { createAuditAdapter, createAuditPolicyLookupAdapter } from './audit'
const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222'
const fact = {
  source: 'request',
  eventId: 'safe-event',
  position: 2,
  recordedAt: 20,
  observedAt: -1,
  actorKind: 'human',
  actor: 'principal',
  action: 'management_read',
  target: { type: 'policy', id },
  deviceId: 'device',
  operationId: id,
  relatedOperationIds: [other],
  requestId: other,
  registrationId: null,
  registrationRequestId: null,
  instanceId: id,
  auditOutcome: 'succeeded',
  phase: 'recorded',
  executionState: null,
  effect: 'unknown',
  requestWriteOutcome: null,
  supported: true,
}
const activity = {
  id: 'native:received',
  source: 'native',
  kind: 'execution',
  phase: 'received',
  recordedAt: 20,
  observedAt: -1,
  origin: 'human',
  target: { device: 'paired-device', registration: id, generation: 1 },
  links: {
    policy: null,
    version: null,
    batch: null,
    member: null,
    request: id,
    operation: other,
    retirement: null,
    task: null,
    attempt: null,
    steps: [],
    operations: [{ kind: 'native', id: other }],
  },
  delivery: 'received',
  execution: 'received',
  effect: 'unverifiable',
  reporting: null,
  decision: null,
  auditOutcome: 'succeeded',
}
function fixture(reply: unknown) {
  const request = vi.fn(async (options: RequestOptions<unknown>) => options.decode(reply)),
    transport = { request } as unknown as HttpTransport
  return {
    request,
    audit: createAudit(createAuditAdapter(transport)),
    lookup: createAuditPolicyLookup(createAuditPolicyLookupAdapter(transport, id, id)),
  }
}
it('uses distinct audit and path-bound timeline window operations with safe facts and signed observations', async () => {
  const f = fixture({ items: [fact], nextCursor: null, coverage: { complete: false } })
  const query = { operationId: id, actor: 'principal', from: 1, until: 30, limit: 1 }
  expect((await f.audit.search(query)).items[0]!.observedAt).toBe(-1)
  expect(f.request.mock.lastCall![0]).toMatchObject({
    method: 'GET',
    path: '/api/v1/audit-events',
    query,
  })
  await f.audit.timeline('device', query)
  expect(f.request.mock.lastCall![0]).toMatchObject({
    path: '/api/v1/devices/{device}/timeline',
    pathParams: { device: 'device' },
  })
  await expect(
    fixture({
      items: [{ ...fact, payload: 'private' }],
      nextCursor: null,
      coverage: { complete: true },
    }).audit.search(),
  ).rejects.toBeDefined()
})
it('admits paired activity facts and preserves snapshot coverage without inventing live incremental reads', async () => {
  const f = fixture({
    items: [activity],
    nextCursor: null,
    syncCursor: 'YWJj',
    asOf: 30,
    retainedFrom: null,
    coverage: [{ source: 'native', complete: false, reasons: ['not_retained'] }],
  })
  const result = await f.audit.activities('device', { operation: other, related: 'batch:fact' })
  expect(result.items[0]!.target?.device).toBe('paired-device')
  expect(result.coverage[0]!.reasons).toEqual(['not_retained'])
  expect(f.request.mock.lastCall![0].query).toMatchObject({
    operation: other,
    related: 'batch:fact',
  })
  const detail = fixture({
    activity,
    personal: false,
    related: [],
    relatedCursor: null,
    missing: ['not_retained'],
    asOf: 30,
  })
  expect((await detail.audit.activity('device', activity.id)).activity.execution).toBe('received')
  expect(detail.request.mock.lastCall![0].pathParams).toEqual({ device: 'device', id: activity.id })
  await expect(detail.audit.activity('device', 'other:fact')).rejects.toBeDefined()
  await expect(
    fixture({
      activity: { ...activity, output: 'private' },
      personal: false,
      related: [],
      relatedCursor: null,
      missing: [],
      asOf: 30,
    }).audit.activity('device', activity.id),
  ).rejects.toBeDefined()
})
it('projects exact current capability identity without leaking definitions or treating a shared event as an alias', async () => {
  const policy = {
      id,
      revision: 1,
      version: 1,
      versionId: other,
      state: 'enabled',
      definition: {
        alias: 'support',
        customEvent: 'support.event',
        scope: id,
        action: {
          kind: 'device_access',
          mac: null,
          windows: { kind: 'disabled' },
          role: null,
          selfEnrollment: false,
        },
      },
    },
    capability = {
      id,
      objectType: 'policy',
      toolName: 'policy_' + id.replaceAll('-', ''),
      alias: 'support',
      scope: id,
      instance: id,
      tenant: id,
      revision: 1,
      version: other,
      operations: ['read'],
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
    },
    f = fixture({ policy, capability }),
    resolved = await f.lookup.resolve({ kind: 'alias', alias: 'support' })
  expect(resolved).toEqual({
    id,
    revision: 1,
    versionId: other,
    state: 'enabled',
    toolName: capability.toolName,
    alias: 'support',
    customEvent: 'support.event',
  })
  expect(f.request.mock.lastCall![0]).toMatchObject({
    method: 'POST',
    path: '/api/v1/policies/resolve',
    body: { kind: 'alias', alias: 'support' },
  })
  await expect(
    fixture({ policy, capability: { ...capability, tenant: other } }).lookup.resolve({
      kind: 'id',
      id,
    }),
  ).rejects.toBeDefined()
  const rows = fixture({ items: [resolved, { ...resolved, id: other }], nextCursor: null })
  expect((await rows.lookup.byEvent('support.event')).items).toHaveLength(2)
  expect(rows.request.mock.lastCall![0].query).toMatchObject({
    filter: "customEvent=='support.event'",
    fields: 'id,toolName,alias,customEvent,state,revision,versionId',
  })
  expect(rows.request.mock.lastCall![0].query).not.toHaveProperty('alias')
})
