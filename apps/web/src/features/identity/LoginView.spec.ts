import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia } from 'pinia'
import { createWebI18n } from '../../i18n'
import type { IdentitySession, IdentitySessionState, VerifiedProfile } from '@rss/identity'
import LoginView from './LoginView.vue'
import { identitySessionPlugin } from './session-context'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function sessionFixture() {
  let state: IdentitySessionState = { status: 'anonymous' }
  const listeners = new Set<(next: IdentitySessionState) => void>()
  const session = {
    getState: () => state,
    subscribe: (listener: (next: IdentitySessionState) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    login: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
  } as unknown as IdentitySession
  return {
    session,
    publish(next: IdentitySessionState) {
      state = next
      for (const listener of listeners) listener(next)
    },
  }
}

async function mountLogin() {
  const fixture = sessionFixture()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'login', component: LoginView },
      { path: '/', name: 'home', component: { template: '<div>home</div>' } },
    ],
  })
  await router.push('/login')
  await router.isReady()
  const wrapper = mount(LoginView, {
    attachTo: document.body,
    global: {
      plugins: [createPinia(), createWebI18n(), router, identitySessionPlugin(fixture.session)],
    },
  })
  return { fixture, router, wrapper }
}

const verified = {
  subject: 'subject',
  tenantId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  kind: 'user',
} as VerifiedProfile

describe('LoginView', () => {
  it('has visible labels, browser autocomplete and no tenant input', async () => {
    const { wrapper } = await mountLogin()
    expect(wrapper.get('label[for="identity-username"]').isVisible()).toBe(true)
    expect(wrapper.get('label[for="identity-password"]').isVisible()).toBe(true)
    expect(wrapper.get('#identity-username').attributes('autocomplete')).toBe('username')
    expect(wrapper.get('#identity-password').attributes('autocomplete')).toBe('current-password')
    expect(wrapper.get('#identity-password').attributes('type')).toBe('password')
    expect(wrapper.find('input[name="tenant"]').exists()).toBe(false)
  })

  it('focuses the first missing field and does not submit twice', async () => {
    const { fixture, wrapper } = await mountLogin()
    const username = wrapper.get('#identity-username')
    await wrapper.get('form').trigger('submit')
    expect(document.activeElement).toBe(username.element)
    expect(fixture.session.login).not.toHaveBeenCalled()

    const pending = deferred<VerifiedProfile>()
    vi.mocked(fixture.session.login).mockImplementation(() => {
      fixture.publish({ status: 'authenticating' })
      return pending.promise
    })
    await username.setValue('alice')
    await wrapper.get('#identity-password').setValue('secret')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')
    expect(fixture.session.login).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('waits for verified profile before navigation and clears password output', async () => {
    const { fixture, router, wrapper } = await mountLogin()
    const pending = deferred<VerifiedProfile>()
    vi.mocked(fixture.session.login).mockImplementation((_request, _options) => {
      fixture.publish({ status: 'authenticating' })
      return pending.promise
    })
    await wrapper.get('#identity-username').setValue('alice')
    await wrapper.get('#identity-password').setValue('password-secret')
    await wrapper.get('form').trigger('submit')

    expect(router.currentRoute.value.name).toBe('login')
    expect(wrapper.text()).toContain('正在验证')
    expect((wrapper.get('#identity-password').element as HTMLInputElement).value).toBe('')
    fixture.publish({ status: 'verifying' })
    await flushPromises()
    expect(wrapper.text()).toContain('正在验证身份')
    expect(wrapper.html()).not.toContain('password-secret')

    fixture.publish({
      status: 'authenticated',
      profile: verified,
      sessionExpiresAt: 2,
      accessExpiresAt: 1,
    })
    pending.resolve(verified)
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('home')
    expect((wrapper.get('#identity-password').element as HTMLInputElement).value).toBe('')
  })

  it('renders only a safe generic error and clears the submitted password', async () => {
    const { fixture, wrapper } = await mountLogin()
    vi.mocked(fixture.session.login).mockRejectedValue(new Error('raw password-secret failure'))
    await wrapper.get('#identity-username').setValue('alice')
    await wrapper.get('#identity-password').setValue('password-secret')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('登录失败')
    expect(wrapper.html()).not.toContain('raw password-secret failure')
    expect(wrapper.html()).not.toContain('password-secret')
  })

  it('aborts a pending login when the route component unmounts', async () => {
    const { fixture, wrapper } = await mountLogin()
    const pending = deferred<VerifiedProfile>()
    let signal: AbortSignal | undefined
    vi.mocked(fixture.session.login).mockImplementation((_request, options) => {
      signal = options?.signal
      return pending.promise
    })
    await wrapper.get('#identity-username').setValue('alice')
    await wrapper.get('#identity-password').setValue('secret')
    await wrapper.get('form').trigger('submit')
    wrapper.unmount()

    expect(signal?.aborted).toBe(true)
  })
})
