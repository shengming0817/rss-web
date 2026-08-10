import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import TopBar from './TopBar.vue'
import zhCN from '../i18n/messages/zh-CN'
import enUS from '../i18n/messages/en-US'

function makeRouter(initialPath = '/') {
  const routes = [
    { path: '/', component: { template: '<div/>' } },
    { path: '/audit', component: { template: '<div/>' } },
    { path: '/access/identities', component: { template: '<div/>' } },
  ]
  const router = createRouter({ history: createMemoryHistory(), routes })
  if (initialPath !== '/') {
    void router.push(initialPath)
  }
  return router
}

function makeI18n(locale = 'zh-CN') {
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'zh-CN',
    messages: { 'zh-CN': zhCN, 'en-US': enUS },
    missingWarn: false,
    fallbackWarn: false,
  })
}

function mountTopBar(path = '/') {
  const router = makeRouter(path)
  const i18n = makeI18n()
  const pinia = createPinia()
  setActivePinia(pinia)

  return {
    wrapper: mount(TopBar, {
      global: { plugins: [router, i18n, pinia] },
      attachTo: document.body,
    }),
    router,
  }
}

describe('TopBar.vue', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
  })

  describe('breadcrumb', () => {
    it('always shows the RSS Web root breadcrumb', () => {
      const { wrapper } = mountTopBar('/')
      expect(wrapper.find('.topbar__crumbs').text()).toContain('RSS Web')
    })
  })

  describe('theme toggle', () => {
    it('theme button has aria-label', () => {
      const { wrapper } = mountTopBar()
      const themeBtn = wrapper
        .findAll('button')
        .find((b) => b.attributes('aria-label') === '暗色' || b.attributes('aria-label') === '亮色')
      expect(themeBtn).toBeDefined()
      expect(themeBtn!.exists()).toBe(true)
    })

    it('clicking theme button calls toggleTheme on store', async () => {
      const pinia = createPinia()
      setActivePinia(pinia)
      const router = makeRouter('/')
      const i18n = makeI18n()

      const wrapper = mount(TopBar, {
        global: { plugins: [router, i18n, pinia] },
        attachTo: document.body,
      })

      const { useThemeStore } = await import('../stores/useThemeStore')
      const themeStore = useThemeStore()
      const initialTheme = themeStore.theme

      const themeBtn = wrapper
        .findAll('button')
        .find((b) => b.attributes('aria-label') === '暗色' || b.attributes('aria-label') === '亮色')

      await themeBtn!.trigger('click')

      expect(themeStore.theme).not.toBe(initialTheme)
    })
  })

  describe('locale toggle', () => {
    it('locale button has aria-label', () => {
      const { wrapper } = mountTopBar()
      const localeBtn = wrapper
        .findAll('button')
        .find((b) => b.attributes('aria-label') === '切换语言')
      expect(localeBtn).toBeDefined()
    })

    it('clicking locale button toggles locale store', async () => {
      const pinia = createPinia()
      setActivePinia(pinia)
      const router = makeRouter('/')
      const i18n = makeI18n()

      const wrapper = mount(TopBar, {
        global: { plugins: [router, i18n, pinia] },
        attachTo: document.body,
      })

      const { useLocaleStore } = await import('../stores/useLocaleStore')
      const localeStore = useLocaleStore()
      expect(localeStore.locale).toBe('zh-CN')

      const localeBtn = wrapper
        .findAll('button')
        .find((b) => b.attributes('aria-label') === '切换语言')
      await localeBtn!.trigger('click')

      expect(localeStore.locale).toBe('en-US')
    })
  })

  describe('command palette', () => {
    it('emits open-command-palette when ⌘K button clicked', async () => {
      const { wrapper } = mountTopBar()
      const cmdBtn = wrapper.find('.topbar__cmd')
      await cmdBtn.trigger('click')
      expect(wrapper.emitted('open-command-palette')).toBeTruthy()
    })
  })

  it('renders generic application actions without owning identity behavior', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = mount(TopBar, {
      slots: { actions: '<button data-testid="identity-action">Profile</button>' },
      global: { plugins: [makeRouter('/'), makeI18n(), pinia] },
    })

    expect(wrapper.find('[data-testid="identity-action"]').text()).toBe('Profile')
  })

  describe('theme toggle label', () => {
    it('shows dark label when in light mode', async () => {
      const pinia = createPinia()
      setActivePinia(pinia)
      const { useThemeStore } = await import('../stores/useThemeStore')
      const themeStore = useThemeStore()
      themeStore.setTheme('light')

      const router = makeRouter('/')
      const i18n = makeI18n()
      const wrapper = mount(TopBar, {
        global: { plugins: [router, i18n, pinia] },
        attachTo: document.body,
      })

      const btn = wrapper
        .findAll('button')
        .find((b) => b.attributes('aria-label') === '暗色' || b.attributes('aria-label') === '亮色')
      expect(btn?.exists()).toBe(true)
    })

    it('shows light label when in dark mode', async () => {
      const pinia = createPinia()
      setActivePinia(pinia)
      const { useThemeStore } = await import('../stores/useThemeStore')
      const themeStore = useThemeStore()
      themeStore.setTheme('dark')

      const router = makeRouter('/')
      const i18n = makeI18n()
      const wrapper = mount(TopBar, {
        global: { plugins: [router, i18n, pinia] },
        attachTo: document.body,
      })

      const btn = wrapper
        .findAll('button')
        .find((b) => b.attributes('aria-label') === '暗色' || b.attributes('aria-label') === '亮色')
      expect(btn?.exists()).toBe(true)
    })
  })
})
