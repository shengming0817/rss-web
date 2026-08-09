import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import AppShellLayout from './AppShellLayout.vue'

vi.mock('@gocell/core', () => ({
  AppShell: { name: 'AppShell', template: '<div data-testid="shell"><slot /></div>' },
}))
vi.mock('../composables/useGlobalShortcuts', () => ({ useGlobalShortcuts: vi.fn() }))

describe('AppShellLayout', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders the shell and current route outlet', () => {
    const wrapper = mount(AppShellLayout, { global: { stubs: { RouterView: true } } })
    expect(wrapper.find('[data-testid="shell"]').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'RouterView' }).exists()).toBe(true)
  })
})
