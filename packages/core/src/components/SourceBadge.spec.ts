import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRssI18n } from '../i18n'
import SourceBadge from './SourceBadge.vue'
import {
  EXTERNAL_SOURCE,
  MANUAL_SOURCE,
  MOCK_SOURCE,
  RSS_SOURCE,
  UNAVAILABLE_SOURCE,
} from '@rss/shared'

const sources = [
  RSS_SOURCE,
  MOCK_SOURCE,
  MANUAL_SOURCE,
  EXTERNAL_SOURCE,
  UNAVAILABLE_SOURCE,
] as const

describe('SourceBadge', () => {
  it.each(sources)('renders the $kind source as visible text', (source) => {
    expect(Object.isFrozen(source)).toBe(true)
    const wrapper = mount(SourceBadge, {
      props: { source },
      global: { plugins: [createRssI18n()] },
    })
    expect(wrapper.text()).toBeTruthy()
    expect(wrapper.attributes('data-source')).toBe(source.kind)
    expect(wrapper.attributes('aria-label')).toContain(wrapper.text())
  })
})
