import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createWebI18n } from '../../i18n'
import VerifiedProfilePanel from './VerifiedProfilePanel.vue'

describe('VerifiedProfilePanel', () => {
  it('renders only verified profile coordinates', () => {
    const wrapper = mount(VerifiedProfilePanel, {
      props: {
        profile: {
          subject: 'opaque-subject',
          tenantId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
          kind: 'admin',
        } as never,
      },
      global: { plugins: [createWebI18n()] },
    })
    expect(wrapper.text()).toContain('opaque-subject')
    expect(wrapper.text()).toContain('f47ac10b-58cc-4372-a567-0e02b2c3d479')
    expect(wrapper.text()).toContain('admin')
    expect(wrapper.html()).not.toMatch(/accessToken|refreshToken|sessionId/)
  })
})
