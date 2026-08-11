import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createWebI18n } from '../../i18n'
import RoleBindingsPreviewView from './RoleBindingsPreviewView.vue'

describe('RoleBindingsPreviewView', () => {
  it('renders two read-only synthetic projections with permanent non-authoritative provenance', () => {
    const wrapper = mount(RoleBindingsPreviewView, {
      global: { plugins: [createWebI18n()] },
    })
    expect(wrapper.get('[data-source="mock"]').attributes()).toMatchObject({
      'data-authoritative': 'false',
      'data-preview': 'true',
    })
    expect(wrapper.text()).toContain('静态合成')
    expect(wrapper.text()).toContain('不代表当前 binding')
    expect(wrapper.text()).toContain('按 Subject 查看')
    expect(wrapper.text()).toContain('按 Role 查看')
    expect(wrapper.text()).toContain('preview-subject-')
    expect(wrapper.text()).toContain('preview:')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.find('[data-source="rss"]').exists()).toBe(false)
  })
})
