import { flushPromises, mount } from '@vue/test-utils'
import type { SettingsApi } from '@rss/settings'
import { networkErrorForTest } from '@rss/api/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWebI18n } from '../../i18n'
import { authorizationExperiencePlugin } from '../authorization/authorization-context'
import { settingsApiPlugin } from './settings-context'
import { SECRET_MATERIAL_LEASE_MS } from './secret-material-reveal-operation'
import SecretMaterialRevealView from './SecretMaterialRevealView.vue'

const routeLeave = vi.hoisted(() => ({ guard: undefined as (() => unknown) | undefined }))

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    onBeforeRouteLeave: (guard: () => unknown) => {
      routeLeave.guard = guard
    },
  }
})

type ResolveSecret = SettingsApi['resolveSecret']
const execute = vi.fn((_intent: unknown, operation: () => Promise<unknown>) => operation())
const authorization = {
  getHint: vi.fn(() => ({ decision: 'unknown', source: 'server' })),
  getOutcome: vi.fn(() => ({ status: 'idle' })),
  execute,
  subscribe: vi.fn(() => () => undefined),
  dispose: vi.fn(),
} as never

function settings(resolveSecret: ResolveSecret): SettingsApi {
  return { resolveSecret } as SettingsApi
}

function mountView(resolveSecret: ResolveSecret, attachTo: HTMLElement = document.body) {
  return mount(SecretMaterialRevealView, {
    attachTo,
    global: {
      plugins: [
        createWebI18n(),
        settingsApiPlugin(settings(resolveSecret)),
        authorizationExperiencePlugin(authorization),
      ],
    },
  })
}

async function prepare(wrapper: ReturnType<typeof mountView>, key = 'vault.password') {
  await wrapper.get('#secret-material-key').setValue(key)
  await wrapper.get('[data-action="prepare-secret-material"]').trigger('click')
}

