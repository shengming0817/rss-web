import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createI18n } from 'vue-i18n'
import { createPinia } from 'pinia'
import Sidebar from './Sidebar.vue'
import { NAV_GROUPS } from './navConfig'
import zhCN from '../i18n/messages/zh-CN'
import enUS from '../i18n/messages/en-US'

function makeRouter(initialPath = '/') {
  // Create a router with a route for every nav item (so RouterLink resolves)
  const routes = [
    { path: '/', component: { template: '<div/>' } },
    { path: '/coverage', component: { template: '<div/>' } },
    { path: '/access/identities', component: { template: '<div/>' } },
    { path: '/access/policies', component: { template: '<div/>' } },
    { path: '/access/decisions', component: { template: '<div/>' } },
    { path: '/access/reviews', component: { template: '<div/>' } },
    { path: '/audit', component: { template: '<div/>' } },
    { path: '/config', component: { template: '<div/>' } },
    { path: '/flags', component: { template: '<div/>' } },
    { path: '/cells', component: { template: '<div/>' } },
    { path: '/groups', component: { template: '<div/>' } },
    { path: '/deps', component: { template: '<div/>' } },
    { path: '/contracts', component: { template: '<div/>' } },
    { path: '/observe', component: { template: '<div/>' } },
    { path: '/billing', component: { template: '<div/>' } },
    { path: '/secrets', component: { template: '<div/>' } },
    { path: '/workflow', component: { template: '<div/>' } },
    { path: '/ai', component: { template: '<div/>' } },
  ]
  const router = createRouter({ history: createMemoryHistory(), routes })
  if (initialPath !== '/') {
    void router.push(initialPath)
  }
  return router
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

function mountSidebar(props: { collapsed?: boolean } = {}, path = '/') {
  const router = makeRouter(path)
  const i18n = makeI18n()
  const pinia = createPinia()

  return mount(Sidebar, {
    props: {
      collapsed: props.collapsed ?? false,
    },
    global: {
      plugins: [router, i18n, pinia],
    },
    attachTo: document.body,
  })
}

describe('Sidebar.vue', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  describe('group rendering', () => {
    it('renders 6 nav groups (PRD §5.1.1)', () => {
      const wrapper = mountSidebar()
      const groups = wrapper.findAll('.sidebar__group')
      expect(groups.length).toBe(NAV_GROUPS.length)
    })

    it('renders all group labels', () => {
      const wrapper = mountSidebar()
      const labels = wrapper.findAll('.sidebar__group-label')
      expect(labels.length).toBe(NAV_GROUPS.length)
    })
  })

  describe('nav items', () => {
    it('renders all nav items as RouterLink', () => {
      const wrapper = mountSidebar()
      const items = wrapper.findAll('.sidebar__item')
      const totalItems = NAV_GROUPS.reduce((sum, g) => sum + g.items.length, 0)
      expect(items.length).toBe(totalItems)
    })

    it('renders item labels', () => {
      const wrapper = mountSidebar()
      // Coverage item should be visible
      expect(wrapper.text()).toContain('覆盖率')
    })
  })

  describe('aria-current', () => {
    it('active route item has aria-current="page"', async () => {
      const router = makeRouter('/audit')
      await router.isReady()
      const i18n = makeI18n()
      const pinia = createPinia()

      const wrapper = mount(Sidebar, {
        props: { collapsed: false },
        global: { plugins: [router, i18n, pinia] },
        attachTo: document.body,
      })

      await router.isReady()

      const currentItem = wrapper.find('[aria-current="page"]')
      expect(currentItem.exists()).toBe(true)
    })

    it('non-active items do not have aria-current', async () => {
      const router = makeRouter('/audit')
      await router.isReady()
      const i18n = makeI18n()
      const pinia = createPinia()

      const wrapper = mount(Sidebar, {
        props: { collapsed: false },
        global: { plugins: [router, i18n, pinia] },
        attachTo: document.body,
      })

      await router.isReady()

      const nonCurrentItems = wrapper.findAll('.sidebar__item:not([aria-current])')
      expect(nonCurrentItems.length).toBeGreaterThan(0)
    })
  })

  describe('pill badges', () => {
    it('renders pill for items with pill !== live', () => {
      const wrapper = mountSidebar()
      const pills = wrapper.findAll('.sidebar__pill')
      // All items with pill != 'live' or undefined should have a badge
      const expectedPills = NAV_GROUPS.flatMap((g) =>
        g.items.filter((i) => i.pill && i.pill !== 'live'),
      )
      expect(pills.length).toBe(expectedPills.length)
    })

    it('does not render pill for live items', () => {
      const wrapper = mountSidebar()
      const auditItem = wrapper.findAll('.sidebar__item').find((el) => {
        return el.text().includes('审计日志')
      })
      if (auditItem) {
        expect(auditItem.find('.sidebar__pill').exists()).toBe(false)
      }
    })

    it('applies pill--new class for new items', () => {
      const wrapper = mountSidebar()
      const newPill = wrapper.find('.sidebar__pill--new')
      expect(newPill.exists()).toBe(true)
    })
  })

  describe('collapse behavior', () => {
    it('emits update:collapsed with true when collapse button clicked', async () => {
      const wrapper = mountSidebar({ collapsed: false })
      const btn = wrapper.find('.sidebar__collapse-btn')
      await btn.trigger('click')
      expect(wrapper.emitted('update:collapsed')).toBeTruthy()
      expect(wrapper.emitted('update:collapsed')?.[0]).toEqual([true])
    })

    it('emits update:collapsed with false when already collapsed', async () => {
      const wrapper = mountSidebar({ collapsed: true })
      const btn = wrapper.find('.sidebar__collapse-btn')
      await btn.trigger('click')
      expect(wrapper.emitted('update:collapsed')?.[0]).toEqual([false])
    })

    it('hides group labels when collapsed', () => {
      const wrapper = mountSidebar({ collapsed: true })
      const labels = wrapper.findAll('.sidebar__group-label')
      expect(labels.length).toBe(0)
    })

    it('hides search button when collapsed', () => {
      const wrapper = mountSidebar({ collapsed: true })
      const search = wrapper.find('.sidebar__search')
      expect(search.exists()).toBe(false)
    })

    it('shows search button when expanded', () => {
      const wrapper = mountSidebar({ collapsed: false })
      const search = wrapper.find('.sidebar__search')
      expect(search.exists()).toBe(true)
    })

    it('adds sidebar--collapsed class when collapsed', () => {
      const wrapper = mountSidebar({ collapsed: true })
      expect(wrapper.find('.sidebar').classes()).toContain('sidebar--collapsed')
    })
  })

  describe('command palette trigger', () => {
    it('emits open-command-palette when search button clicked', async () => {
      const wrapper = mountSidebar({ collapsed: false })
      const searchBtn = wrapper.find('.sidebar__search')
      await searchBtn.trigger('click')
      expect(wrapper.emitted('open-command-palette')).toBeTruthy()
    })
  })

  describe('collapse button aria-label', () => {
    it('has aria-label for collapse', () => {
      const wrapper = mountSidebar({ collapsed: false })
      const btn = wrapper.find('.sidebar__collapse-btn')
      expect(btn.attributes('aria-label')).toBeTruthy()
    })

    it('has aria-label for expand', () => {
      const wrapper = mountSidebar({ collapsed: true })
      const btn = wrapper.find('.sidebar__collapse-btn')
      expect(btn.attributes('aria-label')).toBeTruthy()
    })
  })
})
