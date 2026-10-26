import { afterEach, expect, it, vi } from 'vitest'
import { defineComponent, ref, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createSession } from '@rss/auth'
import { decodeIdentityError, type HttpTransport, type RequestOptions } from '@rss/api/identity'
import { decodeMdmError } from '@rss/api/mdm'
import { CapabilityUnavailable } from '@rss/device-access/model'
import { daKey, identityKey, type DaRuntime } from '../context'
import { useRead } from './read'
import { useMutation } from './mutation'
import { errorMessage, uncertain, needsProof, utc, label } from './status'
import { decodeHost } from '../config'
const tenant = '11111111-1111-4111-8111-111111111111',
  id = '22222222-2222-4222-8222-222222222222'
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((f) => f())
  vi.restoreAllMocks()
})
async function runtime() {
  const transport = {
    request: async (o: RequestOptions<unknown>) =>
      o.decode(
        o.path.endsWith('/context')
          ? {
              tenantId: tenant,
              principalId: id,
              sessionId: id,
              navigation: { manageAccounts: false, manageProviders: false },
            }
          : {
              session: {
                id,
                issuedAt: 1,
                idleExpiresAt: 4102444800,
                absoluteExpiresAt: 4102444900,
              },
              identity: { principalId: id, hasLocalPassword: true },
              csrfToken: 'a'.repeat(64),
            },
      ),
  } as HttpTransport
  const session = createSession(transport, {
    canonicalOrigin: 'https://example.test',
    oidcEnabled: false,
  })
  await session.login(tenant, 'user', 'secret')
  cleanups.push(() => session.clear())
  return { session, writes: new Map() } as unknown as DaRuntime
}
function use<T>(r: DaRuntime, fn: () => T) {
  let output!: T
  const wrapper = mount(
    defineComponent({
      setup() {
        output = fn()
        return () => null
      },
    }),
    { global: { provide: { [daKey as symbol]: r } } },
  )
  cleanups.push(() => wrapper.unmount())
  return { output, wrapper }
}
it('fences reads across device changes, identity loss and unmount', async () => {
  const r = await runtime(),
    device = ref('one'),
    completions: ((s: string) => void)[] = [],
    signals: AbortSignal[] = []
  const load = vi.fn((signal: AbortSignal) => {
    signals.push(signal)
    return new Promise<string>((resolve) => completions.push(resolve))
  })
  const { output, wrapper } = use(r, () => useRead(load, () => device.value))
  expect(output.busy.value).toBe(true)
  device.value = 'two'
  await nextTick()
  expect(signals[0]?.aborted).toBe(true)
  completions[1]?.('second')
  await flushPromises()
  completions[0]?.('first')
  await flushPromises()
  expect(output.data.value).toBe('second')
  r.session.clear()
  await nextTick()
  expect(output.data.value).toBeUndefined()
  expect(identityKey(r.session)).toBeNull()
  wrapper.unmount()
})
it('clears a failed reload instead of displaying stale authorized data', async () => {
  const r = await runtime(),
    load = vi
      .fn()
      .mockResolvedValueOnce('first')
      .mockRejectedValueOnce(decodeMdmError(403, { code: 'permission_denied' }))
  const { output } = use(r, () => useRead(load))
  await flushPromises()
  expect(output.data.value).toBe('first')
  await output.reload()
  expect(output.data.value).toBeUndefined()
  expect(output.error.value).toContain('权限')
})
it('retains only the original locator and locks uncertain writes across remount', async () => {
  const r = await runtime(),
    request = vi.fn().mockRejectedValue(new Error('lost'))
  const first = use(r, () => useMutation(() => '/device/one'))
  await first.output.run(request)
  expect(first.output.state.value.state).toBe('unknown')
  const original = first.output.state.value.id
  first.wrapper.unmount()
  const second = use(r, () => useMutation(() => '/device/one')).output
  expect(second.state.value.id).toBe(original)
  await second.run(request)
  expect(request).toHaveBeenCalledTimes(1)
  await second.query(async () => null)
  expect(second.state.value.state).toBe('unknown')
  await second.query(async (id) => ({ id }))
  expect(second.state.value.state).toBe('accepted')
  expect(Object.keys(second.state.value).sort()).toEqual(['id', 'message', 'proof', 'state'])
})
it('keeps known reauthentication rejection distinct and reuses the explicit original request identity', async () => {
  const r = await runtime(),
    op = use(r, () => useMutation(() => '/app')).output
  await op.run(async () => {
    throw decodeIdentityError(403, { code: 'reauthentication_required' })
  })
  const id = op.state.value.id
  expect(op.state.value.proof).toBe(true)
  const dispatched = vi.fn(async (_id: string, _signal: AbortSignal) => 42)
  expect(await op.run(dispatched)).toBe(42)
  expect(dispatched.mock.calls[0]?.[0]).toBe(id)
  expect(op.state.value.state).toBe('idle')
})
it('does not let late mutation responses settle a newly selected object', async () => {
  const r = await runtime(),
    key = ref('a')
  const op = use(r, () => useMutation(() => key.value)).output
  let finish!: (v: number) => void
  const pending = op.run(() => new Promise<number>((resolve) => (finish = resolve)))
  key.value = 'b'
  await nextTick()
  finish(1)
  expect(await pending).toBeUndefined()
  expect(op.state.value.state).toBe('idle')
})
it('validates host config and gives closed, non-secret error messages', () => {
  const valid = { canonicalOrigin: 'https://app.test', tenant, managementTenant: id, serviceId: id }
  expect(decodeHost(valid, 'https://app.test').tenant).toBe(tenant)
  for (const value of [
    null,
    [],
    { ...valid, tenant: id },
    { ...valid, canonicalOrigin: 'https://other.test' },
    { ...valid, serviceId: 'bad' },
    { ...valid, extra: true },
  ])
    expect(() => decodeHost(value, 'https://app.test')).toThrow()
  expect(() =>
    decodeHost({ ...valid, canonicalOrigin: 'http://app.test' }, 'http://app.test'),
  ).toThrow()
  expect(errorMessage(new CapabilityUnavailable('passkeys'))).toContain('尚未接入')
  expect(errorMessage(new Error('SECRET'))).not.toContain('SECRET')
  expect(utc(null)).toBe('未观察')
  expect(utc(1)).toContain('UTC')
  expect(label(null)).toBe('未观察')
  expect(label('present')).not.toBe('present')
  expect(label('custom')).toBe('custom')
  for (const status of [400, 401, 403, 404, 409, 503]) {
    const code = (
      {
        400: 'malformed_request',
        401: 'invalid_identity',
        403: 'permission_denied',
        404: 'inventory_not_found',
        409: 'operation_conflict',
        503: 'service_unavailable',
      } as Record<number, string>
    )[status]!
    const e = decodeMdmError(status, { code })
    expect(errorMessage(e)).toBeTruthy()
    expect(uncertain(e)).toBe(status >= 500)
  }
  expect(needsProof(decodeIdentityError(403, { code: 'reauthentication_required' }))).toBe(true)
  expect(errorMessage(new DOMException('SECRET', 'NotAllowedError'))).toContain('取消')
})
