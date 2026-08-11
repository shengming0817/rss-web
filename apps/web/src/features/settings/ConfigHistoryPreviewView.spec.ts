import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import { createWebI18n } from '../../i18n'
import ConfigHistoryPreviewView from './ConfigHistoryPreviewView.vue'
import { createConfigPreviewDraftHandoff } from './config-preview-draft-context'

function setup(stageHistory = vi.fn(() => true)) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'preview', component: ConfigHistoryPreviewView },
      { path: '/settings', name: 'settings', component: { template: '<p>settings</p>' } },
    ],
  })
  const configPreviewDraft = {
    stageCatalog: vi.fn(() => true),
    stageHistory,
    consume: vi.fn(() => undefined),
    discard: vi.fn(),
  }
  return { router, configPreviewDraft, stageHistory }
}

describe('ConfigHistoryPreviewView', () => {
  it('renders a permanently non-authoritative metadata-only Mock timeline', async () => {
    const { router, configPreviewDraft } = setup()
    await router.push('/')
    await router.isReady()
    const wrapper = mount(ConfigHistoryPreviewView, {
      props: { configPreviewDraft },
      global: { plugins: [createWebI18n(), router] },
    })

    const rows = wrapper.findAll('[data-history-row]')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.find('[data-source="mock"]').exists())).toBe(true)
    expect(wrapper.text()).toContain('永久非权威')
    expect(wrapper.get('[role="status"]').text()).toContain(`${rows.length} 项`)
    expect(wrapper.text()).not.toMatch(/value|diff|secret|当前|最新/i)
  })

  it('stages only after confirmation and keeps a failed handoff recoverable', async () => {
    const stageHistory = vi.fn(() => false)
    const { router, configPreviewDraft } = setup(stageHistory)
    await router.push('/')
    await router.isReady()
    const wrapper = mount(ConfigHistoryPreviewView, {
      attachTo: document.body,
      props: { configPreviewDraft },
      global: { plugins: [createWebI18n(), router] },
    })

    const copy = wrapper.get('[data-action="prepare-history-copy"]')
    ;(copy.element as HTMLElement).focus()
    await copy.trigger('click')
    expect(stageHistory).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('preview')

    await wrapper.get('[data-action="cancel-history-copy"]').trigger('click')
    await flushPromises()
    expect(stageHistory).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(copy.element)

    await copy.trigger('click')
    await wrapper.get('[data-action="confirm-history-copy"]').trigger('click')
    await flushPromises()
    expect(stageHistory).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.name).toBe('preview')
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true)
    expect(document.activeElement).toBe(wrapper.get('[role="alert"][tabindex="-1"]').element)

    stageHistory.mockReturnValue(true)
    await wrapper.get('[data-action="confirm-history-copy"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('settings')
    wrapper.unmount()
  })

  it('discards the candidate when navigation is redirected before Settings mounts', async () => {
    const configPreviewDraft = createConfigPreviewDraftHandoff()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'preview', component: ConfigHistoryPreviewView },
        { path: '/settings', name: 'settings', component: { template: '<p>settings</p>' } },
        { path: '/login', name: 'login', component: { template: '<p>login</p>' } },
      ],
    })
    router.beforeEach((to) => (to.name === 'settings' ? { name: 'login' } : true))
    await router.push('/')
    await router.isReady()
    const wrapper = mount(ConfigHistoryPreviewView, {
      attachTo: document.body,
      props: { configPreviewDraft },
      global: { plugins: [createWebI18n(), router] },
    })

    await wrapper.get('[data-action="prepare-history-copy"]').trigger('click')
    await wrapper.get('[data-action="confirm-history-copy"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('login')
    expect(configPreviewDraft.consume()).toBeUndefined()
    expect(document.activeElement).toBe(wrapper.get('[role="alert"][tabindex="-1"]').element)
    wrapper.unmount()
  })

  it('discards the candidate when navigation rejects', async () => {
    const configPreviewDraft = createConfigPreviewDraftHandoff()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'preview', component: ConfigHistoryPreviewView },
        { path: '/settings', name: 'settings', component: { template: '<p>settings</p>' } },
      ],
    })
    router.beforeEach((to) => {
      if (to.name === 'settings') throw new Error('closed navigation failure')
      return true
    })
    await router.push('/')
    await router.isReady()
    const wrapper = mount(ConfigHistoryPreviewView, {
      props: { configPreviewDraft },
      global: { plugins: [createWebI18n(), router] },
    })

    await wrapper.get('[data-action="prepare-history-copy"]').trigger('click')
    await wrapper.get('[data-action="confirm-history-copy"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('preview')
    expect(configPreviewDraft.consume()).toBeUndefined()
    expect(wrapper.get('[role="alert"][tabindex="-1"]').text()).toContain('未修改')
  })
})
