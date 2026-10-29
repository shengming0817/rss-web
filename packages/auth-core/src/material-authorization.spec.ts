import { expect, it, vi } from 'vitest'
import {
  createMaterialAuthorization,
  type MaterialDisclosureContext,
  type OperationAuthorizationPort,
} from './material-authorization'
const operationId = '11111111-1111-4111-8111-111111111111',
  material = '22222222-2222-4222-8222-222222222222',
  ceremony = '33333333-3333-4333-8333-333333333333'
const context = (): MaterialDisclosureContext => ({
  purpose: 'mdm.device_access.disclose',
  device: 'device-a',
  material,
  version: 2,
  operationId,
})
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function fixture(overrides: Partial<OperationAuthorizationPort> = {}) {
  let bound: string | null = 'tenant/principal/session',
    time = 1700000000000
  const port: OperationAuthorizationPort = {
      finish: vi.fn(async () => 1700000060),
      cancelCeremony: vi.fn(async () => {}),
      cancelAuthorization: vi.fn(async () => {}),
      classify: vi.fn(() => 'unknown' as const),
      ...overrides,
    },
    controller = createMaterialAuthorization(
      port,
      () => bound,
      () => time,
    ),
    begin = vi.fn(async () => ({ id: ceremony, publicKey: { challenge: 'public challenge' } })),
    authenticate = vi.fn(async () => ({ id: 'credential', response: 'authenticator response' }))
  return {
    port,
    controller,
    begin,
    authenticate,
    setScope: (value: string | null) => {
      bound = value
    },
    setTime: (value: number) => {
      time = value
    },
  }
}
it('accepts the formal untimed material challenge and uses only Identity finish expiry', async () => {
  const f = fixture(),
    listener = vi.fn(),
    off = f.controller.subscribe(listener)
  await f.controller.authorize(context(), f.begin, f.authenticate)
  expect(f.controller.getSnapshot()).toEqual({
    status: 'authorized',
    context: context(),
    expiresAt: 1700000060,
  })
  expect(f.port.finish).toHaveBeenCalledWith(ceremony, {
    id: 'credential',
    response: 'authenticator response',
  })
  expect(f.authenticate).toHaveBeenCalledWith(
    { challenge: 'public challenge' },
    expect.any(AbortSignal),
  )
  expect(f.controller.getSnapshot()).not.toHaveProperty('proof')
  expect(listener).toHaveBeenCalled()
  off()
})
it('does not disclose or consume automatically after authorization and rejects a different exact operation', async () => {
  const f = fixture()
  await f.controller.authorize(context(), f.begin, f.authenticate)
  for (const wrong of [
    { ...context(), device: 'device-b' },
    { ...context(), material: operationId },
    { ...context(), version: 3 },
    { ...context(), operationId: material },
  ])
    expect(() => f.controller.consume(wrong)).toThrow('exact')
  expect(f.controller.getSnapshot().status).toBe('authorized')
  f.controller.consume(context())
  expect(f.controller.getSnapshot().status).toBe('consumed')
  expect(() => f.controller.consume(context())).toThrow('exact')
  await expect(f.controller.authorize(context(), f.begin, f.authenticate)).rejects.toThrow('Cancel')
})
it('refuses unsupported purposes and does not retain extra caller fields', async () => {
  const f = fixture()
  await expect(
    f.controller.authorize(
      {
        ...context(),
        purpose: 'identity.passkey.register',
      } as unknown as MaterialDisclosureContext,
      f.begin,
      f.authenticate,
    ),
  ).rejects.toThrow('context')
  expect(f.begin).not.toHaveBeenCalled()
  await f.controller.authorize(
    { ...context(), secret: 'must not be retained' } as MaterialDisclosureContext,
    f.begin,
    f.authenticate,
  )
  expect(f.controller.getSnapshot().context).not.toHaveProperty('secret')
})
it('expires the completed grant without inventing a challenge TTL', async () => {
  const f = fixture()
  await f.controller.authorize(context(), f.begin, f.authenticate)
  f.setTime(1700000060000)
  expect(() => f.controller.consume(context())).toThrow('expired')
  expect(f.controller.getSnapshot().status).toBe('expired')
  expect(f.port.cancelAuthorization).not.toHaveBeenCalled()
})
it('rejects an already expired finish result and never makes it consumable', async () => {
  const f = fixture({ finish: vi.fn(async () => 1699999999) })
  await f.controller.authorize(context(), f.begin, f.authenticate)
  expect(f.controller.getSnapshot().status).toBe('expired')
  expect(() => f.controller.consume(context())).toThrow('exact')
})
it('preserves unknown finish outcome and requires explicit cleanup before another authorization', async () => {
  const unknown = new Error('connection lost'),
    f = fixture({
      finish: vi.fn(async () => {
        throw unknown
      }),
    })
  await expect(f.controller.authorize(context(), f.begin, f.authenticate)).rejects.toBe(unknown)
  expect(f.controller.getSnapshot().status).toBe('unknown')
  expect(f.port.finish).toHaveBeenCalledTimes(1)
  expect(f.port.cancelAuthorization).not.toHaveBeenCalled()
  await expect(f.controller.authorize(context(), f.begin, f.authenticate)).rejects.toThrow('Cancel')
  await f.controller.cancel()
  expect(f.controller.getSnapshot().status).toBe('cancelled')
  expect(f.port.cancelAuthorization).toHaveBeenCalledOnce()
})
it('distinguishes a denied finish from an unknown commit and never consumes either', async () => {
  const f = fixture({
    finish: vi.fn(async () => {
      throw new Error('denied')
    }),
    classify: () => 'denied',
  })
  await expect(f.controller.authorize(context(), f.begin, f.authenticate)).rejects.toThrow('denied')
  expect(f.controller.getSnapshot().status).toBe('denied')
  expect(() => f.controller.consume(context())).toThrow('exact')
})
it('cancels an owned prompt and clears the actual operation authorization', async () => {
  const f = fixture({ classify: () => 'cancelled' }),
    prompt = deferred<unknown>()
  const running = f.controller.authorize(context(), f.begin, async (_options, signal) => {
    signal.addEventListener('abort', () => prompt.reject(new Error('aborted')), { once: true })
    return prompt.promise
  })
  const outcome = running.catch((error) => error)
  await Promise.resolve()
  await Promise.resolve()
  await f.controller.cancel()
  expect(await outcome).toBeInstanceOf(Error)
  expect(f.port.cancelCeremony).toHaveBeenCalledWith(ceremony)
  expect(f.port.cancelAuthorization).toHaveBeenCalledOnce()
  expect(f.port.finish).not.toHaveBeenCalled()
})
it('waits for a sent finish before cancelling so a late cookie cannot revive authorization', async () => {
  const finish = deferred<number>(),
    entered = deferred<void>(),
    f = fixture({
      finish: vi.fn(() => {
        entered.resolve()
        return finish.promise
      }),
    })
  const running = f.controller.authorize(context(), f.begin, f.authenticate).catch((error) => error)
  await entered.promise
  const cancelled = f.controller.cancel()
  expect(f.controller.getSnapshot().status).toBe('cancelling')
  expect(f.port.cancelAuthorization).not.toHaveBeenCalled()
  finish.resolve(1700000060)
  await running
  await cancelled
  expect(f.port.cancelAuthorization).toHaveBeenCalledOnce()
  expect(f.controller.getSnapshot().status).toBe('cancelled')
  expect(() => f.controller.consume(context())).toThrow('exact')
})
it('cancels a late challenge by its original ID without clearing a newer authorization', async () => {
  const challenge = deferred<{ id: string; publicKey: Record<string, unknown> }>(),
    f = fixture()
  const running = f.controller
    .authorize(context(), () => challenge.promise, f.authenticate)
    .catch((error) => error)
  await f.controller.cancel()
  expect(f.port.cancelAuthorization).toHaveBeenCalledOnce()
  challenge.resolve({ id: ceremony, publicKey: { challenge: 'public' } })
  await running
  expect(f.port.cancelCeremony).toHaveBeenCalledWith(ceremony)
  expect(f.port.cancelAuthorization).toHaveBeenCalledOnce()
  expect(f.authenticate).not.toHaveBeenCalled()
})
it('retains cancellation failure until an explicit retry succeeds', async () => {
  const f = fixture({
    cancelAuthorization: vi
      .fn()
      .mockRejectedValueOnce(new Error('unconfirmed'))
      .mockResolvedValue(undefined),
  })
  await f.controller.authorize(context(), f.begin, f.authenticate)
  await expect(f.controller.cancel()).rejects.toThrow('unconfirmed')
  expect(f.controller.getSnapshot().status).toBe('cancellation_unconfirmed')
  await expect(f.controller.authorize(context(), f.begin, f.authenticate)).rejects.toThrow('Cancel')
  await f.controller.cancel()
  expect(f.controller.getSnapshot().status).toBe('cancelled')
})
it('fences changed sessions and does not cancel a new principal operation cookie', async () => {
  const f = fixture()
  await f.controller.authorize(context(), f.begin, f.authenticate)
  f.setScope('tenant/other-principal/new-session')
  expect(() => f.controller.consume(context())).toThrow('exact')
  await f.controller.cancel()
  expect(f.port.cancelAuthorization).not.toHaveBeenCalled()
  await f.controller.authorize(context(), f.begin, f.authenticate)
  expect(f.controller.getSnapshot().status).toBe('authorized')
})
