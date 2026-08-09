import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import AppShell from './AppShell.vue'
import zhCN from '../i18n/messages/zh-CN'
import enUS from '../i18n/messages/en-US'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  })
}

function makeI18n() {
  return createI18n({
    legacy: false,
    locale: 'zh-CN',
    fallbackLocale: 'zh-CN',
    messages: { 'zh-CN': zhCN, 'en-US': enUS },
    missingWarn: false,
    fallbackWarn: false,
  })
}

function mountShell() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(AppShell, {
    slots: { default: '<div data-testid="content">slot content</div>' },
    global: { plugins: [makeRouter(), makeI18n(), pinia] },
    attachTo: document.body,
  })
}

describe('AppShell.vue', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('renders the shell container', () => {
    const wrapper = mountShell()
    expect(wrapper.find('.shell').exists()).toBe(true)
  })

  it('renders sidebar', () => {
    const wrapper = mountShell()
    expect(wrapper.find('.sidebar').exists()).toBe(true)
  })

  it('renders topbar', () => {
    const wrapper = mountShell()
    expect(wrapper.find('.topbar').exists()).toBe(true)
  })

  it('renders AI bottom bar', () => {
    const wrapper = mountShell()
    expect(wrapper.find('.ai-bar').exists()).toBe(true)
  })

  it('renders default slot content', () => {
    const wrapper = mountShell()
    expect(wrapper.find('[data-testid="content"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="content"]').text()).toBe('slot content')
  })

  it('sidebar starts expanded', () => {
    const wrapper = mountShell()
    expect(wrapper.find('.sidebar').classes()).not.toContain('sidebar--collapsed')
  })

  describe('sidebar collapse', () => {
    it('collapses sidebar when collapse button clicked', async () => {
      const wrapper = mountShell()
      const collapseBtn = wrapper.find('.sidebar__collapse-btn')
      await collapseBtn.trigger('click')
      expect(wrapper.find('.sidebar').classes()).toContain('sidebar--collapsed')
    })

    it('expands sidebar when collapse button clicked again', async () => {
      const wrapper = mountShell()
      const collapseBtn = wrapper.find('.sidebar__collapse-btn')

      await collapseBtn.trigger('click')
      expect(wrapper.find('.sidebar').classes()).toContain('sidebar--collapsed')

      await collapseBtn.trigger('click')
      expect(wrapper.find('.sidebar').classes()).not.toContain('sidebar--collapsed')
    })
  })

  describe('command palette', () => {
    it('opens command palette when sidebar search button clicked', async () => {
      const wrapper = mountShell()
      const searchBtn = wrapper.find('.sidebar__search')
      await searchBtn.trigger('click')
      // Command palette emitted open event — check via the commandPaletteOpen state
      // Since Teleport puts content in body, check for the dialog role
      const dialog = document.body.querySelector('[role="dialog"]')
      expect(dialog).not.toBeNull()
    })

    it('opens command palette when topbar ⌘K button clicked', async () => {
      const wrapper = mountShell()
      const cmdBtn = wrapper.find('.topbar__cmd')
      await cmdBtn.trigger('click')
      const dialog = document.body.querySelector('[role="dialog"]')
      expect(dialog).not.toBeNull()
    })

    it('sets commandPaletteOpen to false when palette emits close', async () => {
      const wrapper = mountShell()
      // Open first
      const searchBtn = wrapper.find('.sidebar__search')
      await searchBtn.trigger('click')
      await nextTick()

      const overlay = document.body.querySelector('.cmd-overlay') as HTMLElement | null
      expect(overlay).not.toBeNull()

      // Press Esc to close (triggers CommandPalette close() → emits update:open=false)
      overlay!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await nextTick()

      // The CommandPalette component's open prop should now be false
      // We verify this by finding the CommandPalette component instance
      const cpWrapper = wrapper.findComponent({ name: 'CommandPalette' })
      expect(cpWrapper.props('open')).toBe(false)
    })
  })

  it('renders shell__main container', () => {
    const wrapper = mountShell()
    expect(wrapper.find('.shell__main').exists()).toBe(true)
  })

  it('renders shell__content area', () => {
    const wrapper = mountShell()
    expect(wrapper.find('.shell__content').exists()).toBe(true)
  })

  it('main#shell-content has tabindex="-1" for SPA focus management (a11y)', () => {
    const wrapper = mountShell()
    const main = wrapper.find('#shell-content')
    expect(main.exists()).toBe(true)
    expect(main.attributes('tabindex')).toBe('-1')
  })
})
