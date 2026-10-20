import { afterEach, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import type { IdentitySession } from '@rss/auth'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { networkErrorForTest } from '@rss/api/testing'
import {
  createRegistrationChannelsClient,
  decodeChannels,
  registrationChannels,
} from './registrationChannels'
import { createRegistrationChannels } from './registrationChannelState'
const tenant = '11111111-1111-4111-8111-111111111111',
  instance = '44444444-4444-4444-8444-444444444444',
  principal = '22222222-2222-4222-8222-222222222222'
const snapshot = () => ({
  tenantId: tenant,
  instanceId: instance,
  channels: registrationChannels.map((channel) => ({
    channel,
    revision: 0,
    admission: 'allowed',
    availability: 'ready',
    reason: null,
  })),
})
const stores: ReturnType<typeof createRegistrationChannels>[] = []
afterEach(() => {
  stores.splice(0).forEach((s) => s.dispose())
})
it('decodes the complete current contract and rejects malformed or foreign projections', () => {
  expect(decodeChannels(snapshot(), tenant, instance)).toHaveLength(3)
  const value = snapshot()
  for (const bad of [
    { ...value, tenantId: instance },
    { ...value, instanceId: tenant },
    { ...value, extra: true },
    { ...value, channels: value.channels.slice(1) },
    { ...value, channels: [value.channels[0], value.channels[0], value.channels[2]] },
    { ...value, channels: value.channels.map((c) => ({ ...c, extra: true })) },
    {
      ...value,
      channels: value.channels.map((c) => ({ ...c, availability: 'fault', reason: null })),
    },
  ])
    expect(() => decodeChannels(bad, tenant, instance)).toThrow()
})
function setup() {
  const state = shallowRef({
    status: 'authenticated',
    tenant,
    identity: { principalId: principal },
    session: { id: instance },
  })
  const read = vi.fn(async () => decodeChannels(snapshot(), tenant, instance)),
    change = vi.fn(async (_c: string, _op: string, rev: number, admission: string) => ({
      channel: 'agent' as const,
      revision: rev + 1,
      admission: admission as 'allowed' | 'paused',
    }))
  const effective = vi.fn(async () => ({
    instanceId: instance,
    tenantId: tenant,
    principalId: principal,
    grants: [{ operation: 'registration_configuration_write', scope: { kind: 'tenant' } }],
  }))
  const store = createRegistrationChannels(
    { read, change },
    { state } as unknown as IdentitySession,
    { effective } as never,
    tenant,
  )
  stores.push(store)
  return { store, state, read, change, effective }
}
it('loads lazily, shares reads and clears facts and commands synchronously on a new session', async () => {
  const { store, read, state, change } = setup()
  expect(read).not.toHaveBeenCalled()
  await Promise.all([store.refresh(), store.refresh()])
  expect(read).toHaveBeenCalledTimes(1)
  expect(store.allowed('agent')).toBe(true)
  change.mockRejectedValueOnce(networkErrorForTest())
  await expect(store.change('agent', 'paused')).rejects.toThrow()
  expect(store.commands.get('agent')?.state).toBe('unknown')
  state.value = { ...state.value, session: { id: tenant } }
  expect(store.statuses.value).toEqual([])
  expect(store.commands.size).toBe(0)
  expect(store.canWrite.value).toBe(false)
})
it('discards late reads after binding changes and never displays stale availability after failed refresh', async () => {
  const { store, read, state } = setup()
  let resolve!: (v: ReturnType<typeof decodeChannels>) => void
  read.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r
      }),
  )
  const pending = store.refresh()
  await vi.waitFor(() => expect(read).toHaveBeenCalled())
  state.value = { ...state.value, tenant: instance }
  resolve(decodeChannels(snapshot(), tenant, instance))
  await pending
  expect(store.statuses.value).toEqual([])
  state.value = { ...state.value, tenant }
  await store.refresh()
  read.mockRejectedValueOnce(new Error('offline'))
  await store.refresh()
  expect(store.blocked('agent')).toBe('unknown')
  expect(store.failure.value).toBe(true)
})
it('retains unknown intent across refresh and replays only explicitly with the original command', async () => {
  const { store, change } = setup()
  await store.refresh()
  change.mockRejectedValueOnce(networkErrorForTest())
  await expect(store.change('agent', 'paused')).rejects.toThrow()
  const original = change.mock.calls[0]
  await store.refresh()
  expect(change).toHaveBeenCalledTimes(1)
  await expect(store.change('agent', 'allowed')).rejects.toThrow()
  await store.change('agent', 'allowed', true)
  expect(change.mock.calls[1]).toEqual(original)
  expect(store.commands.size).toBe(0)
})
it('does not start a pre-commit refresh while a mutation is in flight', async () => {
  const { store, read, change } = setup()
  await store.refresh()
  let release!: () => void
  const committed = new Promise<void>((resolve) => {
    release = resolve
  })
  change.mockImplementationOnce(async () => {
    await committed
    return { channel: 'agent', revision: 1, admission: 'paused' }
  })
  const writing = store.change('agent', 'paused')
  await store.refresh()
  expect(read).toHaveBeenCalledTimes(1)
  read.mockResolvedValueOnce(
    decodeChannels(
      {
        ...snapshot(),
        channels: snapshot().channels.map((c) =>
          c.channel === 'agent' ? { ...c, admission: 'paused', revision: 1 } : c,
        ),
      },
      tenant,
      instance,
    ),
  )
  release()
  await writing
  expect(store.status('agent')?.admission).toBe('paused')
  expect(read).toHaveBeenCalledTimes(2)
})
it('sends the exact CAS command and rejects a receipt for another action', async () => {
  const request = vi.fn(async (o: RequestOptions<unknown>) =>
    o.decode({ channel: 'agent', revision: 1, admission: 'paused' }),
  )
  const client = createRegistrationChannelsClient({ request } as unknown as HttpTransport, tenant)
  await client.change('agent', principal, 0, 'paused')
  expect(request.mock.calls[0]?.[0]).toMatchObject({
    method: 'PUT',
    pathParams: { channel: 'agent' },
    headers: { 'Idempotency-Key': principal },
    body: { expectedRevision: 0, admission: 'paused' },
  })
  await expect(client.change('agent', principal, 0, 'allowed')).rejects.toThrow(
    'Wrong admission receipt',
  )
})
it('keeps paused, unavailable and established continuation separate', async () => {
  const { store, read } = setup()
  read.mockResolvedValueOnce(
    decodeChannels(
      {
        ...snapshot(),
        channels: snapshot().channels.map((c) =>
          c.channel === 'windows_mdm'
            ? { ...c, admission: 'paused' }
            : c.channel === 'macos_mdm'
              ? { ...c, availability: 'unconfigured', reason: 'not_configured' }
              : c,
        ),
      },
      tenant,
      instance,
    ),
  )
  await store.refresh()
  expect(store.blocked('windows_mdm')).toBe('paused')
  expect(store.blocked('macos_mdm')).toBe('unconfigured')
  const value = {
    source: 'mdm.windows' as const,
    status: 'bound',
    registrationId: principal,
    progress: { firstAuthenticatedCheckIn: false },
  }
  expect(store.canContinue(value)).toBe(false)
  expect(store.canContinue({ ...value, progress: { firstAuthenticatedCheckIn: true } })).toBe(true)
  expect(store.canContinue({ ...value, source: 'mdm.apple' })).toBe(true)
  expect(store.canContinue({ ...value, status: 'expired' })).toBe(false)
})
it('uses a replay receipt to resolve intent without replacing newer current facts', async () => {
  const { store, read, change } = setup()
  await store.refresh()
  change.mockRejectedValueOnce(networkErrorForTest())
  await expect(store.change('agent', 'paused')).rejects.toThrow()
  read.mockResolvedValue(
    decodeChannels(
      { ...snapshot(), channels: snapshot().channels.map((c) => ({ ...c, revision: 2 })) },
      tenant,
      instance,
    ),
  )
  await store.change('agent', 'paused', true)
  expect(store.status('agent')?.revision).toBe(2)
  expect(store.status('agent')?.admission).toBe('allowed')
})
