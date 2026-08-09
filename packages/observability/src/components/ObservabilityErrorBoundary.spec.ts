import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import ObservabilityErrorBoundary from './ObservabilityErrorBoundary.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('@gocell/core', () => ({
  UnavailablePanel: defineComponent({
    name: 'UnavailablePanel',
    props: {
      title: { type: String, default: undefined },
      message: { type: String, required: true },
    },
    template: `<div role="status" data-testid="unavailable-panel">{{ message }}</div>`,
  }),
}))

// A child component that renders fine
const NormalChild = defineComponent({
  name: 'NormalChild',
  template: `<div data-testid="normal-child">normal content</div>`,
})

// A child component that throws during its render function (not setup).
const ThrowingChild = defineComponent({
  name: 'ThrowingChild',
  // eslint-disable-next-line vue/require-render-return
  render(): never {
    throw new Error('render error from child')
  },
})

describe('ObservabilityErrorBoundary · normal slot', () => {
  it('renders slot content when no error occurs', () => {
    const wrapper = mount(ObservabilityErrorBoundary, {
      slots: { default: h(NormalChild) },
    })
    expect(wrapper.find('[data-testid="normal-child"]').exists()).toBe(true)
  })

  it('does not show role=alert when no error', () => {
    const wrapper = mount(ObservabilityErrorBoundary, {
      slots: { default: h(NormalChild) },
    })
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})

describe('ObservabilityErrorBoundary · error state', () => {
  it('shows role=alert when child throws on render', async () => {
    // Suppress Vue's internal error log for this test
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const wrapper = mount(ObservabilityErrorBoundary, {
      slots: { default: h(ThrowingChild) },
    })
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)

    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('shows boundary message when child throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const wrapper = mount(ObservabilityErrorBoundary, {
      slots: { default: h(ThrowingChild) },
    })
    await flushPromises()
    const alert = wrapper.find('[role="alert"]')
    expect(alert.text()).toContain('observe.boundary.message')

    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('shows retry button when error occurs', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const wrapper = mount(ObservabilityErrorBoundary, {
      slots: { default: h(ThrowingChild) },
    })
    await flushPromises()
    const retryBtn = wrapper.find('button')
    expect(retryBtn.exists()).toBe(true)
    expect(retryBtn.text()).toContain('observe.boundary.retry')

    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('clears failed state on retry click (verified with working slot)', async () => {
    // Use a component that throws on first render only.
    // On retry, the key increments so the slot wrapper remounts with a fresh instance.
    let renderCount = 0
    const ConditionalThrow = defineComponent({
      name: 'ConditionalThrow',
      render() {
        renderCount++
        if (renderCount === 1) {
          throw new Error('first render error')
        }
        return h('div', { 'data-testid': 'recovered' }, 'recovered')
      },
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    renderCount = 0
    const wrapper = mount(ObservabilityErrorBoundary, {
      slots: { default: h(ConditionalThrow) },
    })
    await flushPromises()

    // First render throws, boundary shows alert
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)

    // Click retry — second render succeeds
    await wrapper.find('button').trigger('click')
    await flushPromises()

    // Alert should be gone, slot content visible
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="recovered"]').exists()).toBe(true)

    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('moves focus into role=alert when error is captured (WCAG 2.4.3)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const wrapper = mount(ObservabilityErrorBoundary, {
      slots: { default: h(ThrowingChild) },
      attachTo: document.body,
    })
    await flushPromises()

    const alertEl = wrapper.find('[role="alert"]').element
    expect(document.activeElement).toBe(alertEl)

    wrapper.unmount()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('restores focus to the slot wrapper after retry (WCAG 2.4.3)', async () => {
    let renderCount = 0
    const ConditionalThrow = defineComponent({
      name: 'ConditionalThrow',
      render() {
        renderCount++
        if (renderCount === 1) throw new Error('first render error')
        return h('div', { 'data-testid': 'recovered' }, 'recovered')
      },
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    renderCount = 0
    // attachTo so document.activeElement reflects real focus moves.
    const wrapper = mount(ObservabilityErrorBoundary, {
      slots: { default: h(ConditionalThrow) },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.find('button').trigger('click')
    await flushPromises()

    const slotWrapper = wrapper.find('.obs-boundary__slot').element
    expect(document.activeElement).toBe(slotWrapper)

    wrapper.unmount()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })
})
