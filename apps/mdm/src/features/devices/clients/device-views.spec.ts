import { expect, it } from 'vitest'
import { decodeViews, decodeView } from './device-views'
import { decodeDirectory } from './directory'
const endpoint = {
  id: 'device-one',
  status: 'registered',
  primaryMdmRegistration: null,
  channels: [],
  enrollments: [],
}
const reference = { kind: 'endpoint' as const, id: endpoint.id }
const item = {
  reference,
  association: null,
  endpoints: [{ ...endpoint, assetState: 'active', platform: { state: 'unknown', values: [] } }],
}
const page = {
  items: [item],
  statistics: { endpointCount: 1, deviceViewCount: 1 },
  nextCursor: null,
}
it('requires the current asset state on view endpoints while the device directory keeps its own shape', () => {
  for (const assetState of ['active', 'archived', 'deleted']) {
    const value = {
      ...item,
      endpoints: [{ ...endpoint, assetState, platform: { state: 'unknown', values: [] } }],
    }
    expect(decodeViews({ ...page, items: [value] }).items[0]?.endpoints[0]?.assetState).toBe(
      assetState,
    )
  }
  for (const invalid of [
    endpoint,
    { ...endpoint, assetState: 'retired' },
    { ...endpoint, assetState: 'active', legacy: true },
  ])
    expect(() => decodeViews({ ...page, items: [{ ...item, endpoints: [invalid] }] })).toThrow()
  const directory = {
    items: [{ ...endpoint, inventoryAvailable: false }],
    statistics: { total: 1, pending: 0, active: 0, revoked: 0 },
    asOf: 0,
    nextCursor: null,
  }
  expect(decodeDirectory(directory).items[0]?.id).toBe(endpoint.id)
  expect(() =>
    decodeDirectory({ ...directory, items: [{ ...directory.items[0], assetState: 'active' }] }),
  ).toThrow()
})
it('retains scoped source evidence on view detail and rejects evidence outside the device namespace', () => {
  const evidence = {
    scope: { kind: 'device' },
    source: 'manual',
    dataset: null,
    registration: null,
    registrationGeneration: null,
    epoch: null,
    snapshotId: 'snapshot',
    observedAt: 0,
    receivedAt: 1,
    actor: 'operator',
  }
  const source = {
    endpoint: endpoint.id,
    fact: {
      state: { kind: 'known', value: { kind: 'boolean', value: false } },
      lastKnown: null,
      evidence,
    },
  }
  const detail = {
    ...item,
    fields: {
      'custom.is_loaner': {
        field: 'custom.is_loaner',
        state: source.fact.state,
        sources: [source],
      },
    },
    lists: {},
    inventorySources: [
      { endpoint: endpoint.id, quality: [], revisions: { 'custom.is_loaner': 1 } },
    ],
  }
  expect(
    decodeView(detail, reference).fields['custom.is_loaner']?.sources[0]?.fact.evidence,
  ).toEqual(evidence)
  expect(() =>
    decodeView(
      {
        ...detail,
        fields: {
          'custom.is_loaner': {
            ...detail.fields['custom.is_loaner'],
            sources: [
              {
                ...source,
                fact: {
                  ...source.fact,
                  evidence: { ...evidence, scope: { kind: 'apple_user', identity: 'unrelated' } },
                },
              },
            ],
          },
        },
      },
      reference,
    ),
  ).toThrow()
})
