import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createPoliciesClient } from './policies'
import { decodePolicy, defaultSchedule, policyDefinition, selfService } from './model'
const id = '11111111-1111-4111-8111-111111111111'
const definition = {
  customEvent: null,
  alias: null,
  scope: id,
  action: {
    kind: 'execution' as const,
    resource: {
      id: 'script',
      version: '1',
      platform: 'windows' as const,
      architecture: 'x86_64' as const,
      variant: 'default',
    },
    parameters: { level: { kind: 'fixed' as const, value: 1 } },
    schedule: defaultSchedule(),
    frequency: 'once_per_version' as const,
    runLifetimeSeconds: 3600,
  },
}
const policy = { id, revision: 1, version: 1, versionId: id, state: 'enabled', definition }
const metadata = {
  access: { kind: 'authenticated_user' },
  published: true,
  presentation: {
    displayName: 'Diagnostics',
    description: '',
    prerequisites: '',
    sideEffects: '',
    category: 'Support',
    keywords: [],
  },
  allowAi: false,
  riskLevel: 1,
}
it('accepts only the closed formal Policy and rejects the retired candidate DTO', () => {
  expect(decodePolicy(policy, id)).toMatchObject({ id, state: 'enabled', definition })
  for (const value of [
    { ...policy, computation: {} },
    { contract: 'policies-v1', policy },
    { ...policy, definition: { source: 'resource', resource: 'script', scope: id } },
    { ...policy, archived: false },
  ])
    expect(() => decodePolicy(value)).toThrow()
  expect(() => decodePolicy(policy, crypto.randomUUID())).toThrow()
  expect(
    selfService({
      ...metadata,
      presentation: {
        ...metadata.presentation,
        description: 'Step one\nStep two',
        prerequisites: 'One\nTwo',
        sideEffects: 'First\nSecond',
      },
    }),
  ).toMatchObject({ presentation: { description: 'Step one\nStep two' } })
  expect(() =>
    selfService({
      ...metadata,
      presentation: { ...metadata.presentation, description: 'bad\0value' },
    }),
  ).toThrow()
  expect(selfService(metadata)).toMatchObject({ allowAi: false, riskLevel: 1 })
  expect(
    selfService({
      ...metadata,
      presentation: { ...metadata.presentation, vendorHelp: { text: 'support' } },
    }).presentation,
  ).toMatchObject({ vendorHelp: { text: 'support' } })
  expect(selfService({ ...metadata, riskLevel: null, allowAi: null })).toMatchObject({
    riskLevel: null,
    allowAi: null,
  })
  expect(() => selfService({ ...metadata, displayName: 'retired flat metadata' })).toThrow()
  for (const riskLevel of [0, 3, '2'])
    expect(() => selfService({ ...metadata, riskLevel })).toThrow()
  expect(() =>
    policyDefinition({
      ...definition,
      action: {
        ...definition.action,
        parameters: { unexpected: { kind: 'shell', value: 'injection' } },
      },
    }),
  ).toThrow()
  expect(() =>
    policyDefinition({
      ...definition,
      action: {
        ...definition.action,
        parameters: { level: { kind: 'input' } },
        schedule: { ...defaultSchedule(), trigger: { kind: 'check_in', minimumSeconds: 60 } },
      },
    }),
  ).toThrow()
})
it('uses formal V1 collection and operation/CAS without a candidate fallback or automatic replay', async () => {
  let response: unknown = policy
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(response)),
    client = createPoliciesClient({ request } as unknown as HttpTransport)
  const body = {
    operationId: id,
    expectedRevision: 0,
    input: { action: 'put' as const, definition, enabled: true },
  }
  expect(await client.change(id, body)).toMatchObject({ id, state: 'enabled', definition })
  expect(request.mock.calls[0]?.[0]).toMatchObject({
    method: 'POST',
    path: '/api/v1/policies/{id}',
    pathParams: { id },
    body,
  })
  response = {
    items: [
      {
        ...policy,
        action: definition.action.kind,
        scope: definition.scope,
        resource: 'resource' in definition.action ? definition.action.resource.id : null,
        category: null,
        toolName: `policy_${id.replaceAll('-', '')}`,
        alias: null,
        customEvent: null,
      },
    ],
    nextCursor: null,
  }
  expect((await client.list({ filter: "action=='execution'" })).items).toMatchObject([
    { id, state: 'enabled', definition },
  ])
  expect(request.mock.calls.at(-1)?.[0]).toMatchObject({
    path: '/api/v1/policies',
    query: { filter: "action=='execution'", limit: 20 },
  })
  request.mockRejectedValueOnce(new Error('lost response'))
  await expect(client.change(id, body)).rejects.toThrow('lost response')
  expect(request).toHaveBeenCalledTimes(3)
})

it.each(['enabled', 'disabled', 'archived'] as const)(
  'preserves Policy state %s independently of the enabled presentation value',
  (state) => {
    expect(decodePolicy({ ...policy, state })).toMatchObject({
      state,
      enabled: state === 'enabled',
    })
  },
)
it('sends archive only through the existing DELETE body and never retries a lost response', async () => {
  const request = vi.fn(async (o: RequestOptions<unknown>) =>
    o.decode({ ...policy, state: 'archived', revision: 3 }),
  )
  const client = createPoliciesClient({ request } as unknown as HttpTransport)
  const body = { operationId: id, expectedRevision: 2, input: { action: 'archive' as const } }
  expect(await client.change(id, body)).toMatchObject({ state: 'archived', enabled: false })
  expect(request.mock.calls[0]![0]).toMatchObject({ method: 'DELETE', pathParams: { id } })
  expect(request.mock.calls[0]![0].body).toEqual({ operationId: id, expectedRevision: 2 })
  request.mockRejectedValueOnce(new Error('response lost'))
  await expect(client.change(id, body)).rejects.toThrow('response lost')
  expect(request).toHaveBeenCalledTimes(2)
})

