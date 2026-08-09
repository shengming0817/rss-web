import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CellHealthBadge from './CellHealthBadge.vue'
import type { CellHealthStatus } from '../api/health'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

describe('CellHealthBadge', () => {
  const cases: Array<[CellHealthStatus, string]> = [
    ['healthy', 'ok'],
    ['degraded', 'warn'],
    ['down', 'err'],
    ['starting', 'ok'],
    ['stopping', 'warn'],
  ]

  for (const [status, variant] of cases) {
    it(`status="${status}" renders badge--${variant} class`, () => {
      const wrapper = mount(CellHealthBadge, { props: { status } })
      expect(wrapper.find('.badge').classes()).toContain(`badge--${variant}`)
    })

    it(`status="${status}" renders label key "landing.status.${status}"`, () => {
      const wrapper = mount(CellHealthBadge, { props: { status } })
      expect(wrapper.find('.badge__label').text()).toBe(`landing.status.${status}`)
    })
  }

  it('decorative dot is aria-hidden', () => {
    const wrapper = mount(CellHealthBadge, { props: { status: 'healthy' } })
    expect(wrapper.find('.badge__dot').attributes('aria-hidden')).toBe('true')
  })

  it('data-variant attribute matches computed variant', () => {
    const wrapper = mount(CellHealthBadge, { props: { status: 'down' } })
    expect(wrapper.find('.badge').attributes('data-variant')).toBe('err')
  })
})
