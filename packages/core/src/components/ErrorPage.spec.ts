import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createRssI18n } from '../i18n'
import ErrorPage from './ErrorPage.vue'

describe('ErrorPage', () => {
  it('shows only reviewed coordinates and copies the sanitized request id', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const wrapper = mount(ErrorPage, {
      props: {
        error: {
          kind: 'serviceUnavailable',
          code: 'ERR_PROVIDER_UNAVAILABLE',
          retryable: true,
          recovery: 'retry',
          requestId: 'request-id',
        },
      },
      global: { plugins: [createRssI18n()] },
    })
    expect(wrapper.text()).toContain('ERR_PROVIDER_UNAVAILABLE')
    expect(wrapper.text()).toContain('request-id')
    expect(wrapper.html()).not.toContain('details')
    await wrapper.get('[data-action="copy-request-id"]').trigger('click')
    expect(writeText).toHaveBeenCalledWith('request-id')
    expect(wrapper.get('[role="status"]').text()).toBeTruthy()
  })

  it('only emits a recovery request and never performs transport work', async () => {
    const wrapper = mount(ErrorPage, {
      props: {
        error: {
          kind: 'conflict',
          code: 'ERR_CORE_CONFLICT',
          retryable: true,
          recovery: 'retry',
        },
      },
      global: { plugins: [createRssI18n()] },
    })
    await wrapper.get('[data-action="recover"]').trigger('click')
    expect(wrapper.emitted('recover')).toHaveLength(1)
  })

  it('reports clipboard failure without exposing another error channel', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('clipboard unavailable')) },
    })
    const wrapper = mount(ErrorPage, {
      props: {
        error: {
          kind: 'forbidden',
          code: 'ERR_CORE_FORBIDDEN',
          retryable: false,
          recovery: 'home',
          requestId: 'request-id',
        },
      },
      global: { plugins: [createRssI18n()] },
    })
    await wrapper.get('[data-action="copy-request-id"]').trigger('click')
    expect(wrapper.get('[role="status"]').text()).toBeTruthy()
    expect(wrapper.html()).not.toContain('clipboard unavailable')
  })

  it('fences a stale clipboard completion after the request id changes', async () => {
    let resolveOld!: () => void
    const writeText = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveOld = resolve
          }),
      )
      .mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const wrapper = mount(ErrorPage, {
      props: {
        error: {
          kind: 'forbidden',
          code: 'ERR_CORE_FORBIDDEN',
          retryable: false,
          recovery: 'home',
          requestId: 'old-request',
        },
      },
      global: { plugins: [createRssI18n()] },
    })
    await wrapper.get('[data-action="copy-request-id"]').trigger('click')
    await wrapper.setProps({ error: { ...wrapper.props('error'), requestId: 'new-request' } })
    expect(wrapper.get('[role="status"]').text()).toBe('')

    resolveOld()
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toBe('')

    await wrapper.get('[data-action="copy-request-id"]').trigger('click')
    expect(writeText).toHaveBeenLastCalledWith('new-request')
    expect(wrapper.get('[role="status"]').text()).toBeTruthy()
  })
})
