import { flushPromises, mount } from '@vue/test-utils'
import type { SettingsApi } from '@rss/settings'
import { networkErrorForTest } from '@rss/api/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createWebI18n } from '../../i18n'
import { authorizationExperiencePlugin } from '../authorization/authorization-context'
import { settingsApiPlugin } from './settings-context'
import SecretPublishView from './SecretPublishView.vue'

type PublishSecret = SettingsApi['publishSecret']

const execute = vi.fn((_intent: unknown, operation: () => Promise<unknown>) => operation())
const authorization = {
  getHint: vi.fn(() => ({ decision: 'unknown', source: 'server' })),
  getOutcome: vi.fn(() => ({ status: 'idle' })),
  execute,
  subscribe: vi.fn(() => () => undefined),
  dispose: vi.fn(),
} as never

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function settings(publishSecret: PublishSecret): SettingsApi {
  return { publishSecret } as SettingsApi
}

function mountView(publishSecret: PublishSecret, attachTo?: HTMLElement) {
  return mount(SecretPublishView, {
    ...(attachTo === undefined ? {} : { attachTo }),
    global: {
      plugins: [
        createWebI18n(),
        settingsApiPlugin(settings(publishSecret)),
        authorizationExperiencePlugin(authorization),
      ],
    },
  })
}

async function fill(
  wrapper: ReturnType<typeof mountView>,
  values = {
    key: ' service.key ',
    storeId: 'private-store-marker',
    refKey: 'private/ref-marker',
    refVersion: 'private-version-marker',
  },
) {
  await wrapper.get('#secret-key').setValue(values.key)
  await wrapper.get('#secret-store-id').setValue(values.storeId)
  await wrapper.get('#secret-ref-key').setValue(values.refKey)
  await wrapper.get('#secret-ref-version').setValue(values.refVersion)
}

