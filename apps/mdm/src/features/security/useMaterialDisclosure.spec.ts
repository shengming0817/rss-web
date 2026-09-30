import { afterEach, expect, it, vi } from 'vitest'
import { defineComponent, h, shallowRef } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mdmKey } from '../../context'
import { useMaterialDisclosure } from './useMaterialDisclosure'
const tenant = '11111111-1111-4111-8111-111111111111',
  principal = '22222222-2222-4222-8222-222222222222',
  sessionId = '33333333-3333-4333-8333-333333333333',
  target = {
    kind: 'material_access' as const,
    device: 'device-01',
    material: 'bitlocker' as const,
    materialRevision: 1,
    volume: 'os',
    action: 'reveal' as const,
  },
  grant = { id: tenant, revision: 2 }
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})
async function setup() {
  const now = Date.now(),
    session = shallowRef({
      status: 'authenticated',
      tenant,
      identity: { principalId: principal },
      session: { id: sessionId },
    }),
    reveal = vi.fn(async () => ({
      disclosureId: tenant,
      issuedAt: Math.floor(now / 1000),
      expiresAt: Math.floor(now / 1000) + 30,
      secret: 'SYNTHETIC local value',
    }))
  let state!: ReturnType<typeof useMaterialDisclosure>
  const component = defineComponent({
      setup() {
        state = useMaterialDisclosure()
        return () => h('p', state.secret.value ?? '')
      },
    }),
    router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component }] })
  await router.push('/')
  const wrapper = mount(component, {
    global: {
      plugins: [router],
      provide: {
        [mdmKey as symbol]: {
          tenant,
          session: { state: session },
          security: { materials: { reveal } },
        },
      },
    },
  })
  return { state, wrapper, session, router, reveal }
}
it('removes the value before another reveal, on hide and at the earlier server or local lifetime', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  const f = await setup()
  await f.state.reveal(target, grant)
  await flushPromises()
  expect(f.wrapper.text()).toContain('SYNTHETIC')
  await vi.advanceTimersByTimeAsync(30_000)
  expect(f.state.secret.value).toBeNull()
  f.reveal.mockResolvedValueOnce({
    disclosureId: tenant,
    issuedAt: Date.now() / 1000,
    expiresAt: Date.now() / 1000 + 5,
    secret: 'SYNTHETIC shorter TTL',
  })
  await f.state.reveal(target, grant)
  await vi.advanceTimersByTimeAsync(5_000)
  expect(f.state.secret.value).toBeNull()
  f.reveal.mockResolvedValueOnce({
    disclosureId: tenant,
    issuedAt: Date.now() / 1000,
    expiresAt: Date.now() / 1000 + 30,
    secret: 'SYNTHETIC again',
  })
  await f.state.reveal(target, grant)
  f.reveal.mockRejectedValueOnce(new Error('sensitive raw error must not render'))
  const next = f.state.reveal(target, grant)
  expect(f.state.secret.value).toBeNull()
  await next
  expect(f.state.failure.value).toBe('disclosureUnknown')
  expect(f.wrapper.text()).not.toContain('sensitive raw error')
  f.state.clear()
  expect(f.state.failure.value).toBeNull()
  f.wrapper.unmount()
})
it('clears on session, route, pagehide and unmount and fences late responses even when the same context returns', async () => {
  const f = await setup(),
    original = f.session.value
  await f.state.reveal(target, grant)
  f.session.value = { ...original, session: { id: tenant } }
  expect(f.state.secret.value).toBeNull()
  let finish!: (value: Awaited<ReturnType<typeof f.reveal>>) => void
  f.reveal.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
  const pending = f.state.reveal(target, grant)
  f.session.value = { ...original, status: 'anonymous' }
  f.session.value = original
  finish({
    disclosureId: tenant,
    issuedAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + 30,
    secret: 'SYNTHETIC late secret',
  })
  await pending
  expect(f.state.secret.value).toBeNull()
  await f.state.reveal(target, grant)
  await f.router.push('/?device=device-02')
  expect(f.state.secret.value).toBeNull()
  await f.state.reveal(target, grant)
  window.dispatchEvent(new Event('pagehide'))
  expect(f.state.secret.value).toBeNull()
  await f.state.reveal(target, grant)
  f.wrapper.unmount()
  expect(f.state.secret.value).toBeNull()
  expect(f.reveal.mock.calls.every((args) => !JSON.stringify(args).includes('SYNTHETIC'))).toBe(
    true,
  )
})
it('does not extend the local display lifetime if the wall clock moves backwards during the request', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  const f = await setup(),
    issuedAt = Date.now() / 1000
  let finish!: (value: Awaited<ReturnType<typeof f.reveal>>) => void
  f.reveal.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
  const pending = f.state.reveal(target, grant)
  vi.setSystemTime(Date.now() - 600_000)
  finish({
    disclosureId: tenant,
    issuedAt,
    expiresAt: issuedAt + 30,
    secret: 'SYNTHETIC bounded value',
  })
  await pending
  expect(f.state.secret.value).not.toBeNull()
  await vi.advanceTimersByTimeAsync(30_000)
  expect(f.state.secret.value).toBeNull()
  f.wrapper.unmount()
})

it('clears hidden disclosure from state and DOM, rejects hidden starts and fences responses after visibility returns', async () => {
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible'),
    f = await setup()
  try {
    await f.state.reveal(target, grant)
    expect(f.wrapper.text()).toContain('SYNTHETIC')
    visibility.mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(f.state.secret.value).toBeNull()
    expect(f.state.expiresAt.value).toBeNull()
    await flushPromises()
    expect(f.wrapper.text()).toBe('')
    expect(await f.state.reveal(target, grant)).toBe(false)
    expect(f.reveal).toHaveBeenCalledTimes(1)
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    let finish!: (value: Awaited<ReturnType<typeof f.reveal>>) => void
    f.reveal.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    const pending = f.state.reveal(target, grant)
    visibility.mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(f.state.busy.value).toBe(false)
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    finish({
      disclosureId: tenant,
      issuedAt: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + 30,
      secret: 'SYNTHETIC late',
    })
    expect(await pending).toBe(false)
    expect(f.state.secret.value).toBeNull()
    await flushPromises()
    expect(f.wrapper.text()).toBe('')
    // A completion must check visibility even if its event has not yet been delivered.
    f.reveal.mockImplementationOnce(async () => {
      visibility.mockReturnValue('hidden')
      return {
        disclosureId: tenant,
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 30,
        secret: 'SYNTHETIC hidden completion',
      }
    })
    expect(await f.state.reveal(target, grant)).toBe(false)
    expect(f.state.secret.value).toBeNull()
  } finally {
    f.wrapper.unmount()
  }
})
