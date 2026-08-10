import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRssI18n } from '../i18n'
import ContentState from './ContentState.vue'

describe('ContentState', () => {
  it.each(['loading', 'empty', 'unavailable'] as const)('renders %s accessibly', (state) => {
    const wrapper = mount(ContentState, {
      props: { state },
      global: { plugins: [createRssI18n()] },
    })
    expect(wrapper.get('[role="status"]').text()).toBeTruthy()
    expect(wrapper.get('[role="status"]').attributes('aria-busy')).toBe(
      state === 'loading' ? 'true' : 'false',
    )
  })

  it('emits one explicit retry without owning a request', async () => {
    const wrapper = mount(ContentState, {
      props: { state: 'unavailable', retryable: true },
      global: { plugins: [createRssI18n()] },
    })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('accepts reviewed local copy without changing the state contract', () => {
    const wrapper = mount(ContentState, {
      props: { state: 'empty', title: 'Filtered empty', message: 'Change the filter.' },
      global: { plugins: [createRssI18n()] },
    })
    expect(wrapper.text()).toContain('Filtered empty')
    expect(wrapper.text()).toContain('Change the filter.')
  })
})
