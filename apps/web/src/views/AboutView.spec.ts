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
    expect(wrapper.get('[data-release-rss-ledger-id]').text()).toBe(
      '20260812-release-consumed-contracts',
    )
    expect(wrapper.get('[data-release-rss-source-revision]').text()).toBe(
      '1f6c131f0759f921551a81e12e0adb0071346927',
    )
    expect(wrapper.get('[data-release-rss-notice]').text()).toContain(
      '仅记录此 Web 构建审查过的 RSS contracts',
    )
    expect(wrapper.get('[data-release-rss-notice]').text()).toContain(
      '不表示当前 RSS 实例的版本、健康或 authority',
    )
    expect(wrapper.get('[data-release-rss-notice]').text()).toContain(
      '整个 RSS API 或任何 N/N-1 兼容承诺',
    )
    expect(wrapper.findAll('[data-source="external"]')).toHaveLength(2)
    expect(wrapper.find('[data-release-preview-source]').exists()).toBe(false)
    expect(wrapper.find('[data-release-compatibility-status]').exists()).toBe(false)
    expect(wrapper.find('table').exists()).toBe(false)
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
