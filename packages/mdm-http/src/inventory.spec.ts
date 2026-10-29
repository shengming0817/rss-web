import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import type { FieldDefinition } from '@rss/mdm-inventory'
import { createInventoryAdapter } from './inventory'

const tenant = '11111111-1111-4111-8111-111111111111',
  task = '22222222-2222-4222-8222-222222222222',
  other = '33333333-3333-4333-8333-333333333333'
function fixture(value: unknown) {
  const request = vi.fn(async (options: RequestOptions<unknown>) => options.decode(value))
  return { transport: { request } as unknown as HttpTransport, request }
}
function envelope(asset: unknown, tenantId = tenant) {
  return { tenantId, asset }
}
it('admits sparse field rows and preserves false while leaving complete editing to detail', async () => {
  const f = fixture(
      envelope({
        kind: 'field_list',
        dictionary: 'dictionary-7',
        items: [{ key: 'custom.ready', manual: false }],
        nextCursor: 'b3BhcXVl',
      }),
    ),
    client = createInventoryAdapter(f.transport, tenant)
  expect(await client.fields({ fields: ['key', 'manual'], limit: 1 })).toEqual({
    dictionary: 'dictionary-7',
    items: [{ key: 'custom.ready', manual: false }],
    nextCursor: 'b3BhcXVl',
  })
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      path: '/api/v1/asset-fields',
      query: { fields: 'key,manual', limit: 1 },
    }),
  )
  expect(() => client.fields({ fields: ['manual'] })).toThrow('identity required')
})
it('rejects cross-tenant envelopes and a query status URL outside the formal operation path', async () => {
  const body = {
      filter: null,
      scope: { selector: { kind: 'device' as const }, quantifier: 'one' as const },
      fields: [],
      sort: [],
    },
    badUrl = fixture(envelope({ kind: 'accepted', task, statusUrl: 'https://other.example/task' }))
  await expect(createInventoryAdapter(badUrl.transport, tenant).query(task, body)).rejects.toThrow()
  const foreign = fixture(
    envelope({ kind: 'accepted', task, statusUrl: `/api/v1/device-queries/${task}` }, other),
  )
  await expect(createInventoryAdapter(foreign.transport, tenant).query(task, body)).rejects.toThrow(
    'Wrong inventory binding',
  )
})
it('keeps full server summaries and opaque continuation on an empty fixed-result page', async () => {
  const f = fixture(
      envelope({
        kind: 'page',
        snapshot: task,
        summary: { total: 125, matched: 42, unknown: 9 },
        items: [],
        nextCursor: 'b3BhcXVl',
      }),
    ),
    client = createInventoryAdapter(f.transport, tenant)
  expect(await client.queryItems(task, { cursor: 'cHJldmlvdXM', limit: 1 })).toEqual({
    snapshot: task,
    summary: { total: 125, matched: 42, unknown: 9 },
    items: [],
    nextCursor: 'b3BhcXVl',
  })
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      pathParams: { id: task },
      query: { cursor: 'cHJldmlvdXM', limit: 1 },
    }),
  )
  await expect(client.queryItems(other, {})).rejects.toThrow('Wrong fixed query snapshot')
})
it('keeps current unknown distinct from historical known values and source registration coordinates', async () => {
  const evidence = {
      scope: { kind: 'device' },
      source: 'manual',
      dataset: null,
      registration: null,
      registrationGeneration: null,
      epoch: null,
      snapshotId: task,
      observedAt: 2,
      receivedAt: 3,
      actor: 'operator',
    },
    current = { kind: 'unknown', value: { reason: 'incomplete' } },
    previous = {
      value: { kind: 'boolean', value: false },
      evidence: { ...evidence, observedAt: 1 },
    },
    f = fixture(
      envelope({
        kind: 'detail',
        device: {
          device: 'endpoint',
          collectionScope: { kind: 'device' },
          channels: [],
          fields: {
            'custom.ready': {
              field: 'custom.ready',
              state: current,
              sources: [{ state: current, evidence, lastKnown: previous }],
            },
          },
          lists: {},
          quality: [],
          revisions: { 'custom.ready': 0 },
        },
      }),
    )
  const result = await createInventoryAdapter(f.transport, tenant).inventory('endpoint', {
    kind: 'device',
  })
  expect(result.fields['custom.ready']?.state).toEqual(current)
  expect(result.fields['custom.ready']?.sources[0]?.lastKnown).toEqual(previous)
  expect(result.revisions['custom.ready']).toBe(0)
})
it('retains concrete namespace in endpoint list requests and does not reinterpret cursor bytes', async () => {
  const scope = {
      kind: 'native_user' as const,
      owner: { kind: 'macos' as const, uid: 501, generated_uid: other },
    },
    f = fixture(
      envelope({
        kind: 'list_items',
        device: 'endpoint',
        field: 'custom.rows',
        watermark: 8,
        total: 0,
        items: [],
        nextCursor: 'b3BhcXVl',
      }),
    ),
    client = createInventoryAdapter(f.transport, tenant)
  expect(
    (
      await client.list({
        reference: { kind: 'endpoint', id: 'endpoint' },
        endpoint: 'endpoint',
        field: 'custom.rows',
        scope,
        cursor: 'opaque-source/first=',
        limit: 2,
      })
    ).total,
  ).toBe(0)
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      query: { scope: JSON.stringify(scope), cursor: 'opaque-source/first=', limit: 2 },
    }),
  )
})
it('uses opaque Resource references in field impact pages rather than requiring UUIDs', async () => {
  const f = fixture(
    envelope({
      kind: 'field_references',
      field: 'custom.ready',
      impact: {
        archivedResourceVersions: 1,
        compliance: 2,
        groups: 3,
        savedQueries: 4,
        telemetryProfiles: 0,
        templates: 1,
      },
      mappings: [
        { resource: 'rss/collection.native', version: '1.0', state: 'active', telemetry: false },
      ],
      nextCursor: null,
    }),
  )
  expect(
    (await createInventoryAdapter(f.transport, tenant).references('custom.ready', {})).items[0]
      ?.resource,
  ).toBe('rss/collection.native')
})
it('sends the observed saved revision unchanged and preserves sparse saved directory rows', async () => {
  const f = fixture(
      envelope({ kind: 'accepted', task, statusUrl: `/api/v1/device-queries/${task}` }),
    ),
    client = createInventoryAdapter(f.transport, tenant)
  await client.executeSavedQuery(other, { operationId: task, expectedRevision: 7, input: {} })
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({ body: { operationId: task, expectedRevision: 7, input: {} } }),
  )
  const sparse = fixture(
    envelope({
      kind: 'saved_list',
      items: [{ id: other, name: 'Saved', deleted: false }],
      nextCursor: null,
    }),
  )
  expect(
    (
      await createInventoryAdapter(sparse.transport, tenant).savedQueries({
        fields: ['id', 'name', 'deleted'],
      })
    ).items,
  ).toEqual([{ id: other, name: 'Saved', deleted: false }])
})

