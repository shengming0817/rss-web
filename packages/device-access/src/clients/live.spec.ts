import { describe, it, expect } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createLiveClient } from './live'
import { nativeComputer, nativeBinding, nativeMaterial, application } from './native'
import { viewDecoders as d, CapabilityUnavailable } from '../model'
const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222'
const signal = new AbortController().signal
function endpoint() {
  return {
    id: 'pc',
    status: 'active',
    platform: { state: 'known', values: ['windows'] },
    displayName: { state: { kind: 'known', value: { kind: 'string', value: 'Office PC' } } },
    channels: [
      {
        registrationId: id,
        generation: 2,
        status: 'active',
        channel: 'agent',
        lastCommunicationReceivedAt: 100,
      },
    ],
  }
}
function binding() {
  return {
    id,
    device: 'pc',
    revision: 2,
    principal: id,
    instance: other,
    bindingGeneration: 1,
    factorGeneration: 2,
    account: { platform: 'windows', sid: 'S-1-5-21-1' },
    receivedRevision: 2,
    appliedRevision: 1,
    serverState: 'active',
    effect: null,
  }
}
function material() {
  return {
    id,
    binding: {
      device: 'pc',
      registration: other,
      generation: 2,
      subject: { kind: 'rss_login', binding: id, bindingGeneration: 1, sid: 'S-1-5-21-1' },
    },
    version: 4,
    current: true,
    validity: 'verified',
    escrowed: true,
    operation: id,
    createdAt: 100,
    invalidatedAt: null,
  }
}
function rp() {
  return {
    id: 'app',
    revision: 2,
    enabled: false,
    callback: 'https://app.example.test/callback',
    targetFingerprint: 'fixed',
    capabilities: ['native_key' as const],
  }
}
function setup() {
  const requests: RequestOptions<unknown>[] = [],
    replies: unknown[] = []
  const transport = {
    request: async (o: RequestOptions<unknown>) => {
      requests.push(o)
      if (!replies.length) throw new Error('No fixture')
      return o.decode(replies.shift())
    },
  } as HttpTransport
  return { client: createLiveClient(transport), requests, replies }
}
describe('native public DA adapters', () => {
  it('uses endpoint identity even when the directory contains associated views', async () => {
    const f = setup()
    f.replies.push({
      items: [
        { key: 'endpoint:pc', reference: { kind: 'endpoint', id: 'pc' }, endpoints: [endpoint()] },
        {
          key: 'association:a',
          reference: { kind: 'association', id: 'a' },
          endpoints: [endpoint()],
        },
      ],
      nextCursor: 'next',
    })
    const p = await f.client.computers(null, signal)
    expect(p.items).toHaveLength(1)
    expect(p.items[0]?.name).toBe('Office PC')
    expect(p.nextCursor).toBe('next')
    expect(f.requests[0]?.query?.['fields']).toBe('key,reference,endpoints')
    f.replies.push({ reference: { kind: 'endpoint', id: 'pc' }, endpoints: [endpoint()] })
    expect((await f.client.computer('pc', signal)).id).toBe('pc')
    f.replies.push({ reference: { kind: 'association', id: 'pc' }, endpoints: [endpoint()] })
    await expect(f.client.computer('pc', signal)).rejects.toThrow('Mismatched')
  })
  it('never infers platform or application success from partial observations', () => {
    expect(
      nativeComputer({
        ...endpoint(),
        platform: { state: 'unknown', values: [] },
        channels: [],
        displayName: undefined,
      }),
    ).toMatchObject({ name: 'pc', platform: 'unknown', lastObservedAt: null, registration: null })
    expect(() =>
      nativeComputer({ ...endpoint(), platform: { state: 'known', values: [] } }),
    ).toThrow()
    expect(
      nativeComputer({
        ...endpoint(),
        platform: { state: 'conflict', values: ['windows', 'macos'] },
      }).platform,
    ).toBe('unknown')
    const b = nativeBinding(binding(), 'pc')
    expect(b.appliedRevision).toBe(1)
    expect(b.observations).toEqual([])
    expect(() => nativeBinding(binding(), 'other')).toThrow()
    expect(
      nativeBinding({ ...binding(), account: null, effect: { state: 'unknown' } }, 'pc')
        .observations[0]?.state,
    ).toBe('unknown')
  })
  it('keeps Apple facts independent and rejects unrecognized effect enums', () => {
    const b = nativeBinding(
      {
        ...binding(),
        account: { platform: 'macos', generatedUid: id },
        effect: {
          state: 'applied',
          role: 'standard',
          mac: {
            secureToken: 'present',
            volumeOwner: 'unknown',
            filevaultUnlock: 'needs_administrator',
            platformSso: {
              configuration: 'present',
              deviceRegistered: 'present',
              userRegistered: 'absent',
            },
          },
          windows: null,
        },
      },
      'pc',
    )
    expect(b.observations.find((o) => o.key === 'filevaultUnlock')?.state).toBe('pending')
    expect(b.observations.find((o) => o.key === 'userRegistered')?.value).toBe('absent')
    expect(
      nativeBinding({ ...binding(), effect: { state: 'failed', reason: 'needs_user' } }, 'pc')
        .observations,
    ).toHaveLength(2)
    expect(() => nativeBinding({ ...binding(), effect: { state: 'success' } }, 'pc')).toThrow()
    expect(
      nativeBinding(
        {
          ...binding(),
          effect: { state: 'applied', role: 'administrator', mac: null, windows: {} },
        },
        'pc',
      ).observations,
    ).toHaveLength(2)
  })
  it('dispatches binding changes once and binds receipts to the requested object', async () => {
    const f = setup(),
      input = { operationId: id, expectedRevision: 1, action: { kind: 'reset_factors' as const } }
    f.replies.push({ items: [binding()], nextCursor: null }, binding(), binding(), binding())
    expect((await f.client.bindings('pc', 'cursor', signal)).items).toHaveLength(1)
    await f.client.changeBinding('pc', id, input, signal)
    expect(f.requests[1]?.body).toEqual(input)
    await f.client.bindingOperation('pc', id, signal)
    await expect(f.client.changeBinding('pc', other, input, signal)).rejects.toThrow()
    f.replies.push(binding())
    await expect(
      f.client.changeBinding('pc', id, { ...input, expectedRevision: 2 }, signal),
    ).rejects.toThrow('revision')
  })
  it('discloses only exact DA materials via the dedicated POST endpoint', async () => {
    const f = setup(),
      m = nativeMaterial(material(), 'pc')
    f.replies.push(
      { items: [material()], nextCursor: null },
      { material: material(), secret: 'sensitive fixture' },
      { material: { ...material(), version: 5 }, secret: 'wrong' },
    )
    expect((await f.client.materials('pc', null, signal)).items[0]).toEqual(m)
    expect(await f.client.reveal('pc', m, id, signal)).toBe('sensitive fixture')
    expect(f.requests[1]?.method).toBe('POST')
    expect(f.requests[1]?.path).toContain('/device-access/materials/')
    await expect(f.client.reveal('pc', m, id, signal)).rejects.toThrow()
    expect(() => nativeMaterial(material(), 'other')).toThrow()
    expect(
      nativeMaterial(
        { ...material(), binding: { ...material().binding, subject: { kind: 'filevault' } } },
        'pc',
      ).subject.binding,
    ).toBeNull()
    await expect(
      f.client.reveal('pc', { ...m, subject: { ...m.subject, kind: 'filevault' } }, id, signal),
    ).rejects.toBeInstanceOf(CapabilityUnavailable)
  })
  it('never sends speculative rotation, assignment, Passkey or configuration requests', async () => {
    const f = setup(),
      m = nativeMaterial(material(), 'pc')
    const calls = [
      () => f.client.rotate('pc', m, id, signal),
      () => f.client.assignment('pc', signal),
      () => f.client.people(signal),
      () =>
        f.client.assign(
          'pc',
          { operationId: id, expectedRevision: 1, assignee: null, owner: null },
          signal,
        ),
      () => f.client.passkeys('pc', null, signal),
      () => f.client.configurations(null, signal),
      () => f.client.scopes(signal),
      () =>
        f.client.configuration(
          {
            id,
            operationId: id,
            expectedRevision: 0,
            name: 'test',
            platform: 'windows',
            role: 'preserve',
            selfEnrollment: true,
            scope: { id, label: 'scope' },
            exclusions: [],
            mode: 'rss_factor',
          },
          signal,
        ),
      () => f.client.operation(null, id, signal),
    ]
    for (const call of calls) await expect(call()).rejects.toBeInstanceOf(CapabilityUnavailable)
    expect(f.requests).toHaveLength(0)
    expect(f.client.capabilities.rotation.available).toBe(false)
  })
  it('preserves enterprise RP contracts and separate step-up shapes', async () => {
    const f = setup(),
      input = { ...rp(), operationId: id, expectedRevision: 1 }
    f.replies.push(
      { items: [{ id: 'rp:app', kind: 'relying_party', value: rp() }], nextCursor: null },
      { id, options: {}, expires_at: 9999999999 },
      { id, options: {} },
    )
    expect((await f.client.applications(null, signal)).items[0]?.id).toBe('app')
    await expect(f.client.application(input, signal)).rejects.toBeInstanceOf(CapabilityUnavailable)
    await expect(f.client.applicationChallenge(input, signal)).rejects.toBeInstanceOf(
      CapabilityUnavailable,
    )
    expect(f.client.capabilities.applicationWrite.available).toBe(false)
    expect(f.requests).toHaveLength(1)
    await f.client.bindingChallenge(
      'pc',
      id,
      { operationId: id, expectedRevision: 1, action: { kind: 'reset_factors' } },
      signal,
    )
    await f.client.materialChallenge('pc', nativeMaterial(material(), 'pc'), id, signal)
    expect(application(rp()).capabilities).toEqual(['native_key'])
    for (const callback of ['http://x.test', 'https://user@x.test', 'https://x.test/?secret=x'])
      expect(() => application({ ...rp(), callback })).toThrow()
  })
  it('uses native operation and redacted audit facts without guessing terminal effect', async () => {
    const f = setup()
    f.replies.push(
      { operationId: id, commandStatus: 'completed' },
      {
        items: [
          {
            eventId: id,
            recordedAt: 10,
            actor: 'user',
            action: 'read',
            deviceId: 'pc',
            auditOutcome: 'succeeded',
            phase: 'accepted',
          },
        ],
        nextCursor: null,
        coverage: { complete: false },
      },
      { items: [], nextCursor: null, coverage: { complete: true } },
    )
    expect(await f.client.operation('pc', id, signal)).toMatchObject({
      state: 'pending',
      observations: [{ value: 'completed' }],
    })
    expect((await f.client.audit('pc', null, signal)).items[0]?.device).toBe('pc')
    await f.client.audit(null, 'cursor', signal)
    expect(f.requests[2]?.path).toBe('/api/v1/audit-events')
  })
})
it('bounds candidate view models and rejects cross-device data and personal records', () => {
  const c = d.computerView({
    id: 'pc',
    name: 'Computer',
    platform: 'windows',
    registration: id,
    generation: 1,
    status: 'active',
    lastObservedAt: null,
  })
  expect(c.id).toBe('pc')
  const a = { device: 'pc', revision: 1, assignee: { id, label: 'A' }, owner: null }
  expect(d.assignmentView(a, 'pc').assignee?.label).toBe('A')
  expect(() => d.assignmentView(a, 'other')).toThrow()
  const p = {
    id,
    device: 'pc',
    rp: 'app.test',
    account: 'user',
    label: 'key',
    scope: 'enterprise',
    state: 'synced',
    lastObservedAt: null,
  }
  expect(d.passkeyView(p, 'pc').state).toBe('synced')
  expect(() => d.passkeyView({ ...p, scope: 'personal' }, 'pc')).toThrow()
  expect(() => d.passkeyView(p, 'other')).toThrow()
  const m = nativeMaterial(material(), 'pc')
  expect(d.materialView(m, 'pc')).toEqual(m)
  const b = nativeBinding(binding(), 'pc')
  expect(d.bindingView(b, 'pc')).toEqual(b)
  expect(
    d.operationView(
      { id, device: 'pc', kind: 'rotation', state: 'accepted', observations: [] },
      'pc',
      id,
    ).state,
  ).toBe('accepted')
  const cfg = {
    id,
    revision: 1,
    name: 'A',
    platform: 'windows',
    role: 'preserve',
    selfEnrollment: true,
    scope: { id, label: 'scope' },
    exclusions: [],
    state: 'pending',
    mode: 'rss_factor',
  }
  expect(d.configurationView(cfg).name).toBe('A')
  expect(
    d.applicationView({
      id: 'app',
      revision: 1,
      enabled: false,
      callback: 'https://app.test',
      capabilities: ['native_key' as const],
    }),
  ).toHaveProperty('id', 'app')
  expect(
    d.auditView({
      id,
      recordedAt: 10,
      actor: 'u',
      action: 'change',
      device: null,
      outcome: 'accepted',
      phase: 'service',
    }),
  ).toHaveProperty('device', null)
  expect(d.credentialView({ id, label: 'key' }).id).toBe(id)
  for (const invalid of [null, [], 0, 'x']) expect(() => d.closed(invalid, [])).toThrow()
  expect(() => d.closed({ x: 1 }, [])).toThrow()
  expect(() => d.closed({}, ['x'])).toThrow()
  expect(() => d.uuid('00000000-0000-0000-0000-000000000000')).toThrow()
  expect(() => d.text('bad\nvalue')).toThrow()
  expect(() => d.count(-1)).toThrow()
  expect(() => d.bool('true')).toThrow()
  expect(() => d.list({}, d.text)).toThrow()
  expect(() => d.choice('other', ['known'])).toThrow()
})
