import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UnavailablePanel from './UnavailablePanel.vue'

describe('UnavailablePanel', () => {
  it('renders the message prop', () => {
    const wrapper = mount(UnavailablePanel, {
      props: { message: 'Data is unavailable' },
    })
    expect(wrapper.text()).toContain('Data is unavailable')
  })

  it('has role="status"', () => {
    const wrapper = mount(UnavailablePanel, {
      props: { message: 'Some message' },
    })
    expect(wrapper.attributes('role')).toBe('status')
  })

  it('renders optional title prop when provided', () => {
    const wrapper = mount(UnavailablePanel, {
      props: { title: 'Not available', message: 'Try again later' },
    })
    expect(wrapper.text()).toContain('Not available')
    expect(wrapper.text()).toContain('Try again later')
  })

  it('renders without title when title is omitted', () => {
    const wrapper = mount(UnavailablePanel, {
      props: { message: 'No title here' },
    })
    // Should not throw, title section should not render
    expect(wrapper.find('.panel__title').exists()).toBe(false)
    expect(wrapper.text()).toContain('No title here')
  })
})
