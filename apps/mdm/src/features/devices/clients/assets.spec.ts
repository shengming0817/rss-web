import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createAssetsClient, decodeInventory, decodeAssetPage, decodeCatalog } from './assets'
const tenant = '11111111-1111-4111-8111-111111111111'
const task = '22222222-2222-4222-8222-222222222222'
const evidence = {
  scope: { kind: 'device' },
  source: 'manual',
  registration: null,
  registrationGeneration: null,
  dataset: null,
  epoch: null,
  snapshotId: task,
  observedAt: 1,
  receivedAt: 2,
  actor: 'operator',
}
const field = {
  field: 'custom.is_loaner',
  state: { kind: 'deleted' },
  sources: [
    {
      state: { kind: 'deleted' },
      evidence,
      lastKnown: {
        value: { kind: 'boolean', value: false },
        evidence: { ...evidence, observedAt: 0 },
      },
    },
  ],
}
const device = {
  collectionScope: { kind: 'device' },
  device: 'pending-device',
  channels: [],
  fields: { 'custom.is_loaner': field },
  lists: {},
  quality: [],
  revisions: { 'custom.is_loaner': 2 },
}
it('preserves deleted source history and false without inferring TTL or current values', () => {
  const value = decodeInventory({ tenantId: tenant, asset: { kind: 'detail', device } }, tenant)
  expect(value.fields['custom.is_loaner']).toEqual(field)
  expect(value.revisions['custom.is_loaner']).toBe(2)
  expect(() =>
    decodeInventory({ tenantId: task, asset: { kind: 'detail', device } }, tenant),
  ).toThrow()
  expect(() =>
    decodeInventory(
      {
        tenantId: tenant,
        asset: {
          kind: 'detail',
          device: { ...device, fields: { bad: { ...field, state: { kind: 'expired' } } } },
        },
      },
      tenant,
    ),
  ).toThrow()
})
it.each(['null', 'missing', 'unsupported', 'deleted', 'conflict'])(
  'preserves explicit %s state',
  (kind) => {
    const value = decodeInventory(
      {
        tenantId: tenant,
        asset: {
          kind: 'detail',
          device: { ...device, fields: { 'custom.is_loaner': { ...field, state: { kind } } } },
        },
      },
      tenant,
    )
    expect(value.fields['custom.is_loaner']?.state.kind).toBe(kind)
  },
)
it('accepts an empty tail page and keeps the server cursor opaque', () => {
  const page = {
    kind: 'page',
    items: [],
    nextCursor: 'opaque-next',
    snapshot: task,
    summary: { matched: 2, unknown: 1, total: 3 },
  }
  expect(decodeAssetPage({ tenantId: tenant, asset: page }, tenant)).toEqual(page)
})
it('rejects duplicate catalog keys and malformed manual fields', () => {
  const field = {
    key: 'custom.is_loaner',
    timeSeries: null,
    version: 1,
    valueType: { kind: 'boolean' },
    platforms: ['windows', 'macos'],
    sensitivity: 'standard',
    unit: null,
    searchable: true,
    itemKey: null,
    nullable: true,
    manual: true,
    sources: { manual: 0 },
    operations: ['eq', 'is_null'],
  }
  expect(
    decodeCatalog(
      { tenantId: tenant, asset: { kind: 'fields', dictionary: 'assets-v1', fields: [field] } },
      tenant,
    ).fields,
  ).toEqual([
    {
      key: field.key,
      timeSeries: null,
      version: field.version,
      platforms: field.platforms,
      sensitivity: field.sensitivity,
      unit: field.unit,
      itemKey: field.itemKey,
      searchable: field.searchable,
      kind: 'boolean',
      manual: true,
      nullable: true,
      sources: ['manual'],
      operations: field.operations,
    },
  ])
  expect(() =>
    decodeCatalog(
      {
        tenantId: tenant,
        asset: { kind: 'fields', dictionary: 'assets-v1', fields: [field, field] },
      },
      tenant,
    ),
  ).toThrow()
})
it('uses exact async and CAS requests with one dispatch and no TTL', async () => {
  const request = vi.fn(async (options: RequestOptions<unknown>) =>
    options.decode({
      tenantId: tenant,
      asset: options.path.endsWith('device-queries')
        ? { kind: 'accepted', task, statusUrl: `/api/v1/device-queries/${task}` }
        : { kind: 'assignment', device: 'pending-device', field: 'custom.is_loaner', revision: 3 },
    }),
  )
  const client = createAssetsClient({ request } as unknown as HttpTransport, tenant)
  await client.search({
    operationId: task,
    expectedRevision: 0,
    input: { criteria: null, select: [], sort: null },
  })
  expect(request.mock.calls[0]?.[0]).toMatchObject({
    method: 'POST',
    path: '/api/v1/device-queries',
    successStatus: 202,
  })
  await client.assign('pending-device', 'custom.is_loaner', {
    operationId: task,
    expectedRevision: 2,
    input: { action: 'null' },
  })
  expect(request.mock.calls[1]?.[0]).toMatchObject({
    method: 'PUT',
    path: '/api/v1/devices/{device}/manual-fields/{field}',
    body: { expectedRevision: 2, input: { action: 'null' } },
  })
  expect(request).toHaveBeenCalledTimes(2)
})

