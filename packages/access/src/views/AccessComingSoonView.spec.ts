import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AccessComingSoonView from './AccessComingSoonView.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

function mountView(titleKey: string) {
  return mount(AccessComingSoonView, {
    props: { titleKey },
  })
}

describe('AccessComingSoonView', () => {
  it('renders the h1 with the resolved titleKey', () => {
    const wrapper = mountView('nav.decisions')
    const h1 = wrapper.find('h1')
    expect(h1.exists()).toBe(true)
    expect(h1.text()).toBe('nav.decisions')
  })

  it('renders the coming-soon badge', () => {
    const wrapper = mountView('nav.decisions')
    expect(wrapper.text()).toContain('access.comingSoon.badge')
  })

  it('renders the body text as a plain paragraph (no live region — A-F6)', () => {
    const wrapper = mountView('nav.decisions')
    const body = wrapper.find('.coming-soon__body')
    expect(body.exists()).toBe(true)
    expect(body.text()).toContain('access.comingSoon.body')
    // Static content must NOT carry role="status" (not a live region)
    expect(body.attributes('role')).toBeUndefined()
  })

  it('uses the provided titleKey as the h1 text', () => {
    const wrapper = mountView('nav.reviews')
    expect(wrapper.find('h1').text()).toBe('nav.reviews')
  })
})
