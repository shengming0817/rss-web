import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createWebI18n } from '../i18n'
import { createWebReleaseMeta } from '../release-meta'
import AboutView from './AboutView.vue'

describe('AboutView', () => {
  it('renders static release evidence without network or runtime discovery', () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    const meta = createWebReleaseMeta({
      webRevision: 'a'.repeat(40),
      roleBindingsPreview: false,
      configCatalogPreview: false,
      configHistoryPreview: false,
    })
    const wrapper = mount(AboutView, {
      props: { releaseMeta: meta },
      global: { plugins: [createWebI18n()] },
    })

    expect(wrapper.get('[data-release-web-revision]').text()).toBe('a'.repeat(40))
    expect(wrapper.get('[data-release-rss-baseline]').text()).toContain(
      'b513d3390d73d4f291bb31afc588ca1307ce19af',
    )
    expect(wrapper.findAll('[data-source="external"]')).toHaveLength(2)
    expect(wrapper.find('[data-release-preview-source]').exists()).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('shows only explicitly enabled Preview sources as Mock and non-authoritative', () => {
    const wrapper = mount(AboutView, {
      props: {
        releaseMeta: createWebReleaseMeta({
          webRevision: 'b'.repeat(40),
          roleBindingsPreview: true,
          configCatalogPreview: false,
          configHistoryPreview: true,
        }),
      },
      global: { plugins: [createWebI18n()] },
    })

    const rows = wrapper.findAll('[data-release-preview-source]')
    expect(rows.map((row) => row.attributes('data-release-preview-source'))).toEqual([
      'role-bindings',
      'config-history',
    ])
    for (const row of rows) {
      expect(row.get('[data-source="mock"]').attributes()).toMatchObject({
        'data-authoritative': 'false',
        'data-preview': 'true',
      })
    }
    expect(wrapper.text()).not.toContain('Config Catalog Preview')
  })
})
