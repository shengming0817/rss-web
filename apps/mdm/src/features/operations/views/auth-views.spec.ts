import { afterEach, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createApi, createFlows, createSession, runtimeKey, type Runtime } from '@rss/auth'
import {
  decodeIdentityError,
  type HttpTransport,
  type NoContentRequest,
  type RequestOptions,
} from '@rss/api/identity'
import { mdmI18n } from '../../../i18n'
import LoginView from './LoginView.vue'
import AccountSecurityView from './AccountSecurityView.vue'
const tenant = '11111111-1111-4111-8111-111111111111',
  principal = '22222222-2222-4222-8222-222222222222',
  sessionId = '33333333-3333-4333-8333-333333333333'
const sessionFact = {
  session: { id: sessionId, issuedAt: 1, idleExpiresAt: 4102444800, absoluteExpiresAt: 4102444900 },
  identity: { principalId: principal, hasLocalPassword: true },
  csrfToken: 'a'.repeat(64),
}
const wrappers: VueWrapper[] = []
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})
function fixture() {
  const replies: unknown[] = []
  const request = vi.fn(async (options: RequestOptions<unknown> | NoContentRequest) => {
    const result = options.path.endsWith('/context')
      ? {
          tenantId: tenant,
          principalId: principal,
          sessionId,
          navigation: { manageAccounts: false, manageProviders: false },
        }
      : replies.shift()
    if (result instanceof Error) throw result
    return typeof options.decode === 'function' ? options.decode(result) : undefined
  })
  const session = createSession({ request } as HttpTransport, {
    canonicalOrigin: 'https://mdm.example.test',
    oidcEnabled: false,
  })
  const values = new Map<string, string>()
  const runtime: Runtime = {
    session,
    api: createApi(session),
    flows: createFlows({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value)
      },
      removeItem: (key) => {
        values.delete(key)
      },
    }),
    hostLogin: {
      tenant,
      path: '/login',
      brand: 'RSS MDM',
      descriptionKey: 'settings.loginTenant',
      origin: 'https://mdm.example.test',
      switchHref: '/platform',
      switchLabelKey: 'settings.platformLogin',
    },
  }
  return { runtime, replies, request }
}
async function view(
  component: typeof LoginView | typeof AccountSecurityView,
  f: ReturnType<typeof fixture>,
  target: 'login' | 'sessions',
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'login', component: { template: '<div/>' } },
      { path: '/tenants/:tenant/sessions', name: 'sessions', component: { template: '<div/>' } },
    ],
  })
  await router.push({ name: target, ...(target === 'sessions' ? { params: { tenant } } : {}) })
  const wrapper = mount(component, {
    attachTo: document.body,
    global: { plugins: [router, mdmI18n()], provide: { [runtimeKey as symbol]: f.runtime } },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper, router }
}
async function click(wrapper: VueWrapper | DOMWrapper<Element>, text: string) {
  const button = wrapper.findAll('button').find((b) => b.text() === text)
  expect(button).toBeDefined()
  await button!.trigger('click')
  await flushPromises()
}
it('uses the shared login owner and clears a submitted secret while keeping platform navigation on the login page', async () => {
  const f = fixture()
  f.replies.push(decodeIdentityError(401, { code: 'invalid_credential' }))
  const { wrapper } = await view(LoginView, f, 'login')
  await wrapper.get('#login-name').setValue('operator')
  await wrapper.get('#login-password').setValue('Synthetic-private-password')
  f.replies.push(decodeIdentityError(401, { code: 'invalid_credential' }))
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect((wrapper.get('#login-password').element as HTMLInputElement).value).toBe('')
  expect(f.request.mock.calls.find(([o]) => o.method === 'POST')?.[0].body).toEqual({
    login: 'operator',
    password: 'Synthetic-private-password',
  })
  expect(wrapper.find('a[href="/platform"]').exists()).toBe(true)
  expect(wrapper.find('[role=alert]').exists()).toBe(true)
  expect(wrapper.text()).not.toContain('Synthetic-private-password')
})
it('clears security form secrets on visibility and tab changes and retains an unconfirmed logout without replaying it', async () => {
  const f = fixture()
  f.replies.push(sessionFact)
  await f.runtime.session.login(tenant, 'operator', 'Synthetic-private-password')
  f.replies.push({ sessions: [sessionFact.session], nextCursor: null })
  const { wrapper, router } = await view(AccountSecurityView, f, 'sessions')
  await click(wrapper, '可信认证事实')
  await click(wrapper, '修改密码')
  await wrapper.get('#current-password').setValue('Synthetic-current-password')
  await wrapper.get('#new-password').setValue('Synthetic-new-password')
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  document.dispatchEvent(new Event('visibilitychange'))
  await flushPromises()
  expect((wrapper.get('#current-password').element as HTMLInputElement).value).toBe('')
  expect((wrapper.get('#new-password').element as HTMLInputElement).value).toBe('')
  await wrapper.get('#current-password').setValue('Synthetic-current-password')
  await click(wrapper, '我的会话')
  expect((wrapper.get('#current-password').element as HTMLInputElement).value).toBe('')
  f.replies.push(new Error('Synthetic lost logout response'))
  await click(wrapper, '退出当前会话')
  expect(f.runtime.session.logoutOutcome.value).toBe('unconfirmed')
  expect(router.currentRoute.value.name).toBe('sessions')
  expect(wrapper.text()).toContain('尚未确认')
  expect(wrapper.find('a[href="/platform"]').exists()).toBe(false)
  expect(f.request.mock.calls.filter(([o]) => o.path.endsWith('/session/logout'))).toHaveLength(1)
  f.runtime.session.clear()
})
