import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import { createWebI18n } from '../../i18n'
import ConfigCatalogPreviewView from './ConfigCatalogPreviewView.vue'
import {
  configCatalogDraftPlugin,
  createConfigCatalogDraftHandoff,
} from './config-catalog-draft-context'

describe('ConfigCatalogPreviewView', () => {
  it('requires a warning confirmation before staging one Manual draft', async () => {
    const handoff = createConfigCatalogDraftHandoff()
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
      global: { plugins: [createWebI18n(), router, configCatalogDraftPlugin(handoff)] },
    })

    const rows = wrapper.findAll('li')
    expect(rows.length).toBe(2)
    expect(rows.every((row) => row.find('[data-source="mock"]').exists())).toBe(true)
    expect(wrapper.text()).toContain('永久非权威')
    await rows[0]!.get('button').trigger('click')
    expect(handoff.consume()).toBeUndefined()
    expect(router.currentRoute.value.name).toBe('preview')

    await wrapper.get('[data-action="confirm-catalog-copy"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('settings')
    expect(handoff.consume()).toEqual({ key: 'preview.example.appearance.theme' })
  })
})
