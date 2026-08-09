/**
 * AppShellLayout.spec.ts — PDP deny notice (aria-live region) behaviour.
 *
 * AppShell (from @gocell/core) is stubbed to a slot passthrough; RouterView is
 * stubbed; useI18n is mocked so `te` reports which deny keys exist.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useUiStore } from '../stores/useUiStore'
import AppShellLayout from './AppShellLayout.vue'

vi.mock('@gocell/core', () => ({
  AppShell: { name: 'AppShell', template: '<div><slot /></div>' },
}))
vi.mock('../composables/useGlobalShortcuts', () => ({ useGlobalShortcuts: vi.fn() }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (k: string) => k,
    // Only the two real deny keys "exist"; anything else falls back.
    te: (k: string) => k === 'access.pdp.deny.role-missing' || k === 'access.pdp.deny.error',
  }),
}))

function mountLayout() {
  return mount(AppShellLayout, { global: { stubs: { RouterView: true } } })
}

describe('AppShellLayout — PDP deny notice', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders no deny notice initially', () => {
    expect(mountLayout().find('[role="alert"]').exists()).toBe(false)
  })

  it('announces a known deny reasonCode via an aria-live assertive alert', async () => {
    const wrapper = mountLayout()
    useUiStore().notifyAccessDenied('role-missing')
    await nextTick()

    const alert = wrapper.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.attributes('aria-live')).toBe('assertive')
    expect(alert.text()).toBe('access.pdp.deny.role-missing')
  })

  it('announces a deny reasonCode that was set before the layout mounted', async () => {
    useUiStore().notifyAccessDenied('role-missing')
    const wrapper = mountLayout()
    await nextTick()

    expect(wrapper.find('[role="alert"]').text()).toBe('access.pdp.deny.role-missing')
  })

  it('falls back to generic deny text for an unknown reasonCode (no raw key leak)', async () => {
    const wrapper = mountLayout()
    useUiStore().notifyAccessDenied('policy-expired')
    await nextTick()

    expect(wrapper.find('[role="alert"]').text()).toBe('access.pdp.deny.error')
  })

  it('auto-dismisses the notice after the timeout', async () => {
    vi.useFakeTimers()
    const wrapper = mountLayout()
    const store = useUiStore()
    store.notifyAccessDenied('role-missing')
    await nextTick()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)

    vi.advanceTimersByTime(6000)
    expect(store.accessDeniedReasonCode).toBeNull()
    await nextTick()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('restarts dismissal for repeated deny notices with the same reasonCode', async () => {
    vi.useFakeTimers()
    const wrapper = mountLayout()
    const store = useUiStore()
    store.notifyAccessDenied('role-missing')
    await nextTick()

    vi.advanceTimersByTime(5000)
    store.notifyAccessDenied('role-missing')
    await nextTick()
    vi.advanceTimersByTime(1000)
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)

    vi.advanceTimersByTime(5000)
    expect(store.accessDeniedReasonCode).toBeNull()
  })

  it('clears the notice when the reasonCode resets to null', async () => {
    const wrapper = mountLayout()
    const store = useUiStore()
    store.notifyAccessDenied('role-missing')
    await nextTick()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)

    store.clearAccessDenied()
    await nextTick()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})
