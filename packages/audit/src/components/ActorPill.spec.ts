import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ActorPill from './ActorPill.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

describe('ActorPill', () => {
  it('renders the actorId as the visible text', () => {
    const wrapper = mount(ActorPill, { props: { actorId: 'dario@gocell.dev' } })
    expect(wrapper.find('.pill__label').text()).toBe('dario@gocell.dev')
  })

  it('decorative dot is aria-hidden', () => {
    const wrapper = mount(ActorPill, { props: { actorId: 'dario@gocell.dev' } })
    const dot = wrapper.find('.pill__dot')
    expect(dot.attributes('aria-hidden')).toBe('true')
  })

  it('human actor gets human variant', () => {
    const wrapper = mount(ActorPill, { props: { actorId: 'dario@gocell.dev' } })
    expect(wrapper.find('.pill').attributes('data-variant')).toBe('human')
  })

  it('sandbox actor (sb- prefix) gets sandbox variant', () => {
    const wrapper = mount(ActorPill, { props: { actorId: 'sb-790' } })
    expect(wrapper.find('.pill').attributes('data-variant')).toBe('sandbox')
  })

  it('service actor (sa: prefix) gets service variant', () => {
    const wrapper = mount(ActorPill, { props: { actorId: 'sa:platform-bot' } })
    expect(wrapper.find('.pill').attributes('data-variant')).toBe('service')
  })

  it('cell actor (core suffix) gets cell variant', () => {
    const wrapper = mount(ActorPill, { props: { actorId: 'observecore' } })
    expect(wrapper.find('.pill').attributes('data-variant')).toBe('cell')
  })

  it('unknown actor gets unknown variant', () => {
    const wrapper = mount(ActorPill, { props: { actorId: 'some-random-id' } })
    expect(wrapper.find('.pill').attributes('data-variant')).toBe('unknown')
  })
})
