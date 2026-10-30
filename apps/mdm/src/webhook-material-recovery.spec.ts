import { expect, it, vi } from 'vitest'
import type { SessionOwner } from '@rss/auth-core'
import {
  createWebhookMaterialRecovery,
  type MaterialRecoveryState,
} from './webhook-material-recovery'
const original: MaterialRecoveryState = {
  outcome: 'unknown',
  pending: {
    kind: 'prepare',
    operationId: '33333333-3333-4333-8333-333333333333',
    fingerprint: null,
    input: {
      reference: 'signing',
      expectedRevision: 4,
      configurationSha256: 'a'.repeat(64),
      endpoint: 'https://receiver.example/confirm',
      networkReference: 'network',
      source: 'generate',
    },
  },
}
function fixture() {
  const state = {
      current: {
        status: 'authenticated',
        tenant: 'tenant',
        identity: { principalId: 'principal' },
        session: { id: 'old' },
      },
    },
    listeners = new Set<() => void>()
  let finish!: () => void
  const gate = new Promise<void>((resolve) => {
      finish = resolve
    }),
    owner = {
      getSnapshot: () => state.current,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      reauthenticate: vi.fn(async (_password: string) => {
        state.current = { ...state.current, session: { id: 'new' } }
        for (const listener of listeners) listener()
        await gate
      }),
    },
    recovery = createWebhookMaterialRecovery(owner as unknown as SessionOwner)
  return { state, listeners, owner, finish, recovery }
}
it('transfers only public original intent after successful explicit session rotation and does not consume for an abandoned React effect', async () => {
  const f = fixture(),
    authentication = f.recovery.reauthenticate('request-local-password', original)
  expect(f.recovery.available('tenant/principal/old')).toBe(false)
  expect(f.recovery.available('tenant/principal/new')).toBe(true)
  const abandoned = vi.fn(() => false),
    accept = vi.fn(() => true),
    first = f.recovery.take('tenant/principal/new', abandoned),
    next = f.recovery.take('tenant/principal/new', accept)
  expect(accept).not.toHaveBeenCalled()
  f.finish()
  await authentication
  expect(await first).toBe(false)
  expect(await next).toBe(true)
  expect(accept).toHaveBeenCalledExactlyOnceWith(original)
  expect(JSON.stringify(accept.mock.calls)).not.toContain('request-local-password')
  expect(f.recovery.available('tenant/principal/new')).toBe(false)
  expect(await f.recovery.take('tenant/principal/new', accept)).toBe(false)
  expect(f.owner.reauthenticate).toHaveBeenCalledTimes(1)
})
it('discards the handoff when principal changes before reauthentication completion', async () => {
  const f = fixture(),
    authentication = f.recovery.reauthenticate('request-local-password', original)
  f.state.current = { ...f.state.current, identity: { principalId: 'other' } }
  for (const listener of f.listeners) listener()
  expect(f.recovery.available('tenant/other/new')).toBe(false)
  f.finish()
  await expect(authentication).rejects.toMatchObject({ code: 'session_changed' })
  expect(await f.recovery.take('tenant/principal/new', () => true)).toBe(false)
})
it('drops an unsuccessful authentication handoff rather than treating it as an original write acknowledgement', async () => {
  const f = fixture()
  f.owner.reauthenticate.mockRejectedValue({ code: 'invalid_credentials', status: 401 })
  await expect(f.recovery.reauthenticate('request-local-password', original)).rejects.toMatchObject(
    { status: 401 },
  )
  expect(f.recovery.available('tenant/principal/new')).toBe(false)
})
