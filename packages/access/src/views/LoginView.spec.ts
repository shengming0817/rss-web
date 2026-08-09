import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { useAuthStore } from '../stores/useAuthStore'
import LoginView from './LoginView.vue'

const push = vi.fn()
let routeQuery: Record<string, string> = {}

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ query: routeQuery }),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

function mountView() {
  const wrapper = mount(LoginView, {
    global: { plugins: [createTestingPinia({ createSpy: vi.fn })] },
  })
  const auth = useAuthStore()
  return { wrapper, auth }
}

const fill = async (wrapper: ReturnType<typeof mountView>['wrapper']) => {
  await wrapper.find('#login-username').setValue('admin')
  await wrapper.find('#login-password').setValue('SecretPass!23')
}

describe('LoginView', () => {
  beforeEach(() => {
    routeQuery = {}
    push.mockClear()
  })

  it('renders username, password fields and a submit button', () => {
    const { wrapper } = mountView()
    expect(wrapper.find('#login-username').exists()).toBe(true)
    expect(wrapper.find('#login-password').exists()).toBe(true)
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true)
  })

  it('associates each input with a label and sets autocomplete', () => {
    const { wrapper } = mountView()
    expect(wrapper.find('label[for="login-username"]').exists()).toBe(true)
    expect(wrapper.find('label[for="login-password"]').exists()).toBe(true)
    expect(wrapper.find('#login-username').attributes('autocomplete')).toBe('username')
    expect(wrapper.find('#login-password').attributes('autocomplete')).toBe('current-password')
  })

  it('disables submit until both fields are filled', async () => {
    const { wrapper } = mountView()
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    await fill(wrapper)
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('calls auth.login with the entered credentials on submit', async () => {
    const { wrapper, auth } = mountView()
    vi.mocked(auth.login).mockResolvedValue(undefined)
    await fill(wrapper)
    await wrapper.find('form').trigger('submit')
    expect(auth.login).toHaveBeenCalledWith({ username: 'admin', password: 'SecretPass!23' })
  })

  it('redirects to query.redirect after a successful login', async () => {
    routeQuery = { redirect: '/cells' }
    const { wrapper, auth } = mountView()
    vi.mocked(auth.login).mockResolvedValue(undefined)
    await fill(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(push).toHaveBeenCalledWith('/cells')
  })

  it('redirects to / when there is no redirect query', async () => {
    const { wrapper, auth } = mountView()
    vi.mocked(auth.login).mockResolvedValue(undefined)
    await fill(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(push).toHaveBeenCalledWith('/')
  })

  it('ignores an off-site redirect target and falls back to / (open-redirect guard)', async () => {
    for (const evil of ['//evil.com', 'https://evil.com', 'javascript:alert(1)']) {
      push.mockClear()
      routeQuery = { redirect: evil }
      const { wrapper, auth } = mountView()
      vi.mocked(auth.login).mockResolvedValue(undefined)
      await fill(wrapper)
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(push).toHaveBeenCalledWith('/')
    }
  })

  it('marks both inputs aria-invalid and links the error region on failure', async () => {
    const { wrapper, auth } = mountView()
    vi.mocked(auth.login).mockRejectedValue({
      isAxiosError: true,
      i18nKey: 'errors.ERR_AUTH_LOGIN_FAILED',
    })
    await fill(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('#login-username').attributes('aria-invalid')).toBe('true')
    expect(wrapper.find('#login-password').attributes('aria-invalid')).toBe('true')
    expect(wrapper.find('#login-username').attributes('aria-describedby')).toBe('login-error')
    expect(wrapper.find('#login-error').exists()).toBe(true)
  })

  it('shows the error i18n key in an alert region when login fails', async () => {
    const { wrapper, auth } = mountView()
    vi.mocked(auth.login).mockRejectedValue({
      isAxiosError: true,
      i18nKey: 'errors.ERR_AUTH_LOGIN_FAILED',
    })
    await fill(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    const alert = wrapper.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    // oracle-safe: the generic credential key, never a field-specific message
    expect(alert.text()).toContain('errors.ERR_AUTH_LOGIN_FAILED')
    expect(push).not.toHaveBeenCalled()
  })

  it('falls back to errors.unknown when the rejection carries no i18nKey', async () => {
    const { wrapper, auth } = mountView()
    vi.mocked(auth.login).mockRejectedValue(new Error('boom'))
    await fill(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('errors.unknown')
  })

  it('marks the submit button busy while the request is in flight', async () => {
    const { wrapper, auth } = mountView()
    let resolveLogin: () => void = () => {}
    vi.mocked(auth.login).mockReturnValue(
      new Promise<void>((r) => {
        resolveLogin = r
      }),
    )
    await fill(wrapper)
    await wrapper.find('form').trigger('submit')
    const btn = wrapper.find('button[type="submit"]')
    expect(btn.attributes('aria-busy')).toBe('true')
    expect(btn.attributes('disabled')).toBeDefined()
    resolveLogin()
    await flushPromises()
    expect(wrapper.find('button[type="submit"]').attributes('aria-busy')).toBe('false')
  })

  it('toggles the password visibility control with aria-pressed', async () => {
    const { wrapper } = mountView()
    const toggle = wrapper.find('button.login__pw-toggle')
    expect(wrapper.find('#login-password').attributes('type')).toBe('password')
    expect(toggle.attributes('aria-pressed')).toBe('false')
    await toggle.trigger('click')
    expect(wrapper.find('#login-password').attributes('type')).toBe('text')
    expect(toggle.attributes('aria-pressed')).toBe('true')
  })

  it('shows a session-expired notice when redirected with reason=expired', () => {
    routeQuery = { reason: 'expired' }
    const { wrapper } = mountView()
    expect(wrapper.text()).toContain('access.login.sessionExpired')
  })
})
