import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import IdentityStatusPill from './IdentityStatusPill.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const mountPill = (status: string) => mount(IdentityStatusPill, { props: { status } })

describe('IdentityStatusPill', () => {
  it('renders the active label and a matching variant', () => {
    const w = mountPill('active')
    expect(w.text()).toContain('access.identities.status.active')
    expect(w.attributes('data-variant')).toBe('ok')
  })

  it('renders the locked label and a warning variant', () => {
    const w = mountPill('locked')
    expect(w.text()).toContain('access.identities.status.locked')
    expect(w.attributes('data-variant')).toBe('warn')
  })

  it('falls back to the raw status value in a neutral variant for unknown states', () => {
    const w = mountPill('provisioning')
    expect(w.text()).toContain('provisioning')
    expect(w.attributes('data-variant')).toBe('neutral')
  })

  it('conveys state by text, not colour alone — a label is always rendered', () => {
    expect(mountPill('active').text().trim().length).toBeGreaterThan(0)
    expect(mountPill('locked').text().trim().length).toBeGreaterThan(0)
  })

  it('marks the decorative dot aria-hidden so the text carries the meaning', () => {
    const w = mountPill('active')
    expect(w.find('[aria-hidden="true"]').exists()).toBe(true)
  })
})
