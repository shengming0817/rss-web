import { expect, it, vi } from 'vitest'
import { createMaterialAuthorization, type OperationAuthorizationPort } from '@rss/auth-core'
import { createCeremonyHandoff } from './ceremony-handoff'
const context = {
    purpose: 'mdm.device_access.disclose' as const,
    device: 'device',
    material: '11111111-1111-4111-8111-111111111111',
    version: 1,
    operationId: '22222222-2222-4222-8222-222222222222',
  },
  challenge = { id: '33333333-3333-4333-8333-333333333333', publicKey: { challenge: 'public' } }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => {
    resolve = yes
  })
  return { resolve, promise }
}
function fixture(overrides: Partial<OperationAuthorizationPort> = {}) {
  const port: OperationAuthorizationPort = {
      finish: vi.fn(async () => 1900000000),
      cancelCeremony: vi.fn(async () => {}),
      cancelAuthorization: vi.fn(async () => {}),
      classify: () => 'unknown',
      ...overrides,
    },
    material = createMaterialAuthorization(port, () => 'tenant/principal/session'),
    cancelPasskey = vi.fn(async () => {})
  return { port, material, cancelPasskey, handoff: createCeremonyHandoff(material, cancelPasskey) }
}
it('waits for the whole passkey ceremony before clearing its proof and beginning material authorization', async () => {
  const f = fixture(),
    finish = deferred<void>(),
    entered = deferred<void>(),
    begin = vi.fn(async () => challenge)
  const old = f.handoff.runPasskeyCeremony(async () => {
    entered.resolve()
    await finish.promise
  })
  await entered.promise
  const next = f.handoff.authorizeMaterial(context, begin, async () => ({}))
  expect(begin).not.toHaveBeenCalled()
  expect(f.cancelPasskey).not.toHaveBeenCalled()
  finish.resolve()
  await old
  await next
  expect(f.cancelPasskey).toHaveBeenCalledOnce()
  expect(begin).toHaveBeenCalledOnce()
  expect(f.cancelPasskey.mock.invocationCallOrder[0]!).toBeLessThan(
    begin.mock.invocationCallOrder[0]!,
  )
})
it('waits for an already-sent material finish and its cancellation before starting passkey work', async () => {
  const finish = deferred<number>(),
    entered = deferred<void>(),
    f = fixture({
      finish: vi.fn(() => {
        entered.resolve()
        return finish.promise
      }),
    })
  const old = f.handoff
    .authorizeMaterial(
      context,
      async () => challenge,
      async () => ({}),
    )
    .catch((error) => error)
  await entered.promise
  const beginPasskey = vi.fn(async () => {}),
    next = f.handoff.runPasskeyCeremony(beginPasskey)
  expect(beginPasskey).not.toHaveBeenCalled()
  expect(f.port.cancelAuthorization).not.toHaveBeenCalled()
  finish.resolve(1900000000)
  await old
  await next
  expect(f.port.cancelAuthorization).toHaveBeenCalledOnce()
  expect(vi.mocked(f.port.cancelAuthorization).mock.invocationCallOrder[0]!).toBeLessThan(
    beginPasskey.mock.invocationCallOrder[0]!,
  )
})
it('does not overwrite a current material authorization or clear its cookie when another begin is requested', async () => {
  const f = fixture(),
    begin = vi.fn(async () => challenge)
  await f.handoff.authorizeMaterial(context, begin, async () => ({}))
  await expect(
    f.handoff.authorizeMaterial({ ...context, version: 2 }, begin, async () => ({})),
  ).rejects.toThrow('Cancel')
  expect(f.cancelPasskey).toHaveBeenCalledOnce()
  expect(begin).toHaveBeenCalledOnce()
})
