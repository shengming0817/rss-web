import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { RSS_SOURCE } from '@rss/shared'
import AppShellLayout from './AppShellLayout.vue'
import { createWebI18n } from '../i18n'

vi.mock('@rss/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@rss/core')>()),
  AppShell: {
    name: 'AppShell',
    props: ['navigationItems'],
    template:
      '<div data-testid="shell" :data-navigation-count="navigationItems.length"><slot /></div>',
  },
}))
vi.mock('../composables/useGlobalShortcuts', () => ({ useGlobalShortcuts: vi.fn() }))

describe('AppShellLayout', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders the shell and current route outlet', () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/',
          name: 'home',
          component: { template: '<div />' },
          meta: {
            sessionAccess: 'authenticated',
            focusTarget: 'shell-content',
            navigation: { labelKey: 'navigation.home', order: 0, source: RSS_SOURCE },
          },
        },
      ],
    })
    const wrapper = mount(AppShellLayout, {
      global: { plugins: [router, createWebI18n()], stubs: { RouterView: true } },
    })
    expect(wrapper.find('[data-testid="shell"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="shell"]').attributes('data-navigation-count')).toBe('1')
    expect(wrapper.findComponent({ name: 'RouterView' }).exists()).toBe(true)
  })
})
