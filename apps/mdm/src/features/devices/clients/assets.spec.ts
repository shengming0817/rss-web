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
      { tenantId: tenant, asset: { kind: 'fields', dictionary: 'assets-v2', fields: [field] } },
      tenant,
    ).fields,
  ).toEqual([
    {
      key: field.key,
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
        asset: { kind: 'fields', dictionary: 'assets-v2', fields: [field, field] },
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