describe('SecretMaterialRevealView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeLeave.guard = undefined
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('validates the key, focuses it, and makes no automatic request', async () => {
    const resolveSecret = vi.fn() as ResolveSecret
    const wrapper = mountView(resolveSecret)
    expect(resolveSecret).not.toHaveBeenCalled()

    await wrapper.get('[data-action="prepare-secret-material"]').trigger('click')
    expect(document.activeElement).toBe(wrapper.get('#secret-material-key').element)
    expect(wrapper.get('#secret-material-key').attributes('aria-invalid')).toBe('true')
    expect(resolveSecret).not.toHaveBeenCalled()
  })

  it('requires an alertdialog and cancel restores focus without a request', async () => {
    const resolveSecret = vi.fn() as ResolveSecret
    const wrapper = mountView(resolveSecret)
    const prepareButton = wrapper.get('[data-action="prepare-secret-material"]')
    ;(prepareButton.element as HTMLElement).focus()
    await prepare(wrapper)

    const dialog = wrapper.get('[role="alertdialog"]')
    expect(resolveSecret).not.toHaveBeenCalled()
    expect(dialog.text()).toContain('系统剪贴板')
    await dialog.get('[data-action="cancel-secret-material"]').trigger('click')
    await flushPromises()
    expect(resolveSecret).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(prepareButton.element)
    expect((wrapper.get('#secret-material-key').element as HTMLInputElement).value).toBe(
      'vault.password',
    )
  })

  it('clears the key before one request and renders only raw Base64 in the active view', async () => {
    let resolve!: (value: { data: { materialBase64: string } }) => void
    const response = new Promise<{ data: { materialBase64: string } }>((done) => {
      resolve = done
    })
    const resolveSecret = vi.fn().mockReturnValue(response) as ResolveSecret
    const storage = vi.spyOn(Storage.prototype, 'setItem')
    const pushState = vi.spyOn(history, 'pushState')
    const replaceState = vi.spyOn(history, 'replaceState')
    const logs = [
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
    ]
    const wrapper = mountView(resolveSecret)
    await prepare(wrapper)
    await wrapper.get('[data-action="confirm-secret-material"]').trigger('click')
    await flushPromises()

    expect((wrapper.get('#secret-material-key').element as HTMLInputElement).value).toBe('')
    expect(resolveSecret).toHaveBeenCalledOnce()
    expect(resolveSecret).toHaveBeenCalledWith(
      'vault.password',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(document.activeElement).toBe(wrapper.get('[data-secret-material-busy]').element)

    resolve({ data: { materialBase64: 'AP+A' } })
    await flushPromises()
    const active = wrapper.get('[data-secret-material-view]')
    expect(active.get('[data-secret-material-active]').text()).toBe('AP+A')
    expect(active.text()).not.toContain('\u0000')
    expect(document.activeElement).toBe(active.get('h2').element)
    expect(storage).not.toHaveBeenCalled()
    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).not.toHaveBeenCalled()
    for (const log of logs) expect(log).not.toHaveBeenCalled()
  })

  it('copies explicitly, warns about clipboard lifetime, and hides on Escape', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const wrapper = mountView(
      vi.fn().mockResolvedValue({ data: { materialBase64: '/+8=' } }) as ResolveSecret,
    )
    await prepare(wrapper)
    await wrapper.get('[data-action="confirm-secret-material"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-secret-material-view]').text()).toContain('系统剪贴板')
    await wrapper.get('[data-action="copy-secret-material"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('/+8=')
    expect(wrapper.get('[data-copy-status]').text()).toBeTruthy()

    await wrapper.get('[data-secret-material-view]').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(wrapper.find('[data-secret-material-active]').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('/+8=')
    expect(document.activeElement).toBe(wrapper.get('[data-secret-material-cleared]').element)
  })

  it('removes material on TTL, hidden visibility, pagehide, and route leave', async () => {
    vi.useFakeTimers()
    const resolveSecret = vi
      .fn()
      .mockResolvedValue({ data: { materialBase64: 'dHRsLXNlY3JldA==' } }) as ResolveSecret
    const wrapper = mountView(resolveSecret)
    await prepare(wrapper)
    await wrapper.get('[data-action="confirm-secret-material"]').trigger('click')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(SECRET_MATERIAL_LEASE_MS)
    await flushPromises()
    expect(wrapper.html()).not.toContain('dHRsLXNlY3JldA==')
    expect(wrapper.get('[data-secret-material-cleared]').text()).toContain('到期')

    await prepare(wrapper, 'vault.hidden')
    await wrapper.get('[data-action="confirm-secret-material"]').trigger('click')
    await flushPromises()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(wrapper.find('[data-secret-material-active]').exists()).toBe(false)

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    await prepare(wrapper, 'vault.pagehide')
    await wrapper.get('[data-action="confirm-secret-material"]').trigger('click')
    await flushPromises()
    window.dispatchEvent(new Event('pagehide'))
    expect(wrapper.html()).not.toContain('dHRsLXNlY3JldA==')
    await flushPromises()
    expect(wrapper.find('[data-secret-material-view]').exists()).toBe(false)

    await prepare(wrapper, 'vault.route')
    await wrapper.get('[data-action="confirm-secret-material"]').trigger('click')
    await flushPromises()
    expect(routeLeave.guard?.()).toBeUndefined()
    await flushPromises()
    expect(wrapper.find('[data-secret-material-view]').exists()).toBe(false)
  })

  it('fences stale clipboard completion and releases material on unmount', async () => {
    let finishCopy!: () => void
    const writeText = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishCopy = resolve
        }),
    )
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const wrapper = mountView(
      vi.fn().mockResolvedValue({ data: { materialBase64: 'c3RhbGU=' } }) as ResolveSecret,
    )
    await prepare(wrapper)
    await wrapper.get('[data-action="confirm-secret-material"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-action="copy-secret-material"]').trigger('click')
    await wrapper.get('[data-action="hide-secret-material"]').trigger('click')
    finishCopy()
    await flushPromises()
    expect(wrapper.html()).not.toContain('c3RhbGU=')
    expect(wrapper.find('[data-copy-status]').exists()).toBe(false)
    wrapper.unmount()
    expect(document.body.textContent).not.toContain('c3RhbGU=')
  })

  it('shows only a safe error and allows a new explicit confirmation', async () => {
    const resolveSecret = vi.fn().mockRejectedValue(networkErrorForTest()) as ResolveSecret
    const wrapper = mountView(resolveSecret)
    await prepare(wrapper)
    await wrapper.get('[data-action="confirm-secret-material"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('NETWORK_ERROR')
    expect(wrapper.text()).not.toContain('vault.password')
    expect(document.activeElement).toBe(wrapper.get('[data-secret-material-outcome]').element)
    expect(wrapper.find('[data-secret-material-active]').exists()).toBe(false)
    await prepare(wrapper, 'vault.retry')
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true)
    expect(resolveSecret).toHaveBeenCalledOnce()
  })
})
