import { zh } from '../i18n/zh-CN'
import { createRouter, createMemoryHistory } from 'vue-router'
import ComputerListView from '../features/computers/ComputerListView.vue'
import { afterEach, expect, it, vi } from 'vitest'
import { defineComponent, ref, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createSession, identityI18n } from '@rss/auth'
import { decodeIdentityError, type HttpTransport, type RequestOptions } from '@rss/api/identity'
import { decodeMdmError } from '@rss/api/mdm'
import { CapabilityUnavailable, CredentialWriteNotDispatched } from '@rss/device-access/model'
import { daKey, identityKey, type DaRuntime } from '../context'
import { useRevisionReview } from './revision-review'
import { useDirectory } from './directory'
import { createSecurityClient } from '@rss/device-access/client'
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

it('keeps draft separate from accepted pages, commits only successful navigation and fences identity loss', async () => {
  const r = await runtime(),
    load = vi
      .fn()
      .mockResolvedValueOnce({ items: [{ id: 'a' }], summaries: [{ id: 'a' }], nextCursor: 'cDI' })
      .mockResolvedValueOnce({ items: [{ id: 'b' }], summaries: [{ id: 'b' }], nextCursor: null })
  const d = use(r, () => useDirectory<{ id: string }>(['id'], 100, load)).output
  await flushPromises()
  d.draft.filter = "id=='draft'"
  await d.following()
  expect(load.mock.calls[1]?.[0]).toMatchObject({ cursor: 'cDI', limit: 50 })
  expect(load.mock.calls[1]?.[0].filter).toBeUndefined()
  expect(d.data.value?.items).toEqual([{ id: 'b' }])
  expect(d.trail.value).toEqual([undefined])
  load.mockRejectedValueOnce(new Error('offline'))
  await d.previous()
  expect(d.cursor.value).toBe('cDI')
  expect(d.trail.value).toEqual([undefined])
  expect(d.data.value).toBeUndefined()
  load.mockResolvedValueOnce({ items: [], summaries: [], nextCursor: null })
  await d.reload()
  expect(d.cursor.value).toBeUndefined()
  expect(d.trail.value).toEqual([])
  expect(d.data.value?.items).toEqual([])
  r.session.clear()
  expect(d.data.value).toBeUndefined()
  expect(d.next.value).toBeNull()
})
it('rejects repeated cursors without advancing the accepted page', async () => {
  const r = await runtime(),
    load = vi
      .fn()
      .mockResolvedValueOnce({ items: [{ id: 'a' }], summaries: null, nextCursor: 'cDI' })
      .mockResolvedValueOnce({ items: [], summaries: null, nextCursor: 'cDI' })
  const d = use(r, () => useDirectory(['id'], 100, load)).output
  await flushPromises()
  await d.following()
  expect(d.error.value).toBeTruthy()
  expect(d.cursor.value).toBeUndefined()
  expect(d.trail.value).toEqual([])
})
it('unlocks only confirmed synchronous operation completion for the next explicit edit', async () => {
  const r = await runtime(),
    op = use(r, () => useMutation(() => '/assignment/one')).output
  await op.run(async () => {
    throw new Error('lost')
  })
  const id = op.state.value.id
  await op.query(
    async () => ({ state: 'pending' }),
    (v) => v.state === 'completed',
  )
  expect(op.locked.value).toBe(true)
  await op.query(
    async () => ({ state: 'completed' }),
    (v) => v.state === 'completed',
  )
  expect(op.locked.value).toBe(false)
  await op.run(async () => 42)
  expect(op.state.value.id).not.toBe(id)
})
it('integrates cancelled WebAuthn with retryable state, but keeps lost finish results unknown', async () => {
  const r = await runtime(),
    op = use(r, () => useMutation(() => '/security/register')).output
  vi.stubGlobal('PublicKeyCredential', {
    parseCreationOptionsFromJSON: (v: unknown) => v,
    parseRequestOptionsFromJSON: (v: unknown) => v,
  })
  const create = vi
    .fn()
    .mockRejectedValueOnce(new DOMException('cancelled', 'NotAllowedError'))
    .mockResolvedValue({ toJSON: () => ({}) })
  vi.stubGlobal('navigator', { credentials: { create } })
  const calls: string[] = []
  const transport = {
    request: async (o: RequestOptions<unknown>) => {
      calls.push(o.path)
      if (o.path.endsWith('/finish')) throw new Error('lost')
      return o.decode(
        o.path.endsWith('/begin')
          ? { id, options: { publicKey: {} }, expires_at: 4102444800 }
          : { cancelled: true },
      )
    },
  } as HttpTransport
  const client = createSecurityClient(transport, tenant)
  await op.run((_id, signal) => client.register('one', signal))
  expect(op.state.value.state).toBe('idle')
  await op.run((_id, signal) => client.register('two', signal))
  expect(op.state.value.state).toBe('unknown')
  await op.run((_id, signal) => client.register('three', signal))
  expect(calls.filter((p) => p.endsWith('/finish'))).toHaveLength(1)
  vi.unstubAllGlobals()
  expect(uncertain(new DOMException('cancelled', 'AbortError'))).toBe(true)
  for (const reason of ['busy', 'unsupported', 'cancelled', 'precondition'] as const) {
    const e = new CredentialWriteNotDispatched(reason, new Error('SECRET'))
    expect(uncertain(e)).toBe(false)
    expect(errorMessage(e)).not.toContain('SECRET')
  }
  expect(
    needsProof(
      new CredentialWriteNotDispatched(
        'precondition',
        decodeIdentityError(403, { code: 'reauthentication_required' }),
      ),
    ),
  ).toBe(true)
})
it('serializes original-operation queries and fences a cancelled query from a new target', async () => {
  const r = await runtime(),
    key = ref('one'),
    op = use(r, () => useMutation(() => key.value)).output
  await op.run(async () => {
    throw new Error('lost')
  })
  let finish!: (v: { state: string }) => void
  const query = vi.fn(
    () =>
      new Promise<{ state: string }>((resolve) => {
        finish = resolve
      }),
  )
  const first = op.query(query, (v) => v.state === 'completed')
  await op.query(query, (v) => v.state === 'completed')
  expect(query).toHaveBeenCalledTimes(1)
  expect(op.locked.value).toBe(true)
  key.value = 'two'
  let finishWrite!: (v: number) => void
  const write = op.run(
    () =>
      new Promise<number>((resolve) => {
        finishWrite = resolve
      }),
  )
  finish({ state: 'completed' })
  await first
  expect(op.state.value.state).toBe('busy')
  finishWrite(42)
  await write
  expect(op.state.value.state).toBe('idle')
})
it('requires explicit acceptance of a freshly read revision without owning or replacing the draft', async () => {
  const r = await runtime(),
    initial = { id: 'a', revision: 1, name: 'Original' },
    draft = { name: 'My draft' }
  const load = vi.fn().mockResolvedValue({ id: 'a', revision: 2, name: 'Changed by another user' })
  const baseline = use(r, () => useRevisionReview(initial, load)).output
  expect(baseline.accept()).toBe(false)
  await baseline.refresh()
  expect(baseline.revision.value).toBe(1)
  expect(baseline.current.value?.name).toBe('Changed by another user')
  expect(draft.name).toBe('My draft')
  expect(baseline.accept()).toBe(true)
  expect(baseline.revision.value).toBe(2)
  expect(baseline.current.value).toBeUndefined()
})
it('does not adopt absent, failed or stale revision reads', async () => {
  const r = await runtime(),
    initial = { id: 'a', revision: 1 }
  const load = vi
    .fn()
    .mockResolvedValueOnce({ id: 'other', revision: 3 })
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ id: 'other', revision: 4 })
  const baseline = use(r, () => useRevisionReview(initial, load)).output
  await baseline.refresh()
  expect(baseline.error.value).toBeTruthy()
  await baseline.refresh()
  expect(baseline.error.value).toBeTruthy()
  await baseline.refresh()
  expect(baseline.error.value).toBeTruthy()
  expect(baseline.revision.value).toBe(1)
  let finish!: (v: { id: string; revision: number }) => void
  const pending = use(r, () =>
    useRevisionReview(
      initial,
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    ),
  ).output
  const reading = pending.refresh()
  r.session.clear()
  finish({ id: 'a', revision: 4 })
  await reading
  expect(pending.current.value).toBeUndefined()
  expect(pending.busy.value).toBe(false)
})

