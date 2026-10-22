import { expect, it } from 'vitest'
import { decodeViews, decodeView } from './device-views'
import { decodeDirectory } from './directory'
import { endpoint as decodeEndpoint } from './endpoint-model'

it('requires a nullable server communication receipt on each registration', () => {
  const channel = {
    registrationId: '11111111-1111-4111-8111-111111111111',
    generation: 1,
    channel: 'mdm',
    source: 'mdm.windows',
    platform: 'windows',
    status: 'active',
    children: [],
    userContext: null,
    lastCommunicationReceivedAt: 1780000090,
  }
  const current = {
    id: 'device-one',
    status: 'active',
    primaryMdmRegistration: null,
    channels: [channel],
    enrollments: [],
  }
  for (const at of [null, 1780000090]) {
    const result = decodeEndpoint({
      ...current,
      channels: [{ ...channel, lastCommunicationReceivedAt: at }],
    })
    expect(result.channels[0]?.lastCommunicationReceivedAt).toBe(at)
    expect(result.channels[0]?.registrationId).toBe(channel.registrationId)
  }
  for (const invalid of [undefined, '1780000090', 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])
    expect(() =>
      decodeEndpoint({
        ...current,
        channels: [{ ...channel, lastCommunicationReceivedAt: invalid }],
      }),
    ).toThrow()
  const missing: Partial<typeof channel> = { ...channel }
  delete missing.lastCommunicationReceivedAt
  expect(() => decodeEndpoint({ ...current, channels: [missing] })).toThrow()
})
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

it('requires source-specific personnel and suppresses unavailable values without accepting old relations', () => {
  const user = {
    tenantId: '11111111-1111-4111-8111-111111111111',
    instanceId: '22222222-2222-4222-8222-222222222222',
    principalId: '33333333-3333-4333-8333-333333333333',
  }
  const profile = {
    source: { kind: 'identity_local' },
    status: 'available',
    displayName: 'A Person',
    username: 'source-alias',
  }
  const display = {
    login: 'local-login',
    profiles: [
      profile,
      {
        source: { kind: 'idp', provider: '44444444-4444-4444-8444-444444444444' },
        status: 'expired',
        displayName: null,
        username: null,
      },
    ],
  }
  const decode = (relation: unknown) =>
    decodeViews({
      ...page,
      items: [{ ...item, endpoints: [{ ...item.endpoints[0], registrationUser: relation }] }],
    }).items[0]!.endpoints[0]!.registrationUser
  expect(decode({ revision: 1, user, display })?.display).toEqual(display)
  expect(decode({ revision: 1, user, display: null })?.display).toBeNull()
  for (const invalid of [
    { revision: 1, user },
    { revision: 1, user: null, display },
    { revision: 1, user, display: { ...display, profiles: [profile, profile] } },
    { revision: 1, user, display: { ...display, profiles: [{ ...profile, status: 'expired' }] } },
    { revision: 1, user, display: { ...display, profiles: [{ ...profile, source: null }] } },
  ])
    expect(() => decode(invalid)).toThrow()
  const decodeCurrent = (currentUser: unknown) =>
    decodeViews({
      ...page,
      items: [{ ...item, endpoints: [{ ...item.endpoints[0], currentUser }] }],
    })
  expect(
    decodeCurrent({ revision: 1, state: 'active', user, confirmedAt: 1, display }).items[0]!
      .endpoints[0]!.currentUser?.display,
  ).toEqual(display)
  expect(() => decodeCurrent({ revision: 1, state: 'active', user, confirmedAt: 1 })).toThrow()
})
