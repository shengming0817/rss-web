import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createI18n } from 'vue-i18n'
import { createPinia } from 'pinia'
import Sidebar from './Sidebar.vue'
import zhCN from '../i18n/messages/zh-CN'
import enUS from '../i18n/messages/en-US'

function makeRouter(initialPath = '/') {
  // Create a router with a route for every nav item (so RouterLink resolves)
  const routes = [
    { path: '/', component: { template: '<div/>' } },
    { path: '/access/identities', component: { template: '<div/>' } },
    { path: '/access/policies', component: { template: '<div/>' } },
    { path: '/audit', component: { template: '<div/>' } },
    { path: '/config', component: { template: '<div/>' } },
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

  it('keeps business navigation empty until RSS routes are implemented', () => {
    const wrapper = mountSidebar()
    expect(wrapper.findAll('.sidebar__item')).toHaveLength(0)
    expect(wrapper.find('.sidebar__nav').exists()).toBe(true)
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
