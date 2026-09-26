import { expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { decodeIdentityError } from '@rss/api/identity'
import App from '../App.vue'
import { runtimeKey } from '../context'
import { identityI18n } from '../i18n'
import { identityRouter } from '../router'
import { fixture, sessionValue, TENANT } from '../../tests/support'

async function failedLogout(all = false) {
  const f = fixture(false)
  await f.login()
  f.replies.push({ sessions: [], nextCursor: null })
  const router = identityRouter(f.session)
  await router.push({ name: 'sessions', params: { tenant: TENANT } })
  await router.isReady()
  const wrapper = mount(App, {
    global: {
      plugins: [createPinia(), identityI18n(), router],
      provide: { [runtimeKey as symbol]: f },
    },
  })
  await flushPromises()
  f.replies.push(new Error('logout response lost'))
  await wrapper
    .findAll('button')
    .find((button) => button.text() === (all ? '退出全部会话' : '退出当前会话'))!
    .trigger('click')
  await flushPromises()
  expect(wrapper.get('[role=alert]').text()).toContain('尚未确认')
  return {
    ...f,
    wrapper,
    router,
    dispose() {
      wrapper.unmount()
      f.session.clear()
      router.options.history.destroy()
      vi.restoreAllMocks()
    },
  }
}

it('preserves the logout warning after a visible-page check confirms an anonymous session', async () => {
  const f = await failedLogout()
  try {
    f.replies.push(decodeIdentityError(401, { code: 'invalid_credential' }))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(f.session.state.value.status).toBe('anonymous')
    expect(f.router.currentRoute.value.name).toBe('sessions')
    expect(f.wrapper.get('[role=alert]').text()).toContain('尚未确认')
    const login = f.wrapper.findAll('a').find((link) => link.text() === '登录')!
    expect(login.attributes('href')).toBe(`/tenants/${TENANT}/login`)
    f.replies.push(decodeIdentityError(401, { code: 'invalid_credential' }))
    await login.trigger('click')
    await vi.waitFor(() => expect(f.router.currentRoute.value.name).toBe('login'))
    await flushPromises()
    expect(f.wrapper.find('#login-name').exists()).toBe(true)
    expect(f.request.mock.calls.filter(([request]) => request.method === 'POST')).toHaveLength(2)
  } finally {
    f.dispose()
  }
})

it.each([200, 401, 503])(
  'explicitly rechecks an unconfirmed logout-all after HTTP %s',
  async (status) => {
    const f = await failedLogout(true)
    try {
      const before = f.request.mock.calls.length
      f.replies.push(
        status === 200
          ? sessionValue()
          : decodeIdentityError(status, {
              code: status === 401 ? 'invalid_credential' : 'identity_unavailable',
            }),
      )
      if (status === 200) f.replies.push({ sessions: [sessionValue().session], nextCursor: null })
      await f.wrapper
        .findAll('button')
        .find((button) => button.text() === '重新读取')!
        .trigger('click')
      await flushPromises()
      expect(f.request.mock.calls[before]?.[0].path).toBe('/api/v2/tenants/{tenant}/session')
      expect(
        f.request.mock.calls.slice(before).every(([request]) => request.method === 'GET'),
      ).toBe(true)
      expect(
        f.request.mock.calls.filter(([request]) => request.path.endsWith('/logout-all')),
      ).toHaveLength(1)
      const logout = f.wrapper.findAll('button').find((button) => button.text() === '退出全部会话')!
      if (status === 200) {
        expect(f.session.state.value.status).toBe('authenticated')
        expect(logout.attributes('disabled')).toBeUndefined()
        expect(f.wrapper.findAll('tbody tr')).toHaveLength(1)
      } else {
        expect(f.session.state.value.status).toBe(status === 401 ? 'anonymous' : 'unavailable')
        expect(logout.attributes('disabled')).toBeDefined()
        expect(f.wrapper.get('[role=alert]').text()).toContain('不证明全部会话已撤销')
        expect(f.wrapper.findAll('a').some((link) => link.text() === '登录')).toBe(true)
      }
    } finally {
      f.dispose()
    }
  },
)