it('accepts only continuing fixed intervals for standard collection actions', async () => {
  const { defaultCollectionSchedule } = await import('./model')
  for (const kind of ['native_collection', 'agent_collection']) {
    const action = {
      kind,
      resource: definition.action.resource,
      schedule: defaultCollectionSchedule(),
      frequency: 'every_trigger',
      runLifetimeSeconds: 3600,
    }
    expect(
      policyDefinition({ customEvent: null, alias: null, scope: id, action }).action,
    ).toMatchObject({
      schedule: { trigger: { kind: 'interval', seconds: 3600 } },
      frequency: 'every_trigger',
    })
    for (const invalid of [
      { ...action, frequency: 'once_per_version' },
      { ...action, schedule: defaultSchedule() },
      { ...action, schedule: { ...action.schedule, until: 100 } },
      {
        ...action,
        schedule: { ...action.schedule, misfire: { kind: 'skip', maxLatenessSeconds: 60 } },
      },
    ])
      expect(() =>
        policyDefinition({ customEvent: null, alias: null, scope: id, action: invalid }),
      ).toThrow()
  }
})

it('preserves the current producer alias on complete Policy details and edits', () => {
  for (const alias of [null, 'inventory.default']) {
    const read = decodePolicy({ ...policy, definition: { ...definition, alias } }, id)
    expect(policyDefinition(read.definition).alias).toBe(alias)
  }
  expect(() => policyDefinition({ ...definition, alias: 'unsafe alias' })).toThrow()
})

it('round-trips the complete current Definition and rejects missing core fields', () => {
  for (const customEvent of [null, 'refresh.inventory']) {
    const current = { ...definition, alias: 'diagnostics', customEvent }
    expect(policyDefinition(current)).toEqual(current)
    expect(decodePolicy({ ...policy, definition: current }).definition).toEqual(current)
  }
  expect(policyDefinition({ ...definition, customEvent: ' Refresh.Inventory ' }).customEvent).toBe(
    'refresh.inventory',
  )
  for (const customEvent of ['', 'not an event', 'x'.repeat(65), 1, {}])
    expect(() => policyDefinition({ ...definition, customEvent })).toThrow()
  for (const field of ['customEvent', 'alias']) {
    const incomplete: Record<string, unknown> = { ...definition }
    delete incomplete[field]
    expect(() => policyDefinition(incomplete)).toThrow()
  }
  expect(() =>
    policyDefinition({
      ...definition,
      customEvent: 'refresh',
      action: { ...definition.action, parameters: { value: { kind: 'input' } } },
    }),
  ).toThrow()
})

it('decodes current resource-free Device Access and enrollment self-service without accepting unknown actions', () => {
  const current = {
    ...definition,
    action: {
      kind: 'device_access',
      mac: null,
      windows: { kind: 'rss_factor', accounts: ['local', 'entra'] },
      selfEnrollment: false,
      role: null,
    },
  }
  expect(policyDefinition(current)).toEqual(current)
  expect(() =>
    policyDefinition({
      ...current,
      action: { ...current.action, windows: { kind: 'rss_factor', accounts: ['local', 'local'] } },
    }),
  ).toThrow()
  expect(() =>
    policyDefinition({ ...current, action: { ...current.action, kind: 'unknown' } }),
  ).toThrow()
  expect(
    policyDefinition({
      ...definition,
      selfService: metadata,
      action: {
        kind: 'request_mdm_enrollment',
        organization: id,
        schedule: defaultSchedule(),
        runLifetimeSeconds: 3600,
      },
    }).selfService,
  ).toEqual(metadata)
})

it('uses URL window parameters and retains exactly the original preview body across pages', async () => {
  const input = { definition },
    token = 'b3BhcXVl'
  const request = vi.fn(async (o: RequestOptions<unknown>) =>
    o.decode({ action: definition.action, scopeResult: id, items: [], nextCursor: token }),
  )
  const client = createPoliciesClient({ request } as unknown as HttpTransport)
  await client.preview(input, { limit: 1 })
  await client.preview(input, { limit: 1, cursor: token })
  expect(request.mock.calls.map(([o]) => o.body)).toEqual([input, input])
  expect(request.mock.calls[1]![0].query).toEqual({ limit: 1, cursor: token })
  expect(request.mock.calls[1]![0].body).not.toHaveProperty('scopeResult')
  await expect(client.preview({ ...input, scopeResult: crypto.randomUUID() })).rejects.toThrow(
    'Wrong preview basis',
  )
  request.mockImplementation(async (o) => o.decode({ items: [], nextCursor: null }))
  expect(await client.assignments(id, { limit: 1, cursor: token })).toEqual({
    items: [],
    nextCursor: null,
  })
  expect(request.mock.calls.at(-1)![0].query).toEqual({ limit: 1, cursor: token })
  for (const limit of [0, 1001]) expect(() => client.assignments(id, { limit })).toThrow()
})