it('handles invalid directory drafts through the read owner without dispatching or advancing navigation', async () => {
  const r = await runtime(),
    load = vi.fn().mockResolvedValue({ items: [{ id: 'a' }], summaries: null, nextCursor: 'YQ' })
  const d = use(r, () => useDirectory(['id'], 100, load)).output
  await flushPromises()
  const accepted = d.applied.value
  d.draft.sort = 'id,'
  await expect(d.apply()).resolves.toBeUndefined()
  expect(d.error.value).toBeTruthy()
  expect(d.data.value).toBeUndefined()
  expect(load).toHaveBeenCalledTimes(1)
  expect(d.applied.value).toBe(accepted)
  expect(d.trail.value).toEqual([])
  d.draft.sort = ''
  d.draft.filter = "id=='x'),(id=='other'"
  await d.apply()
  expect(d.error.value).toBeTruthy()
  expect(load).toHaveBeenCalledTimes(1)
  d.draft.filter = ''
  await d.apply()
  expect(d.error.value).toBe('')
  expect(load).toHaveBeenCalledTimes(2)
  const failed = use(r, () =>
    useDirectory(['id'], 100, vi.fn().mockRejectedValue(new Error('offline'))),
  ).output
  await flushPromises()
  failed.draft.sort = 'id,'
  await expect(failed.first()).resolves.toBeUndefined()
  expect(failed.error.value).toBeTruthy()
  expect(failed.applied.value).toBeUndefined()
})

it('shows nonempty sparse computer rows with the actual page count and reserves empty state for empty pages', async () => {
  const r = await runtime()
  const computers = vi.fn().mockResolvedValue({ items: [], summaries: [], nextCursor: null })
  r.client = { computers } as unknown as typeof r.client
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: ComputerListView }],
  })
  await router.push('/')
  const i18n = identityI18n()
  i18n.global.mergeLocaleMessage('zh-CN', { da: zh })
  const wrapper = mount(ComputerListView, {
    global: {
      plugins: [router, i18n],
      provide: { [daKey as symbol]: r },
      stubs: {
        'v-btn': { template: '<button><slot/></button>' },
        'v-table': { template: '<table><slot/></table>' },
        'v-navigation-drawer': true,
        'v-chip': true,
      },
    },
  })
  cleanups.push(() => wrapper.unmount())
  await flushPromises()
  computers.mockResolvedValue({
    items: [{ key: 'endpoint:pc' }],
    summaries: null,
    nextCursor: null,
  })
  const q = wrapper.get('.directory-query')
  await q.get('select').setValue(['key'])
  await q
    .findAll('button')
    .find((b) => b.text() === '应用查询')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('endpoint:pc')
  expect(wrapper.text()).toContain('当前页 1 条')
  expect(wrapper.find('.empty').exists()).toBe(false)
  computers.mockResolvedValue({ items: [], summaries: null, nextCursor: null })
  await q
    .findAll('button')
    .find((b) => b.text() === '首页 / 重新查询')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('当前页 0 条')
  expect(wrapper.find('.empty').exists()).toBe(true)
})