describe('SecretPublishView', () => {
  beforeEach(() => vi.clearAllMocks())

  it('validates required raw fields in order and focuses the first invalid input', async () => {
    const publishSecret = vi.fn() as PublishSecret
    const wrapper = mountView(publishSecret, document.body)

    await wrapper.get('form').trigger('submit')
    expect(document.activeElement).toBe(wrapper.get('#secret-key').element)
    expect(wrapper.get('#secret-key').attributes('aria-invalid')).toBe('true')
    expect(publishSecret).not.toHaveBeenCalled()

    await wrapper.get('#secret-key').setValue('raw key accepted by client')
    await wrapper.get('form').trigger('submit')
    expect(document.activeElement).toBe(wrapper.get('#secret-store-id').element)
    expect(publishSecret).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('masks reference fields and cancels confirmation without an API call', async () => {
    const publishSecret = vi.fn() as PublishSecret
    const wrapper = mountView(publishSecret, document.body)
    await fill(wrapper)

    for (const id of ['#secret-store-id', '#secret-ref-key', '#secret-ref-version']) {
      expect(wrapper.get(id).attributes('type')).toBe('password')
      expect(wrapper.get(id).attributes('autocomplete')).toBe('off')
      expect(wrapper.get(id).attributes('spellcheck')).toBe('false')
    }
    await wrapper.get('[data-action="reveal-secret-reference"]').trigger('click')
    expect(wrapper.get('#secret-store-id').attributes('type')).toBe('text')
    ;(wrapper.get('[data-action="prepare-secret-publish"]').element as HTMLButtonElement).focus()
    await wrapper.get('form').trigger('submit')
    const dialog = wrapper.get('[role="alertdialog"]')
    expect(dialog.text()).not.toMatch(
      /private-store-marker|private\/ref-marker|private-version-marker/,
    )
    expect(publishSecret).not.toHaveBeenCalled()

    await dialog.get('[data-action="cancel-secret-publish"]').trigger('click')
    await flushPromises()
    expect(publishSecret).not.toHaveBeenCalled()
    expect((wrapper.get('#secret-store-id').element as HTMLInputElement).value).toBe(
      'private-store-marker',
    )
    expect(document.activeElement).toBe(
      wrapper.get('[data-action="prepare-secret-publish"]').element,
    )
    wrapper.unmount()
  })

  it('clears every coordinate before one deferred request and renders only the server receipt', async () => {
    const pending = deferred<{ data: { key: string; version: number } }>()
    const publishSecret = vi.fn().mockReturnValue(pending.promise) as PublishSecret
    const storage = vi.spyOn(Storage.prototype, 'setItem')
    const pushState = vi.spyOn(history, 'pushState')
    const replaceState = vi.spyOn(history, 'replaceState')
    const logged = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const wrapper = mountView(publishSecret, document.body)
    await fill(wrapper)
    await wrapper.get('form').trigger('submit')
    await wrapper.get('[data-action="confirm-secret-publish"]').trigger('click')
    await flushPromises()

    expect(publishSecret).toHaveBeenCalledOnce()
    expect(publishSecret).toHaveBeenCalledWith(
      {
        key: ' service.key ',
        storeId: 'private-store-marker',
        refKey: 'private/ref-marker',
        refVersion: 'private-version-marker',
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    for (const id of [
      '#secret-key',
      '#secret-store-id',
      '#secret-ref-key',
      '#secret-ref-version',
    ]) {
      expect((wrapper.get(id).element as HTMLInputElement).value).toBe('')
    }
    expect(wrapper.html()).not.toMatch(
      /private-store-marker|private\/ref-marker|private-version-marker/,
    )
    expect(wrapper.get('form').attributes('aria-busy')).toBe('true')
    expect(document.activeElement).toBe(wrapper.get('[role="status"][tabindex="-1"]').element)
    expect(storage).not.toHaveBeenCalled()
    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).not.toHaveBeenCalled()
    expect(logged).not.toHaveBeenCalled()

    pending.resolve({ data: { key: 'server.confirmed', version: 9 } })
    await flushPromises()
    expect(wrapper.text()).toContain('server.confirmed')
    expect(wrapper.text()).toContain('9')
    expect(wrapper.text()).not.toMatch(
      /private-store-marker|private\/ref-marker|private-version-marker/,
    )
    wrapper.unmount()
  })

  it('omits an empty optional refVersion and exposes no retry after unknown', async () => {
    const publishSecret = vi.fn().mockRejectedValue(networkErrorForTest()) as PublishSecret
    const wrapper = mountView(publishSecret, document.body)
    await fill(wrapper, {
      key: 'service.key',
      storeId: 'store',
      refKey: 'path/key',
      refVersion: '',
    })
    await wrapper.get('form').trigger('submit')
    await wrapper.get('[data-action="confirm-secret-publish"]').trigger('click')
    await flushPromises()

    expect(vi.mocked(publishSecret).mock.calls[0]?.[0]).toEqual({
      key: 'service.key',
      storeId: 'store',
      refKey: 'path/key',
    })
    expect(wrapper.get('[role="alert"][tabindex="-1"]').text()).toContain('结果未知')
    expect(document.activeElement).toBe(wrapper.get('[role="alert"][tabindex="-1"]').element)
    expect(
      wrapper.find('[data-action="prepare-secret-publish"]').attributes('disabled'),
    ).toBeDefined()
    expect(wrapper.find('[data-action="retry-secret-publish"]').exists()).toBe(false)
    expect(publishSecret).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('aborts an in-flight publish and clears coordinates on unmount', async () => {
    let signal: AbortSignal | undefined
    const publishSecret = vi.fn((_request, options) => {
      signal = options?.signal
      return new Promise(() => undefined)
    }) as PublishSecret
    const wrapper = mountView(publishSecret)
    await fill(wrapper)
    await wrapper.get('form').trigger('submit')
    await wrapper.get('[data-action="confirm-secret-publish"]').trigger('click')
    wrapper.unmount()
    expect(signal?.aborted).toBe(true)
  })
})
