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
      path: '/api/v1/tenants/{tenant}/asset-fields',
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
    envelope(
      { kind: 'accepted', task, statusUrl: `/api/v1/tenants/${tenant}/device-queries/${task}` },
      other,
    ),
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
      pathParams: { tenant, id: task },
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
      deviceId: null,

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
        moduleObservationStale: null,
        device: {
          device: '0ecbfa6c-9a99-5881-83ed-2059142c94d9',
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
  const result = await createInventoryAdapter(f.transport, tenant).inventory(
    '0ecbfa6c-9a99-5881-83ed-2059142c94d9',
    {
      kind: 'device',
    },
  )
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
        device: '0ecbfa6c-9a99-5881-83ed-2059142c94d9',
        field: 'custom.rows',
        assetCut: {
          tenant: '11111111-1111-4111-8111-111111111111',
          epoch: '22222222-2222-4222-8222-222222222222',
          snapshot: '1:2:',
        },
        total: 0,
        items: [],
        nextCursor: 'b3BhcXVl',
      }),
    ),
    client = createInventoryAdapter(f.transport, tenant)
  expect(
    (
      await client.list({
        reference: { kind: 'endpoint', id: '0ecbfa6c-9a99-5881-83ed-2059142c94d9' },
        endpoint: '0ecbfa6c-9a99-5881-83ed-2059142c94d9',
        field: 'custom.rows',
        scope,
        cursor: 'opaque-source/first=',
        limit: 2,
      })
    ).total,
  ).toBe(0)
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      body: { scope, cursor: 'opaque-source/first=', limit: 2 },
    }),
  )
})
it('uses opaque Resource references in field impact pages rather than requiring UUIDs', async () => {
  const f = fixture({
    items: [
      {
        source: { kind: 'resource_version', id: 'rss/collection.native', version: '1.0' },
        role: 'collection_mapping',
        release: 'archive_referencing_version',
      },
    ],
    nextCursor: null,
  })
  const value = (await createInventoryAdapter(f.transport, tenant).references('custom.ready', {}))
    .items[0]?.source
  expect(value?.kind === 'resource_version' ? value.id : null).toBe('rss/collection.native')
})
it('sends the observed saved revision unchanged and preserves sparse saved directory rows', async () => {
  const f = fixture(
      envelope({
        kind: 'accepted',
        task,
        statusUrl: `/api/v1/tenants/${tenant}/device-queries/${task}`,
      }),
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

it('reads only the requested tenant and immutable retention policy revision', async () => {
  const policy = {
    key: 'telemetry',
    revision: 2,
    rawSeconds: 60,
    summarySeconds: 120,
    restoreSeconds: 0,
  }
  const response = fixture(envelope({ kind: 'retention_policy', policy }))
  const reference = { key: policy.key, revision: policy.revision }
  const signal = new AbortController().signal
  expect(
    await createInventoryAdapter(response.transport, tenant).retentionPolicy(reference, signal),
  ).toEqual(policy)
  expect(response.request).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'GET',
      path: '/api/v1/tenants/{tenant}/asset-retention-policies/{key}/{revision}',
      pathParams: { tenant, ...reference },
      signal,
    }),
  )
  const missing = fixture(envelope({ kind: 'retention_policy', policy: null }))
  expect(
    await createInventoryAdapter(missing.transport, tenant).retentionPolicy(reference),
  ).toBeNull()
  for (const invalid of [
    envelope({ kind: 'retention_policy', policy }, other),
    envelope({ kind: 'retention_policy', policy: { ...policy, revision: 1 } }),
    envelope({ kind: 'retention_policy', policy: { ...policy, key: 'other' } }),
    envelope({ kind: 'retention_policy', policy: { ...policy, restoreSeconds: 61 } }),
  ]) {
    await expect(
      createInventoryAdapter(fixture(invalid).transport, tenant).retentionPolicy(reference),
    ).rejects.toThrow()
  }
})

it('posts the frozen operation envelope and requires the complete retention publication receipt', async () => {
  const policy = {
    key: 'telemetry',
    revision: 2,
    rawSeconds: 60,
    summarySeconds: 120,
    restoreSeconds: 0,
  }
  const change = { operationId: task, expectedRevision: 1, input: policy }
  const response = fixture(envelope({ kind: 'retention_policy', policy }))
  expect(
    await createInventoryAdapter(response.transport, tenant).publishRetentionPolicy(change),
  ).toEqual(policy)
  expect(response.request).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'POST',
      path: '/api/v1/tenants/{tenant}/asset-retention-policies',
      pathParams: { tenant },
      body: change,
    }),
  )
  for (const wrong of [null, { ...policy, summarySeconds: 180 }, { ...policy, revision: 3 }]) {
    const result = fixture(envelope({ kind: 'retention_policy', policy: wrong }))
    await expect(
      createInventoryAdapter(result.transport, tenant).publishRetentionPolicy(change),
    ).rejects.toThrow('Wrong retention policy receipt')
  }
})