it('preserves formal quality field counts in a nonempty inventory response', () => {
  const quality = [
    {
      dataset: 'hardware',
      templateVersion: '1',
      fingerprint: 'a'.repeat(64),
      coverage: {
        id: 'hardware',
        version: '1',
        definition: 'a'.repeat(64),
        format: 'typed-fields-v4',
      },
      complete: false,
      source: 'agent.builtin',
      channel: 'agent',
      registration: task,
      registrationGeneration: 1,
      epoch: task,
      runId: task,
      sequence: 0,
      result: 'partial',
      deliveryPending: false,
      fields: [
        {
          scope: { kind: 'device' },
          reason: 'invalid_value',
          field: 'custom.is_loaner',
          quality: 'invalid',
          status: null,
          receivedAt: 2,
          itemCount: 3,
          invalidItems: 1,
        },
      ],
    },
  ]
  expect(
    decodeInventory(
      { tenantId: tenant, asset: { kind: 'detail', device: { ...device, quality } } },
      tenant,
    ).quality,
  ).toEqual(quality)
  const unboundQuality: Record<string, unknown> = { ...quality[0] }
  delete unboundQuality['coverage']
  for (const invalid of [
    unboundQuality,
    {
      ...quality[0],
      fields: [{ ...quality[0]!.fields[0], scope: { kind: 'apple_user', identity: task } }],
    },
    { ...quality[0], coverage: { ...quality[0]!.coverage, legacy: true } },
  ]) {
    expect(() =>
      decodeInventory(
        { tenantId: tenant, asset: { kind: 'detail', device: { ...device, quality: [invalid] } } },
        tenant,
      ),
    ).toThrow()
  }
  expect(() =>
    decodeInventory(
      {
        tenantId: tenant,
        asset: {
          kind: 'detail',
          device: {
            ...device,
            quality: [{ ...quality[0], fields: [{ ...quality[0]!.fields[0], invalidItems: -1 }] }],
          },
        },
      },
      tenant,
    ),
  ).toThrow()
})

it('rejects unbound or mismatched namespaces in current and last-known device evidence', () => {
  const decode = (value: unknown) =>
    decodeInventory({ tenantId: tenant, asset: { kind: 'detail', device: value } }, tenant)
  const unbound: Record<string, unknown> = { ...device }
  delete unbound['collectionScope']
  expect(() => decode(unbound)).toThrow()
  expect(() =>
    decode({ ...device, collectionScope: { kind: 'apple_user', identity: task } }),
  ).toThrow()
  const oldEvidence: Record<string, unknown> = { ...evidence }
  delete oldEvidence['scope']
  for (const invalid of [
    oldEvidence,
    { ...evidence, scope: { kind: 'device', identity: task } },
    { ...evidence, scope: { kind: 'apple_user', identity: task } },
  ]) {
    expect(() =>
      decode({
        ...device,
        fields: {
          'custom.is_loaner': { ...field, sources: [{ ...field.sources[0], evidence: invalid }] },
        },
      }),
    ).toThrow()
    expect(() =>
      decode({
        ...device,
        fields: {
          'custom.is_loaner': {
            ...field,
            sources: [
              {
                ...field.sources[0],
                lastKnown: { value: { kind: 'boolean', value: false }, evidence: invalid },
              },
            ],
          },
        },
      }),
    ).toThrow()
  }
})

it('consumes only the current dictionary and validates record property schemas', () => {
  const field = {
    key: 'device.hardware',
    timeSeries: null,
    version: 1,
    valueType: {
      kind: 'record',
      properties: {
        serial: {
          required: false,
          valueType: { kind: 'string', maxLength: 128, allowEmpty: false },
        },
      },
    },
    platforms: ['windows'],
    sensitivity: 'standard',
    unit: null,
    searchable: false,
    itemKey: null,
    nullable: false,
    manual: false,
    sources: { 'agent.native': 0 },
    operations: [],
  }
  const decode = (dictionary: string, value: unknown) =>
    decodeCatalog(
      { tenantId: tenant, asset: { kind: 'fields', dictionary, fields: [value] } },
      tenant,
    )
  expect(decode('assets-v1', field).fields[0]?.kind).toBe('object')

  const timeSeries = {
    kind: 'gauge',
    valuePath: ['bytes'],
    intervalStartPath: null,
    dimensions: { power: { path: ['power'], values: [' AC '] } },
    aggregations: ['mean'],
    retention: { key: 'standard', revision: 1 },
    maxResources: 1,
  }
  expect(
    decode('assets-v1', {
      ...field,
      key: 'custom.device_metrics',
      valueType: {
        kind: 'object',
        properties: { bytes: { kind: 'integer' }, power: { kind: 'enum', values: [' AC '] } },
      },
      unit: 'bytes',
      timeSeries,
    }).fields[0]?.timeSeries,
  ).toEqual(timeSeries)

  expect(
    decode('assets-v1', {
      ...field,
      valueType: { kind: 'array', items: { kind: 'integer' }, maxItems: 128 },
      operations: ['contains_any', 'contains_all'],
    }).fields[0]?.operations,
  ).toEqual(['contains_any', 'contains_all'])
  expect(() => decode('assets-v2', field)).toThrow('Unknown asset dictionary')
  expect(() =>
    decode('assets-v1', {
      ...field,
      valueType: { kind: 'record', properties: { serial: { valueType: { kind: 'integer' } } } },
    }),
  ).toThrow()
})

