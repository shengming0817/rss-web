import { afterEach, it, expect, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/identity'
import { createSecurityClient, challenge } from './security'
const tenant = '11111111-1111-4111-8111-111111111111',
  id = '22222222-2222-4222-8222-222222222222'
const signal = new AbortController().signal
function fixture() {
  const replies: unknown[] = [],
    calls: RequestOptions<unknown>[] = []
  const transport = {
    request: async (o: RequestOptions<unknown>) => {
      calls.push(o)
      const v = replies.shift()
      if (v instanceof Error) throw v
      return o.decode(v)
    },
  } as HttpTransport
  return { replies, calls, client: createSecurityClient(transport, tenant) }
}
function browser() {
  const create = vi
      .fn()
      .mockResolvedValue({ toJSON: () => ({ id: 'registration', type: 'public-key' }) }),
    get = vi.fn().mockResolvedValue({ toJSON: () => ({ id: 'assertion', type: 'public-key' }) })
  vi.stubGlobal('PublicKeyCredential', {
    parseCreationOptionsFromJSON: vi.fn((v) => v),
    parseRequestOptionsFromJSON: vi.fn((v) => v),
  })
  vi.stubGlobal('navigator', { credentials: { create, get } })
  return { create, get }
}
const c = () => ({
  id,
  options: { publicKey: { challenge: 'AQID' } },
  expires_at: Math.floor(Date.now() / 1000) + 100,
})
afterEach(() => vi.unstubAllGlobals())
it('uses browser JSON conversion and current-account server ceremonies', async () => {
  const f = fixture(),
    b = browser()
  f.replies.push([{ id, label: 'key' }], c(), { id, label: 'new' })
  expect(await f.client.list(signal)).toEqual([{ id, label: 'key' }])
  expect(await f.client.register('new', signal)).toEqual({ id, label: 'new' })
  expect(b.create).toHaveBeenCalledWith({
    publicKey: { challenge: 'AQID' },
    signal: expect.any(AbortSignal),
  })
  expect(f.calls[2]?.body).toEqual({ id, response: { id: 'registration', type: 'public-key' } })
  await f.client.cancel()
  expect(f.calls).toHaveLength(3)
})
it('performs purpose-bound step-up once before removing a credential', async () => {
  const f = fixture(),
    b = browser()
  f.replies.push(c(), { expiresAt: 9999999999 }, { removed: true })
  await f.client.remove(id, signal)
  expect(b.get).toHaveBeenCalledTimes(1)
  expect(f.calls[0]?.body).toEqual({ operation: { kind: 'remove', credential: id } })
  expect(f.calls[2]?.pathParams).toEqual({ tenant, credential: id })
})
it('allows a host challenge to finish through the same Identity owner', async () => {
  const f = fixture()
  browser()
  f.replies.push({ expiresAt: 9999999999 }, c(), { expiresAt: 9999999999 })
  await f.client.prove(challenge({ id, options: { publicKey: { challenge: 'AQID' } } }), signal)
  await f.client.reauthenticate(signal)
  expect(f.calls[1]?.body).toEqual({ operation: { kind: 'register' } })
})
it('cancels pre-dispatch browser failures without replaying writes', async () => {
  const f = fixture(),
    b = browser()
  b.create.mockRejectedValueOnce(new DOMException('Cancelled', 'NotAllowedError'))
  f.replies.push(c(), { cancelled: true })
  await expect(f.client.register('key', signal)).rejects.toMatchObject({ reason: 'cancelled' })
  expect(f.calls.map((x) => x.path)).toEqual([
    '/api/v1/identity/tenants/{tenant}/webauthn/register/begin',
    '/api/v1/identity/tenants/{tenant}/webauthn/{ceremony}/cancel',
  ])
  b.get.mockResolvedValueOnce(null)
  f.replies.push({ cancelled: true })
  await expect(f.client.prove(challenge(c()), signal)).rejects.toMatchObject({
    reason: 'cancelled',
  })
})
it('does not retry a finish whose result is unknown', async () => {
  const f = fixture()
  browser()
  f.replies.push(c(), new Error('response lost'))
  await expect(f.client.register('key', signal)).rejects.toThrow('response lost')
  await f.client.cancel()
  expect(f.calls).toHaveLength(2)
})
it('rejects missing browser support and expired or malformed challenges', async () => {
  const f = fixture()
  vi.stubGlobal('PublicKeyCredential', undefined)
  await expect(f.client.register('key', signal)).rejects.toMatchObject({ reason: 'unsupported' })
  expect(f.calls).toHaveLength(0)
  browser()
  f.replies.push({ cancelled: true })
  await expect(f.client.prove({ ...challenge(c()), expiresAt: 1 }, signal)).rejects.toMatchObject({
    reason: 'cancelled',
  })
  expect(() => challenge({ id: 'bad', options: {} })).toThrow()
  expect(() => challenge({ id, options: null })).toThrow()
})
it('serializes ceremonies and rejects missing JSON serialization', async () => {
  const f = fixture(),
    b = browser()
  let finish!: () => void
  b.create.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () => resolve({ toJSON: () => ({}) })
      }),
  )
  f.replies.push(c(), { id, label: 'new' })
  const pending = f.client.register('new', signal)
  await Promise.resolve()
  await Promise.resolve()
  await expect(f.client.register('second', signal)).rejects.toMatchObject({ reason: 'busy' })
  finish()
  await pending
  b.get.mockResolvedValueOnce({})
  f.replies.push({ cancelled: true })
  await expect(f.client.prove(challenge(c()), signal)).rejects.toMatchObject({
    reason: 'unsupported',
  })
})

it('cancels a late begin response before touching the authenticator or finish', async () => {
  const b = browser()
  let resolve!: (v: unknown) => void
  const calls: RequestOptions<unknown>[] = []
  const transport = {
    request: async (o: RequestOptions<unknown>) => {
      calls.push(o)
      return o.decode(
        o.path.endsWith('/begin')
          ? await new Promise((r) => {
              resolve = r
            })
          : { cancelled: true },
      )
    },
  } as HttpTransport
  const client = createSecurityClient(transport, tenant)
  const pending = client.register('key', signal)
  await client.cancel()
  resolve(c())
  await expect(pending).rejects.toMatchObject({ reason: 'cancelled' })
  expect(b.create).not.toHaveBeenCalled()
  expect(calls.map((o) => o.path)).toEqual([
    '/api/v1/identity/tenants/{tenant}/webauthn/register/begin',
    '/api/v1/identity/tenants/{tenant}/webauthn/{ceremony}/cancel',
  ])
})
it('cancels stale external challenges and prevents remove after a cancelled proof', async () => {
  const f = fixture(),
    b = browser(),
    abort = new AbortController()
  abort.abort()
  f.replies.push({ cancelled: true })
  await expect(f.client.prove(challenge(c()), abort.signal)).rejects.toMatchObject({
    reason: 'cancelled',
  })
  expect(b.get).not.toHaveBeenCalled()
  let resolve!: (v: unknown) => void
  b.get.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r
      }),
  )
  f.replies.push(c(), { cancelled: true })
  const remove = f.client.remove(id, signal)
  await Promise.resolve()
  await Promise.resolve()
  await f.client.cancel()
  resolve({ toJSON: () => ({}) })
  await expect(remove).rejects.toMatchObject({ reason: 'cancelled' })
  expect(f.calls.some((o) => o.path.endsWith('/remove'))).toBe(false)
})
