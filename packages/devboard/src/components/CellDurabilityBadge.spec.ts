import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import CellDurabilityBadge from './CellDurabilityBadge.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      cells: {
        badge: {
          durable: 'Durable',
          demo: 'Demo',
          durableHint: 'Durable cell: state is persisted.',
          demoHint: 'Demo cell: state is not persisted.',
        },
      },
    },
  },
})

describe('CellDurabilityBadge', () => {
  it('renders "Durable" label for durable mode', () => {
    const wrapper = mount(CellDurabilityBadge, {
      props: { mode: 'durable' },
      global: { plugins: [i18n] },
    })
    expect(wrapper.text()).toContain('Durable')
  })

  it('renders "Demo" label for demo mode', () => {
    const wrapper = mount(CellDurabilityBadge, {
      props: { mode: 'demo' },
      global: { plugins: [i18n] },
    })
    expect(wrapper.text()).toContain('Demo')
  })

  it('dot element is aria-hidden for durable mode', () => {
    const wrapper = mount(CellDurabilityBadge, {
      props: { mode: 'durable' },
      global: { plugins: [i18n] },
    })
    const dot = wrapper.find('.badge__dot')
    expect(dot.exists()).toBe(true)
    expect(dot.attributes('aria-hidden')).toBe('true')
  })

  it('dot element is aria-hidden for demo mode', () => {
    const wrapper = mount(CellDurabilityBadge, {
      props: { mode: 'demo' },
      global: { plugins: [i18n] },
    })
    const dot = wrapper.find('.badge__dot')
    expect(dot.exists()).toBe(true)
    expect(dot.attributes('aria-hidden')).toBe('true')
  })

  it('applies durable variant class for durable mode', () => {
    const wrapper = mount(CellDurabilityBadge, {
      props: { mode: 'durable' },
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('.badge--durable').exists()).toBe(true)
  })

  it('applies demo variant class for demo mode', () => {
    const wrapper = mount(CellDurabilityBadge, {
      props: { mode: 'demo' },
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('.badge--demo').exists()).toBe(true)
  })
})
