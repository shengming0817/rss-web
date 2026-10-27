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
const sessions: ReturnType<typeof createSession>[] = []
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  sessions.splice(0).forEach((session) => session.clear())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})
function fixture(oidcEnabled = false) {
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
    oidcEnabled,
  })
  sessions.push(session)
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
async function click(wrapper: Pick<DOMWrapper<Element>, 'findAll'>, text: string) {
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
it('pages and reloads only the current tenant sessions and requires confirmation before signing out all sessions', async () => {
  const f = fixture(),
    otherSession = '44444444-4444-4444-8444-444444444444',
    cursor = '55555555-5555-4555-8555-555555555555'
  f.replies.push(sessionFact)
  await f.runtime.session.login(tenant, 'operator', 'Synthetic-private-password')
  f.replies.push({ sessions: [sessionFact.session], nextCursor: cursor })
  const { wrapper, router } = await view(AccountSecurityView, f, 'sessions')
  f.replies.push({ sessions: [{ ...sessionFact.session, id: otherSession }], nextCursor: null })
  await click(wrapper, '加载更多')
  expect(wrapper.findAll('tbody tr')).toHaveLength(2)
  expect(wrapper.get('tbody').text()).toContain(otherSession)
  expect(f.request.mock.lastCall?.[0]).toMatchObject({
    method: 'GET',
    path: '/api/v1/identity/tenants/{tenant}/sessions',
    pathParams: { tenant },
    query: { cursor },
  })
  f.replies.push({ sessions: [sessionFact.session], nextCursor: null })
  await click(wrapper, '重新读取')
  expect(f.request.mock.lastCall?.[0].query).toBeUndefined()
  expect(wrapper.findAll('tbody tr')).toHaveLength(1)
  expect(wrapper.get('tbody').text()).not.toContain(otherSession)
  await click(wrapper, '退出全部会话')
  await click(new DOMWrapper(document.body).get('[role=alertdialog]'), '取消')
  expect(new DOMWrapper(document.body).find('[role=alertdialog]').exists()).toBe(false)
  expect(f.runtime.session.state.value.status).toBe('authenticated')
  expect(
    f.request.mock.calls.filter(([o]) => o.path.endsWith('/sessions/logout-all')),
  ).toHaveLength(0)
  f.runtime.flows.save({ kind: 'step-up', tenant })
  await click(wrapper, '退出全部会话')
  f.replies.push(undefined)
  await click(new DOMWrapper(document.body).get('[role=alertdialog]'), '确认')
  const writes = f.request.mock.calls.filter(([o]) => o.path.endsWith('/sessions/logout-all'))
  expect(writes).toHaveLength(1)
  expect(writes[0]?.[0]).toMatchObject({
    method: 'POST',
    pathParams: { tenant },
    headers: { 'X-Identity-Request': '1', 'X-CSRF-Token': sessionFact.csrfToken },
  })
  expect(router.currentRoute.value.name).toBe('login')
  expect(f.runtime.session.state.value.status).toBe('anonymous')
  expect(wrapper.findAll('tbody tr')).toHaveLength(0)
  expect(new DOMWrapper(document.body).find('[role=alertdialog]').exists()).toBe(false)
  expect(f.runtime.flows.take()).toBeNull()
})

it('swipes to trusted authentication facts and binds OIDC controls to the chosen provider with CSRF and secret cleanup', async () => {
  const f = fixture(true),
    first = '44444444-4444-4444-8444-444444444444',
    second = '55555555-5555-4555-8555-555555555555',
    security = {
      sessionId,
      authentication: {
        source: 'local_password',
        authTime: 1760000000,
        acr: 'unspecified',
        amr: ['pwd'],
      },
      eligibleStepUpProviders: [{ providerId: first, label: 'Mock directory A' }],
    }
  f.replies.push(sessionFact)
  await f.runtime.session.login(tenant, 'operator', 'Synthetic-private-password')
  f.replies.push({ sessions: [sessionFact.session], nextCursor: null }, security, {
    providers: [
      { providerId: first, label: 'Mock directory A' },
      { providerId: second, label: 'Mock directory B' },
    ],
  })
  const { wrapper, router } = await view(AccountSecurityView, f, 'sessions')
  await wrapper
    .get('.v-window')
    .trigger('touchstart', { changedTouches: [{ clientX: 200, clientY: 20 }] })
  await wrapper
    .get('.v-window')
    .trigger('touchend', { changedTouches: [{ clientX: 20, clientY: 20 }] })
  await flushPromises()
  expect(
    wrapper
      .findAll('[role=tab]')
      .find((tab) => tab.text() === '可信认证事实')
      ?.attributes('aria-selected'),
  ).toBe('true')
  f.replies.push({
    ...security,
    authentication: { source: 'oidc', authTime: 1760000001, acr: 'mfa', amr: ['mfa', 'pwd'] },
  })
  await click(wrapper, '重新读取认证事实')
  expect(f.request.mock.lastCall?.[0]).toMatchObject({
    method: 'GET',
    path: '/api/v1/identity/tenants/{tenant}/session/security',
    pathParams: { tenant },
  })
  expect(wrapper.text()).toContain('已验证 MFA')
  expect(wrapper.text()).toContain('多因素认证 · 密码')
  f.replies.push(decodeIdentityError(403, { code: 'insufficient_privilege' }))
  await click(wrapper, '增强认证 · Mock directory A')
  expect(f.request.mock.lastCall?.[0]).toMatchObject({
    method: 'POST',
    path: `/api/v1/identity/tenants/{tenant}/oidc/${first}/step-up`,
    pathParams: { tenant },
    headers: { 'X-Identity-Request': '1', 'X-CSRF-Token': sessionFact.csrfToken },
    body: { returnTarget: 'resume' },
  })
  expect(f.runtime.flows.take()).toBeNull()
  await click(wrapper, '关联组织身份')
  await wrapper.get('#link-provider').trigger('mousedown')
  await flushPromises()
  const option = new DOMWrapper(document.body)
    .findAll('[role=option]')
    .find((item) => item.text() === 'Mock directory B')
  expect(option).toBeDefined()
  await option!.trigger('click')
  await wrapper.get('#link-password').setValue('Synthetic-link-password')
  f.replies.push(decodeIdentityError(403, { code: 'reauthentication_failed' }))
  await wrapper
    .findAll('form')
    .find((form) => form.find('#link-password').exists())!
    .trigger('submit')
  await flushPromises()
  expect(f.request.mock.lastCall?.[0]).toMatchObject({
    method: 'POST',
    path: `/api/v1/identity/tenants/{tenant}/oidc/${second}/link`,
    pathParams: { tenant },
    headers: { 'X-Identity-Request': '1', 'X-CSRF-Token': sessionFact.csrfToken },
    body: { returnTarget: 'resume', password: 'Synthetic-link-password' },
  })
  expect((wrapper.get('#link-password').element as HTMLInputElement).value).toBe('')
  expect(wrapper.text()).not.toContain('Synthetic-link-password')
  expect(f.runtime.flows.take()).toBeNull()
  expect(f.runtime.session.state.value.status).toBe('authenticated')
  expect(router.currentRoute.value.name).toBe('sessions')
})

it('continues a checked host session into its tenant and clears an unrelated recovery locator without another login', async () => {
  const f = fixture()
  f.replies.push(sessionFact)
  await f.runtime.session.login(tenant, 'operator', 'Synthetic-private-password')
  f.runtime.flows.save({ kind: 'sso', tenant: '99999999-9999-4999-8999-999999999999' })
  f.replies.push(sessionFact)
  const { wrapper, router } = await view(LoginView, f, 'login')
  expect(wrapper.find('#login-password').exists()).toBe(false)
  expect(f.request.mock.calls.find(([o]) => o.path.endsWith('/session'))?.[0]).toMatchObject({
    method: 'GET',
    pathParams: { tenant },
  })
  await click(wrapper, '继续')
  expect(router.currentRoute.value.name).toBe('sessions')
  expect(router.currentRoute.value.params['tenant']).toBe(tenant)
  expect(f.runtime.flows.take()).toBeNull()
  expect(f.request.mock.calls.filter(([o]) => o.method === 'POST')).toHaveLength(1)
  expect(f.runtime.session.state.value.session?.id).toBe(sessionId)
})