it('reads the formal complete field descriptor as an edit baseline without directory operations', async () => {
  const definition: FieldDefinition = {
    key: 'custom.ready',
    version: 2,
    valueType: { kind: 'boolean' },
    nullable: true,
    manual: true,
    searchable: true,
    sources: { manual: 0 },
    platforms: ['windows', 'macos'],
    sensitivity: 'standard',
    unit: null,
    itemKey: null,
    timeSeries: null,
  }
  const f = fixture(
      envelope({
        kind: 'field_descriptor',
        field: { ...definition, operations: ['eq', 'is_null'] },
      }),
    ),
    client = createInventoryAdapter(f.transport, tenant)
  expect(await client.field('custom.ready')).toEqual({
    field: 'custom.ready',
    version: 2,
    definition,
  })
  await expect(client.field('custom.other')).rejects.toThrow('Wrong field detail')
  const next = { ...definition, version: 3 }
  f.request.mockImplementation(async (options: RequestOptions<unknown>) =>
    options.decode(
      envelope({ kind: 'field', field: 'custom.ready', version: 3, definition: next }),
    ),
  )
  await client.putField('custom.ready', {
    operationId: task,
    expectedRevision: 2,
    input: { action: 'put', definition: next },
  })
  expect(f.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      body: {
        operationId: task,
        expectedRevision: 2,
        input: { action: 'put', definition: next },
      },
    }),
  )
})
