import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createWebI18n } from '../../i18n'
import AuditSensitiveField from './AuditSensitiveField.vue'

describe('AuditSensitiveField', () => {
  it('keeps PII out of the DOM until an explicit per-field reveal', async () => {
    const wrapper = mount(AuditSensitiveField, {
      attachTo: document.body,
      props: { label: 'Actor', value: 'sensitive-actor' },
      global: { plugins: [createWebI18n()] },
    })
    expect(wrapper.html()).not.toContain('sensitive-actor')
    const reveal = wrapper.get('[data-action="reveal-sensitive"]')
    ;(reveal.element as HTMLElement).focus()
    await reveal.trigger('click')
    expect(wrapper.text()).toContain('sensitive-actor')
    expect(document.activeElement).toBe(wrapper.get('[data-action="copy-sensitive"]').element)
    const hide = wrapper.get('[data-action="hide-sensitive"]')
    ;(hide.element as HTMLElement).focus()
    await hide.trigger('click')
    expect(wrapper.html()).not.toContain('sensitive-actor')
    expect(document.activeElement).toBe(wrapper.get('[data-action="reveal-sensitive"]').element)
    wrapper.unmount()
  })

  it('copies only the explicitly revealed field and reports failure without raw errors', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard raw failure'))
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const wrapper = mount(AuditSensitiveField, {
      props: { label: 'Resource', value: 'sensitive-resource' },
      global: { plugins: [createWebI18n()] },
    })
    await wrapper.get('[data-action="reveal-sensitive"]').trigger('click')
    await wrapper.get('[data-action="copy-sensitive"]').trigger('click')
    expect(writeText).toHaveBeenCalledWith('sensitive-resource')
    expect(wrapper.text()).not.toContain('clipboard raw failure')
    expect(wrapper.get('[role="status"]').text()).toBeTruthy()
  })

  it('hides changed values and fences stale clipboard completion', async () => {
    let resolveCopy!: () => void
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              resolveCopy = resolve
            }),
        ),
      },
    })
    const wrapper = mount(AuditSensitiveField, {
      props: { label: 'Actor', value: 'old-sensitive' },
      global: { plugins: [createWebI18n()] },
    })
    await wrapper.get('[data-action="reveal-sensitive"]').trigger('click')
    await wrapper.get('[data-action="copy-sensitive"]').trigger('click')
    await wrapper.setProps({ value: 'new-sensitive' })
    expect(wrapper.html()).not.toContain('old-sensitive')
    expect(wrapper.html()).not.toContain('new-sensitive')
    resolveCopy()
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toBe('')
  })
})
