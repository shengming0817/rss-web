import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createPoliciesClient } from './policies'
import { decodeCapability, decodeSelector } from './addressing'
import { createEventsClient, eventDecision } from './events'
import { createActivitiesClient, managementActivity } from '../../operations/clients/activities'
import { deepLink, parseDeepLink, type DeepLink } from '../../../services/deep-link'
import { defaultSchedule } from './model'
const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222'
const policy = {
  id,
  revision: 1,
  version: 1,
  versionId: id,
  state: 'enabled',
  definition: {
    alias: 'support',
    customEvent: 'support.event',
    scope: id,
    action: {
      kind: 'execution',
      resource: {
        id: 'script',
        version: '1',
        variant: 'default',
        platform: 'windows',
        architecture: 'x86_64',
      },
      parameters: {},
      schedule: defaultSchedule(),
      frequency: 'every_trigger',
      runLifetimeSeconds: 3600,
    },
  },
}
const capability = {
  id,
  objectType: 'policy',
  toolName: `policy_${id.replaceAll('-', '')}`,
  alias: 'support',
  scope: id,
  instance: id,
  tenant: id,
  revision: 1,
  version: id,
  operations: ['read'],
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
}
const batch = {
  id,
  operationId: id,
  event: 'support.event',
  createdAt: 1,
  deadline: 3600,
  members: 1,
  admission: { accepted: 1 },
  request: {
    operationId: id,
    event: 'support.event',
    source: { kind: 'human' },
    executionContext: null,
  },
  processingFailure: null,
}
const reference = { kind: 'run', id }
const member = {
  id,
  policyId: id,
  versionId: id,
  revision: 1,
  state: 'accepted',
  decision: { state: 'accepted', operations: [reference] },
  operations: [
    {
      reference,
      state: {
        delivery: { kind: 'queued' },
        execution: 'not_started',
        cancellation: 'none',
        deadline: 100,
        startedAt: null,
      },
      allowedActions: [],
    },
  ],
}
const links = {
  policy: id,
  version: id,
  batch: id,
  member: id,
  request: id,
  operation: null,
  retirement: null,
  task: id,
  attempt: id,
  steps: ['install'],
  operations: [reference],
}
const fact = {
  id: 'run/1',
  source: 'execution',
  kind: 'execution',
  phase: 'result',
  recordedAt: 3,
  observedAt: 2,
  origin: 'human',
  target: { device: 'endpoint', registration: id, generation: 1 },
  links,
  delivery: 'received',
  execution: 'succeeded',
  effect: 'unknown',
  reporting: 'partial',
  decision: 'accepted',
  auditOutcome: 'committed',
}
function transport(response: unknown) {
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(response))
  return { request, wire: { request } as unknown as HttpTransport }
}
it('resolves exact Policy selectors through the read-only management contract and rejects mismatches', async () => {
  const { wire, request } = transport({ capability, policy }),
    client = createPoliciesClient(wire)
  for (const selector of [
    { kind: 'id', id },
    { kind: 'tool_name', name: capability.toolName },
    { kind: 'alias', alias: ' SUPPORT ' },
  ] as const)
    expect((await client.resolve(selector)).policy.id).toBe(id)
  expect(request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      method: 'POST',
      path: '/api/v1/policies/resolve',
      body: { kind: 'alias', alias: 'support' },
    }),
  )
  await expect(client.resolve({ kind: 'id', id: other })).rejects.toThrow('Wrong resolved')
  expect(() =>
    decodeCapability({ ...capability, toolName: `policy_${other.replaceAll('-', '')}` }),
  ).toThrow()
  expect(() => decodeCapability({ ...capability, operations: ['invoke'] })).toThrow()
  for (const selector of [
    { kind: 'id', id, alias: 'support' },
    { kind: 'tool_name', name: 'Policy_name' },
    { kind: 'unknown', alias: 'support' },
  ])
    expect(() => decodeSelector(selector as never)).toThrow()
  expect(decodeSelector({ kind: 'tool_name', name: capability.toolName })).toEqual({
    kind: 'tool_name',
    name: capability.toolName,
  })
})
it('reads device-scoped frozen batches and members with formal opaque continuations, never invoking an event', async () => {
  const { wire, request } = transport({ items: [batch], nextCursor: 'YQ' }),
    client = createEventsClient(wire)
  expect(
    (await client.list('endpoint', { filter: "event=='support.event'", cursor: 'Yg' })).items[0]
      ?.members,
  ).toBe(1)
  expect(request.mock.calls[0]?.[0]).toMatchObject({
    method: 'GET',
    path: '/api/v1/devices/{device}/policy-event-batches',
    pathParams: { device: 'endpoint' },
    query: { cursor: 'Yg', filter: "event=='support.event'" },
  })
  const read = createEventsClient(transport(batch).wire)
  expect((await read.read('endpoint', id)).request.source).toBe('human')
  await expect(read.read('endpoint', other)).rejects.toThrow('Wrong batch')
  const results = await createEventsClient(
    transport({ items: [member], nextCursor: null }).wire,
  ).members('endpoint', id)
  expect(results.items[0]?.operations[0]?.reference).toEqual(reference)
  await expect(
    createEventsClient(
      transport({ items: [{ ...member, state: 'pending' }], nextCursor: null }).wire,
    ).members('endpoint', id),
  ).rejects.toThrow()
  await expect(
    createEventsClient(
      transport({
        items: [
          { ...member, operations: [{ reference, state: 'queued', allowedActions: ['cancel'] }] },
        ],
        nextCursor: null,
      }).wire,
    ).members('endpoint', id),
  ).rejects.toThrow()
  for (const decision of [
    { state: 'pending' },
    { state: 'expired' },
    { state: 'no_change', reason: 'current' },
    { state: 'rejected', reason: 'scope' },
  ])
    expect(eventDecision(decision).state).toBe(decision.state)
  expect(() =>
    eventDecision({ state: 'accepted', operations: [{ kind: 'command', id }] }),
  ).toThrow()
})
it('preserves independent effect, reporting, coverage and missing facts while rejecting cross-device and privileged output', async () => {
  const page = {
    items: [fact],
    nextCursor: null,
    syncCursor: 'YQ',
    asOf: 4,
    coverage: [{ source: 'execution', complete: false, reasons: ['source_catchup_pending'] }],
    retainedFrom: null,
  }
  const { wire, request } = transport(page),
    client = createActivitiesClient(wire)
  const actual = await client.list('endpoint', { batch: id, from: 1, until: 5 })
  expect(actual).toMatchObject({
    items: [{ execution: 'succeeded', effect: 'unknown', reporting: 'partial' }],
    coverage: [{ complete: false }],
  })
  expect(request.mock.calls[0]?.[0].query).toMatchObject({ batch: id, from: 1, until: 5 })
  expect(() => managementActivity(fact, 'other-device')).toThrow()
  expect(() => managementActivity({ ...fact, stdout: 'secret' }, 'endpoint')).toThrow()
  expect(() => client.list('endpoint', { from: 5, until: 1 })).toThrow()
  expect(() => client.list('endpoint', { limit: 201 })).toThrow()
  const detail = {
    activity: fact,
    personal: false,
    related: [{ ...fact, id: 'policy/1', target: null, phase: 'changed', kind: 'policy' }],
    relatedCursor: 'YQ',
    missing: ['policy_fact_unavailable'],
    asOf: 4,
  }
  expect(
    (await createActivitiesClient(transport(detail).wire).read('endpoint', fact.id)).missing,
  ).toEqual(['policy_fact_unavailable'])
  await expect(
    createActivitiesClient(transport({ ...detail, personal: true }).wire).read('endpoint', fact.id),
  ).rejects.toThrow()
  await expect(
    createActivitiesClient(transport(detail).wire).read('endpoint', 'different'),
  ).rejects.toThrow()
})
it('round-trips only locator links for policy addresses, events, batches, tasks and version-qualified steps', () => {
  const context = { instance: id, tenant: other }
  const targets: DeepLink[] = [
    { ...context, kind: 'policy', id },
    { ...context, kind: 'policy', toolName: capability.toolName },
    { ...context, kind: 'policy', alias: 'support' },
    { ...context, kind: 'event', event: 'support.event' },
    { ...context, kind: 'event', event: 'support.event', device: 'endpoint' },
    { ...context, kind: 'batch', device: 'endpoint', batch: id },
    { ...context, kind: 'task', device: 'endpoint', task: id },
    {
      ...context,
      kind: 'step',
      device: 'endpoint',
      task: id,
      attempt: other,
      step: 'install-1',
      version: other,
    },
  ]
  for (const target of targets) {
    const text = deepLink(target)
    expect(text.startsWith('rssmdm://open/v1/')).toBe(true)
    expect(parseDeepLink(text)).toEqual(target)
  }
  const valid = deepLink(targets[0]!)
  for (const text of [
    valid + '&token=secret',
    valid + '&id=' + other,
    valid.replace('open/', 'evil/'),
    valid.replace('/v1/', '/v2/'),
    valid + '#secret',
    valid + '&approve=true',
    valid + '&server=https://evil.test',
    valid + '&x=%FF',
    valid + '&x=%GG',
    valid.replace('rssmdm:', 'https:'),
    valid.replace('open', 'user@open'),
  ])
    expect(() => parseDeepLink(text)).toThrow()
  for (const target of [
    { ...targets[0], alias: 'support' },
    { ...targets[1], toolName: 'bad' },
    { ...targets[4], device: 'https://evil.test' },
    { ...targets[7], attempt: undefined },
    { ...targets[0], instance: 'https://evil.test' },
  ])
    expect(() => deepLink(target as DeepLink)).toThrow()
})
