import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { decodeIdentityError } from '@rss/api/identity'
import {
  fixture,
  sessionValue,
  securityValue,
  accountValue,
  TENANT,
  OTHER,
} from '../../tests/support'
import App from '../App.vue'
import { runtimeKey } from '../context'
import { identityI18n } from '../i18n'
import { identityRouter } from '../router'

const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose())
  vi.restoreAllMocks()
})
async function recovery() {
  window.history.replaceState(null, '', '/')
  const f = fixture()
  const value = sessionValue(false)
  value.identity.platform_administrator = true
  f.replies.push(value)
  await f.session.check(TENANT)
  const router = identityRouter(f.session)
  f.replies.push(
    { system_domain_id: TENANT, identity: value.identity },
    { tenants: [], next_cursor: null },
  )
  await router.push({ name: 'platform', params: { tenant: TENANT }, query: { operation: OTHER } })
  const wrapper = mount(App, {
    attachTo: document.body,
    global: {
      plugins: [createPinia(), identityI18n(), router],
      provide: { [runtimeKey as symbol]: f },
    },
  })
  cleanup.push(() => {
    wrapper.unmount()
    f.session.clear()
    router.options.history.destroy()
  })
  await flushPromises()
  f.replies.push({ sessions: [value.session], next_cursor: null }, securityValue())
  await wrapper
    .get('nav')
    .findAll('a')
    .find((a) => a.text() === '我的会话')!
    .trigger('click')
  await vi.waitFor(() => expect(wrapper.find('#current-password').exists()).toBe(true))
  await flushPromises()
  return { ...f, router, wrapper, value }
}
function anonymous(f: Awaited<ReturnType<typeof recovery>>) {
  f.replies.push(decodeIdentityError(401, { code: 'invalid_credential' }, false), { providers: [] })
}
async function signIn(f: Awaited<ReturnType<typeof recovery>>) {
  await vi.waitFor(() => expect(f.wrapper.find('#login-password').exists()).toBe(true))
  await flushPromises()
  f.replies.push(
    f.value,
    { system_domain_id: TENANT, identity: f.value.identity },
    { tenants: [], next_cursor: null },
  )
  await f.wrapper.get('#login-name').setValue('platform')
  await f.wrapper.get('#login-password').setValue('fixture password')
  await f.wrapper.get('form').trigger('submit')
  await vi.waitFor(() => expect(f.router.currentRoute.value.name).toBe('platform'))
  await flushPromises()
  expect(f.router.currentRoute.value.query['operation']).toBe(OTHER)
  expect(f.wrapper.find('form').exists()).toBe(false)
  expect(
    f.request.mock.calls.some(
      ([o]) => o.method === 'POST' && o.path === '/api/v1/platform/tenants',
    ),
  ).toBe(false)
}

it.each(['anonymous', 'unavailable'] as const)(
  'recovers the original operation after %s session loss on another page',
  async (status) => {
    const f = await recovery()
    if (status === 'anonymous') anonymous(f)
    f.session.clear(status)
    await vi.waitFor(() =>
      expect(f.router.currentRoute.value.name).toBe(status === 'anonymous' ? 'login' : 'error'),
    )
    await flushPromises()
    expect(f.router.currentRoute.value.query['operation']).toBe(OTHER)
    if (status === 'unavailable') {
      expect(f.router.currentRoute.value.query['tenant']).toBe(TENANT)
      anonymous(f)
      await f.wrapper.get('main a').trigger('click')
    }
    await signIn(f)
  },
)

it.each(['logout', 'logout-all', 'password'] as const)(
  'preserves recovery across explicit %s',
  async (action) => {
    const f = await recovery()
    f.replies.push(action === 'password' ? accountValue : undefined)
    anonymous(f)
    if (action === 'password') {
      await f.wrapper.get('#current-password').setValue('fixture old password')
      await f.wrapper.get('#new-password').setValue('fixture replacement password')
      await f.wrapper.get('form').trigger('submit')
    } else {
      await f.wrapper
        .findAll('button')
        .find((b) => b.text() === (action === 'logout' ? '退出当前会话' : '退出全部会话'))!
        .trigger('click')
    }
    await vi.waitFor(() => expect(f.router.currentRoute.value.name).toBe('login'))
    await flushPromises()
    expect(f.router.currentRoute.value.query['operation']).toBe(OTHER)
    await signIn(f)
  },
)

it.each([true, false])(
  'carries recovery through step-up and resume (authenticated=%s)',
  async (authenticated) => {
    const f = await recovery()
    f.replies.push({
      ...securityValue(),
      eligible_step_up_providers: [{ provider_id: OTHER, label: 'Fixture' }],
    })
    await f.session.loadSecurity()
    await flushPromises()
    let reject!: (error: unknown) => void
    vi.spyOn(f.api, 'stepUp').mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        }),
    )
    await f.wrapper
      .findAll('button')
      .find((b) => b.text().startsWith('增强认证'))!
      .trigger('click')
    await flushPromises()
    const pending = f.flows.read()!
    expect(pending.operation).toBe(OTHER)
    reject(decodeIdentityError(403, { code: 'insufficient_privilege' }, false))
    await flushPromises()
    // Restore the exact locator captured before the external IdP navigation.
    f.flows.save(pending)
    f.replies.push(
      authenticated ? f.value : decodeIdentityError(401, { code: 'invalid_credential' }, false),
    )
    if (authenticated)
      f.replies.push(
        { system_domain_id: TENANT, identity: f.value.identity },
        { tenants: [], next_cursor: null },
      )
    await f.router.push({ name: 'resume' })
    await vi.waitFor(() =>
      expect(f.router.currentRoute.value.name).toBe(authenticated ? 'platform' : 'error'),
    )
    await flushPromises()
    expect(f.router.currentRoute.value.query['operation']).toBe(OTHER)
    expect(f.flows.read()).toBeNull()
    expect(
      f.request.mock.calls.some(
        ([o]) => o.method === 'POST' && o.path === '/api/v1/platform/tenants',
      ),
    ).toBe(false)
  },
)
