import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import { createWebI18n } from '../../i18n'
import ConfigCatalogPreviewView from './ConfigCatalogPreviewView.vue'
import { createConfigPreviewDraftHandoff } from './config-preview-draft-context'

describe('ConfigCatalogPreviewView', () => {
  it('requires a warning confirmation before staging one Manual draft', async () => {
    const handoff = createConfigPreviewDraftHandoff()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'preview', component: ConfigCatalogPreviewView },
        { path: '/settings', name: 'settings', component: { template: '<p>settings</p>' } },
      ],
    })
    await router.push('/')
    await router.isReady()
    const wrapper = mount(ConfigCatalogPreviewView, {
      attachTo: document.body,
      props: { configPreviewDraft: handoff },
      global: { plugins: [createWebI18n(), router] },
    })

    const rows = wrapper.findAll('li')
    expect(rows.length).toBe(2)
    expect(rows.every((row) => row.find('[data-source="mock"]').exists())).toBe(true)
    expect(wrapper.text()).toContain('永久非权威')
    const next = wrapper.findAll('button').find((button) => button.text() === '下一页')!
    next.element.focus()
    await next.trigger('click')
    await flushPromises()
    const status = wrapper.get('[role="status"]')
    expect(status.text()).toContain('第 2 页')
    expect(document.activeElement).toBe(status.element)
    await wrapper.get('#catalog-search').setValue('digest preference')
    await flushPromises()
    expect(status.text()).toContain('第 1 页')
    expect(status.text()).toContain('1 项')
    await wrapper.get('#catalog-search').setValue('')
    await flushPromises()
    await rows[0]!.get('button').trigger('click')
    expect(handoff.consume()).toBeUndefined()
    expect(router.currentRoute.value.name).toBe('preview')

    await wrapper.get('[data-action="confirm-catalog-copy"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('settings')
    expect(handoff.consume()).toEqual({
      kind: 'catalog-key',
      key: 'preview.example.appearance.theme',
    })
    wrapper.unmount()
  })
})
