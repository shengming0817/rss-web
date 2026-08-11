import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRssI18n } from '../i18n'
import DegradedState from './DegradedState.vue'

const error = Object.freeze({
  kind: 'serviceUnavailable' as const,
  code: 'ERR_CORE_PROVIDER_UNAVAILABLE',
  retryable: true,
  recovery: 'home' as const,
  requestId: 'degraded-request',
})

describe('DegradedState', () => {
  it('renders one unavailable provenance owner and reviewed diagnostics with no recovery by default', () => {
    const wrapper = mount(DegradedState, {
      props: { error, recovery: 'none', headingLevel: 3 },
      global: { plugins: [createRssI18n()] },
    })

    expect(wrapper.get('[role="group"]').attributes('aria-label')).toBeTruthy()
    expect(wrapper.get('[data-source="unavailable"]')).toBeTruthy()
    expect(wrapper.text()).toContain('ERR_CORE_PROVIDER_UNAVAILABLE')
    expect(wrapper.text()).toContain('degraded-request')
    expect(wrapper.find('[data-action="recover"]').exists()).toBe(false)
    expect(wrapper.get('h3')).toBeTruthy()
  })

  it('owns the closed retry-read action independently from the diagnostic recovery hint', async () => {
    const wrapper = mount(DegradedState, {
      props: { error, recovery: 'retryRead', recoveryBusy: true },
      global: { plugins: [createRssI18n()] },
    })

    const recovery = wrapper.get('[data-action="recover"]')
    expect(recovery.text()).toBe('重试')
    expect(recovery.attributes('disabled')).toBeDefined()
    expect(recovery.attributes('aria-busy')).toBe('true')

    await wrapper.setProps({ recoveryBusy: false })
    await recovery.trigger('click')
    expect(wrapper.emitted('retryRead')).toHaveLength(1)
  })
})