it('reads a tenant-bound collection run without confusing reception and projection', async () => {
  const { decodeCollectionRun } = await import('./assets')
  const tenant = '11111111-1111-4111-8111-111111111111',
    id = '22222222-2222-4222-8222-222222222222'
  const response = {
    tenantId: tenant,
    asset: {
      kind: 'collection_run',
      run: {
        id,
        registration: id,
        generation: 2,
        source: 'mdm.apple',
        epoch: id,
        delivery: { receipt: null, projection: 'pending' },
        fingerprint: 'test',
        coverage: { id: 'base', version: '1', definition: 'base', format: 'v1' },
        complete: false,
        dataset: 'base',
        templateVersion: '1',
        sequence: 1,
        startedAt: 1,
        finishedAt: null,
        result: 'pending',
        reason: null,
        deliveryPending: true,
        fields: [],
      },
    },
  }
  expect(decodeCollectionRun(response, tenant, id)).toMatchObject({
    id,
    finishedAt: null,
    quality: { result: 'pending', deliveryPending: true, complete: false },
  })
  const agent = decodeCollectionRun(
    {
      ...response,
      asset: {
        ...response.asset,
        run: { ...response.asset.run, source: 'agent.native', deliveryPending: false },
      },
    },
    tenant,
    id,
  )
  expect(agent.quality.channel).toBe('agent')
  expect(agent.quality.deliveryPending).toBe(false)
  expect(agent.delivery.projection).toBe('pending')
  expect(() => decodeCollectionRun(response, id, id)).toThrow()
  expect(() =>
    decodeCollectionRun(response, tenant, '33333333-3333-4333-8333-333333333333'),
  ).toThrow()
})

it('binds scoped reads and opaque scope-directory pagination to the requested endpoint', async () => {
  const scope = { kind: 'macos_applications' as const, root: 'user' as const, uid: 501 }
  const scoped = { ...device, collectionScope: scope, fields: {}, revisions: {} }
  const request = vi.fn(async (o: RequestOptions<unknown>) =>
    o.decode({
      tenantId: tenant,
      asset: o.path.endsWith('inventory-scopes')
        ? {
            kind: 'inventory_scopes',
            device: device.device,
            watermark: 12,
            items: [{ scope }],
            nextCursor: 'next-scope',
          }
        : { kind: 'detail', device: scoped },
    }),
  )
  const client = createAssetsClient({ request } as unknown as HttpTransport, tenant)
  expect((await client.scopes(device.device, 'old-scope')).items).toEqual([scope])
  expect(request.mock.calls[0]?.[0].query).toEqual({ limit: 20, cursor: 'old-scope' })
  expect((await client.inventory(device.device, scope)).collectionScope).toEqual(scope)
  expect(request.mock.calls[1]?.[0].query).toEqual({ scope: JSON.stringify(scope) })
  await expect(client.scopes('other-device')).rejects.toThrow()
})
it('retains indeterminate reasons and scoped last-known evidence without promoting it to current', () => {
  const scope = { kind: 'macos_applications', root: 'user', uid: 501 }
  const source = {
    ...field.sources[0],
    state: { kind: 'unknown', value: { reason: 'incomplete' } },
    evidence: { ...evidence, scope },
    lastKnown: {
      value: { kind: 'boolean', value: false },
      evidence: { ...evidence, scope, observedAt: 0 },
    },
  }
  const value = decodeInventory(
    {
      tenantId: tenant,
      asset: {
        kind: 'detail',
        device: {
          ...device,
          collectionScope: scope,
          fields: { 'custom.is_loaner': { ...field, state: source.state, sources: [source] } },
        },
      },
    },
    tenant,
  )
  expect(value.fields['custom.is_loaner']?.state).toEqual({ kind: 'unknown', reason: 'incomplete' })
  expect(value.fields['custom.is_loaner']?.sources[0]?.lastKnown?.value).toEqual({
    kind: 'boolean',
    value: false,
  })
})
