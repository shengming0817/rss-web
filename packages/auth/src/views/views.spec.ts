import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, DOMWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { Component } from 'vue'
import { decodeIdentityError } from '@rss/api/identity'
import { runtimeKey } from '../context'
import { identityI18n } from '../i18n'
import {
  fixture,
  sessionValue,
  securityValue,
  accountValue,
  providerValue,
  TENANT,
  ID,
  OTHER,
} from '../../tests/support'
import App from '../App.vue'
import LoginView from './LoginView.vue'
import SessionsView from './SessionsView.vue'
import AccountsView from './AccountsView.vue'
import ProvidersView from './ProvidersView.vue'
import ErrorView from './ErrorView.vue'
import LocalProfileEditor from './LocalProfileEditor.vue'
async function view(
  component: Component,
  f: ReturnType<typeof fixture>,
  name = 'sessions',
  query: Record<string, string> = {},
  sessionProviders: { providerId: string; label: string }[] = [],
  locale = 'zh-CN',
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      ...['login', 'sessions', 'accounts', 'providers', 'workspace'].map((name) => ({
        path: `/tenants/:tenant/${name}`,
        name,
        component: { template: '<div/>' },
      })),
      ...['resume'].map((name) => ({
        path: `/auth/${name}`,
        name,
        component: { template: '<div/>' },
      })),
      { path: '/auth/error', name: 'error', component: { template: '<div/>' } },
    ],
  })
  await router.push(
    ['error', 'resume'].includes(name)
      ? { name, query }
      : { name, params: { tenant: TENANT }, query },
  )
  await router.isReady()
  if (component === SessionsView && f.session.config.oidcEnabled)
    f.replies.push(securityValue(), { providers: sessionProviders })
  const i18n = identityI18n()
  i18n.global.locale.value = locale as 'zh-CN' | 'en-US'
  const wrapper = mount(component, {
    attachTo: document.body,
    global: {
      plugins: [createPinia(), i18n, router],
      provide: { [runtimeKey as symbol]: f },
    },
  })
  await flushPromises()
  return { wrapper, router }
}
describe('Identity views use actual app session and decoder modules', () => {
  it('shows host-managed accounts without assigning component roles', async () => {
    const f = fixture()
    await f.login()
    f.replies.push({ accounts: [accountValue], nextCursor: null })
    const accounts = await view(AccountsView, f, 'accounts')
    expect(accounts.wrapper.find('#account-role').exists()).toBe(false)
    expect(accounts.wrapper.findAll('button').some((v) => v.text() === '授予管理员')).toBe(false)
    accounts.wrapper.unmount()
    f.session.clear()
  })
  it('clears the login password immediately, reports a safe failure and completes sign-in', async () => {
    const f = fixture()
    f.replies.push(decodeIdentityError(401, { code: 'invalid_credential' }), {
      providers: [],
    })
    const { wrapper, router } = await view(LoginView, f, 'login', { reason: 'expired' })
    expect(wrapper.get('#login-name').attributes('autocomplete')).toBe('username')
    await wrapper.get('#login-name').setValue('admin')
    await wrapper.get('#login-password').setValue('private password')
    f.replies.push(decodeIdentityError(401, { code: 'invalid_credential' }))
    await wrapper.get('form').trigger('submit')
    expect((wrapper.get('#login-password').element as HTMLInputElement).value).toBe('')
    await flushPromises()
    expect(wrapper.find('[role=alert]').exists()).toBe(true)
    await wrapper.get('#login-password').setValue('private password')
    f.replies.push(sessionValue())
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('sessions')
    wrapper.unmount()
  })
  it('keeps SSO failures bounded and provides no raw upstream error', async () => {
    const f = fixture()
    f.replies.push(decodeIdentityError(401, { code: 'invalid_credential' }), {
      providers: [{ providerId: OTHER, label: 'Organization' }],
    })
    const { wrapper } = await view(LoginView, f, 'login')
    f.replies.push(new Error('private upstream body'))
    await wrapper.findAll('button').at(-1)!.trigger('click')
    await flushPromises()
    expect(f.flows.read()).toBeNull()
    expect(wrapper.text()).not.toContain('private upstream body')
    wrapper.unmount()
  })
  it('loads session pages, changes own password and returns to login', async () => {
    const f = fixture()
    await f.login()
    f.replies.push({ sessions: [sessionValue().session], nextCursor: ID })
    const { wrapper, router } = await view(SessionsView, f)
    expect(wrapper.text()).toContain(ID)
    f.replies.push({ sessions: [], nextCursor: null })
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('加载更多'))!
      .trigger('click')
    await flushPromises()
    await wrapper.get('#current-password').setValue('private old password')
    await wrapper.get('#new-password').setValue('private new password')
    f.replies.push({ ...accountValue, principalId: ID })
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
    wrapper.unmount()
  })
  it('revokes current or all sessions explicitly', async () => {
    for (const label of ['退出当前会话', '退出全部会话']) {
      const f = fixture()
      await f.login()
      f.replies.push({ sessions: [], nextCursor: null })
      const { wrapper, router } = await view(SessionsView, f)
      f.replies.push(undefined)
      await wrapper
        .findAll('button')
        .find((b) => b.text() === label)!
        .trigger('click')
      if (label === '退出全部会话') {
        await flushPromises()
        await new DOMWrapper(document.body)
          .get('[role=alertdialog]')
          .findAll('button')
          .find((b) => b.text() === '确认')!
          .trigger('click')
      }
      await flushPromises()
      await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
      wrapper.unmount()
    }
  })
  it('keeps failed logout visible without navigating or replaying the write', async () => {
    for (const all of [false, true]) {
      for (const failure of [
        decodeIdentityError(503, { code: 'identity_unavailable' }),
        new Error('gateway response unavailable'),
      ]) {
        const f = fixture()
        await f.login()
        f.replies.push({ sessions: [], nextCursor: null })
        const { wrapper, router } = await view(SessionsView, f)
        f.replies.push(failure)
        const label = all ? '退出全部会话' : '退出当前会话'
        await wrapper
          .findAll('button')
          .find((b) => b.text() === label)!
          .trigger('click')
        if (label === '退出全部会话') {
          await flushPromises()
          await new DOMWrapper(document.body)
            .get('[role=alertdialog]')
            .findAll('button')
            .find((b) => b.text() === '确认')!
            .trigger('click')
        }
        await flushPromises()
        expect(router.currentRoute.value.name).toBe('sessions')
        expect(wrapper.get('[role=alert]').text()).toMatch(/不能作为成功|尚未确认/)
        expect(f.session.state.value.status).not.toBe('authenticated')
        expect(
          wrapper
            .findAll('button')
            .find((b) => b.text() === label)!
            .attributes('disabled'),
        ).toBeDefined()
        const path = all ? '/sessions/logout-all' : '/session/logout'
        expect(f.request.mock.calls.filter(([r]) => r.path.endsWith(path))).toHaveLength(1)
        wrapper.unmount()
      }
    }
  })
  it('keeps the protected App route until logout is confirmed', async () => {
    for (const all of [false, true]) {
      for (const failure of [
        undefined,
        decodeIdentityError(503, { code: 'identity_unavailable' }),
        new Error('gateway unavailable'),
      ]) {
        const f = fixture(false)
        await f.login()
        f.replies.push({ sessions: [], nextCursor: null })
        const router = createRouter({
          history: createMemoryHistory(),
          routes: [
            {
              path: '/tenants/:tenant/sessions',
              name: 'sessions',
              component: SessionsView,
              meta: { protected: true },
            },
            ...['login', 'accounts', 'providers'].map((name) => ({
              path: `/tenants/:tenant/${name}`,
              name,
              component: { template: '<div />' },
            })),
            { path: '/auth/error', name: 'error', component: { template: '<div />' } },
          ],
        })
        await router.push({ name: 'sessions', params: { tenant: TENANT } })
        await router.isReady()
        const wrapper = mount(App, {
          attachTo: document.body,
          global: {
            plugins: [createPinia(), identityI18n(), router],
            provide: { [runtimeKey as symbol]: f },
          },
        })
        await flushPromises()
        let settle!: () => void
        f.replies.push(
          () =>
            new Promise((resolve, reject) => {
              settle = () => (failure ? reject(failure) : resolve(undefined))
            }),
        )
        const label = all ? '退出全部会话' : '退出当前会话'
        await wrapper
          .findAll('button')
          .find((b) => b.text() === label)!
          .trigger('click')
        if (label === '退出全部会话') {
          await flushPromises()
          await new DOMWrapper(document.body)
            .get('[role=alertdialog]')
            .findAll('button')
            .find((b) => b.text() === '确认')!
            .trigger('click')
        }
        await flushPromises()
        expect(router.currentRoute.value.name).toBe('sessions')
        expect(f.session.state.value.status).not.toBe('authenticated')
        settle()
        await flushPromises()
        expect(router.currentRoute.value.name).toBe(failure ? 'sessions' : 'login')
        if (failure) expect(wrapper.get('[role=alert]').text()).toMatch(/不能作为成功|尚未确认/)
        const path = all ? '/sessions/logout-all' : '/session/logout'
        expect(f.request.mock.calls.filter(([r]) => r.path.endsWith(path))).toHaveLength(1)
        wrapper.unmount()
      }
    }
  })
  it('keeps ordinary members outside management UI', async () => {
    const f = fixture()
    await f.login(false)
    for (const component of [AccountsView, ProvidersView]) {
      const { wrapper } = await view(component, f)
      expect(wrapper.find('form').exists()).toBe(false)
      expect(wrapper.text()).toContain('权限')
      wrapper.unmount()
    }
  })
  it('creates accounts, confirms status changes and resets other passwords', async () => {
    const f = fixture()
    await f.login()
    f.replies.push({
      accounts: [accountValue],
      nextCursor: OTHER,
    })
    const { wrapper } = await view(AccountsView, f, 'accounts')
    f.replies.push({ accounts: [], nextCursor: null })
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '加载更多')!
      .trigger('click')
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '创建本地账户')!
      .trigger('click')
    await flushPromises()
    await new DOMWrapper(document.body).get('#account-login').setValue('newmember')
    await new DOMWrapper(document.body).get('#account-password').setValue('private new password')
    f.replies.push(accountValue, {
      accounts: [accountValue],
      nextCursor: null,
    })
    await new DOMWrapper(document.body).get('[role=dialog] form').trigger('submit')
    await flushPromises()
    await vi.waitFor(() =>
      expect(new DOMWrapper(document.body).find('#account-password').exists()).toBe(false),
    )
    for (const label of ['停用账户', '停用成员']) {
      await wrapper
        .findAll('button')
        .find((b) => b.text() === label)!
        .trigger('click')
      if (label === '退出全部会话') {
        await flushPromises()
        await new DOMWrapper(document.body)
          .get('[role=alertdialog]')
          .findAll('button')
          .find((b) => b.text() === '确认')!
          .trigger('click')
      }
      await flushPromises()
      f.replies.push(accountValue, {
        accounts: [accountValue],
        nextCursor: null,
      })
      await new DOMWrapper(document.body)
        .get('[role=alertdialog]')
        .findAll('button')
        .find((b) => b.text() === '确认')!
        .trigger('click')
      await flushPromises()
    }
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '重置密码')!
      .trigger('click')
    await flushPromises()
    await new DOMWrapper(document.body).get('#reset-password').setValue('private reset password')
    f.replies.push(accountValue, {
      accounts: [accountValue],
      nextCursor: null,
    })
    await new DOMWrapper(document.body).get('[role=dialog] form').trigger('submit')
    await flushPromises()
    await vi.waitFor(() =>
      expect(new DOMWrapper(document.body).find('#reset-password').exists()).toBe(false),
    )
    wrapper.unmount()
  })
  it('edits, tests and enables IdPs through versioned writes', async () => {
    const departmentSnapshot = { claim: 'organization_snapshot', maxAgeSeconds: 120 }
    const configuredProvider = {
      ...providerValue,
      settings: {
        ...providerValue.settings,
        claims: {
          ...providerValue.settings.claims,
          subject: { kind: 'entra', tenant: ID },
          departmentSnapshot,
        },
      },
    }
    const f = fixture()
    await f.login()
    f.replies.push({ providers: [configuredProvider] })
    const { wrapper } = await view(ProvidersView, f, 'providers')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '编辑')!
      .trigger('click')
    await new DOMWrapper(document.body).get('#client-id').setValue('updated')
    f.replies.push(
      { ...configuredProvider, version: 2 },
      { providers: [{ ...configuredProvider, version: 2 }] },
    )
    await new DOMWrapper(document.body).get('[role=dialog] form').trigger('submit')
    await flushPromises()
    expect(f.request.mock.calls.findLast(([r]) => r.method === 'PUT')?.[0].body).toMatchObject({
      settings: {
        clientId: 'updated',
        claims: { subject: { kind: 'entra', tenant: ID }, departmentSnapshot },
      },
    })
    f.replies.push({
      passed: true,
      report: {
        checks: ['binding', 'discovery', 'jwks'],
        tlsVerified: true,
        authorizationResponseIssuer: true,
      },
    })
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '测试连接')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('连接测试通过')
    f.replies.push({
      passed: false,
      diagnostic: { stage: 'binding', reason: 'invalid_trust_anchor' },
    })
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '测试连接')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('invalid_trust_anchor')
    f.replies.push(
      { ...configuredProvider, enabled: true, version: 3 },
      { providers: [{ ...configuredProvider, enabled: true, version: 3 }] },
    )
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '启用身份提供方')!
      .trigger('click')
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '新增身份提供方')!
      .trigger('click')
    await flushPromises()
    await new DOMWrapper(document.body).get('#issuer').setValue('https://second.test')
    await new DOMWrapper(document.body).get('#client-id').setValue('second')
    await new DOMWrapper(document.body).get('#client-secret').setValue('second@1')
    f.replies.push(configuredProvider, { providers: [configuredProvider] })
    await new DOMWrapper(document.body).get('[role=dialog] form').trigger('submit')
    await flushPromises()
    expect(
      f.request.mock.calls.findLast(
        ([r]) => r.method === 'POST' && r.path.endsWith('/providers'),
      )?.[0].body,
    ).toMatchObject({
      settings: { clientId: 'second', claims: { departmentSnapshot: null } },
    })
    wrapper.unmount()
  })
  it('clears pending continuation on safe error pages', async () => {
    const f = fixture()
    f.flows.save({ kind: 'sso', tenant: TENANT })
    const { wrapper } = await view(ErrorView, f, 'error', {
      reason: 'cancelled',
      error_description: 'private raw error',
    })
    expect(wrapper.text()).toContain('登录已取消')
    expect(wrapper.text()).not.toContain('private raw error')
    expect(f.flows.read()).toBeNull()
    wrapper.unmount()
  })
})

it('routes an expired resume locator to the error page without a write', async () => {
  const f = fixture()
  f.flows.save({ kind: 'sso', tenant: TENANT })
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 300001)
  const { wrapper, router } = await view(LoginView, f, 'resume')
  clock.mockRestore()
  expect(router.currentRoute.value.name).toBe('error')
  expect(f.flows.read()).toBeNull()
  expect(f.request).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('requires confirmation before revoking a provider and its sessions', async () => {
  const f = fixture()
  await f.login()
  f.replies.push({ providers: [{ ...providerValue, enabled: true }] })
  const { wrapper } = await view(ProvidersView, f, 'providers')
  const count = f.request.mock.calls.length
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '停用身份提供方')!
    .trigger('click')
  expect(f.request).toHaveBeenCalledTimes(count)
  expect(new DOMWrapper(document.body).get('[role=alertdialog]').text()).toContain(
    '已有联合会话将失效',
  )
  f.replies.push(providerValue, { providers: [providerValue] })
  await new DOMWrapper(document.body)
    .get('[role=alertdialog]')
    .findAll('button')
    .find((b) => b.text() === '确认')!
    .trigger('click')
  await flushPromises()
  expect(f.request.mock.calls.at(-2)?.[0].body).toEqual({ expectedVersion: 1, enabled: false })
  wrapper.unmount()
})

it('keeps the provider editor closed during initial read and opens it explicitly afterwards', async () => {
  const f = fixture()
  await f.login()
  let finish!: (value: unknown) => void
  f.replies.push(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const { wrapper } = await view(ProvidersView, f, 'providers')
  const create = () => wrapper.findAll('button').find((b) => b.text() === '新增身份提供方')!
  expect(create().attributes('disabled')).toBeDefined()
  expect(new DOMWrapper(document.body).find('#issuer').exists()).toBe(false)
  finish({ providers: [] })
  await flushPromises()
  ;(create().element as HTMLButtonElement).focus()
  const opener = create().element
  await create().trigger('click')
  await flushPromises()
  const body = new DOMWrapper(document.body)
  await body.get('#issuer').setValue('https://new.example.test')
  await body.get('#client-id').setValue('new-client')
  await body.get('#client-secret').setValue('new-secret@1')
  expect((body.get('#client-secret').element as HTMLInputElement).value).toBe('new-secret@1')
  await body.get('[role=dialog] button[aria-label="取消"]').trigger('click')
  await flushPromises()
  await vi.waitFor(() => expect(document.activeElement).toBe(opener))
  await create().trigger('click')
  await flushPromises()
  expect((body.get('#client-secret').element as HTMLInputElement).value).toBe('')
  wrapper.unmount()
  f.session.clear()
})

it('clears prior-owner rows, pagination and password drafts when visibility rechecks another account', async () => {
  const f = fixture()
  await f.login()
  f.replies.push({ sessions: [sessionValue().session], nextCursor: ID })
  const { wrapper } = await view(SessionsView, f)
  await wrapper.get('#current-password').setValue('old owner password')
  await wrapper.get('#new-password').setValue('old owner new password')
  const changed = sessionValue()
  changed.identity.principalId = OTHER
  changed.session.id = OTHER
  f.replies.push(
    changed,
    { sessions: [changed.session], nextCursor: null },
    { ...securityValue(), sessionId: OTHER },
    { providers: [] },
  )
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  document.dispatchEvent(new Event('visibilitychange'))
  await flushPromises()
  expect(wrapper.get('tbody').text()).not.toContain(ID)
  expect(wrapper.get('tbody').text()).toContain(OTHER)
  expect(wrapper.findAll('button').some((b) => b.text() === '加载更多')).toBe(false)
  expect((wrapper.get('#current-password').element as HTMLInputElement).value).toBe('')
  expect((wrapper.get('#new-password').element as HTMLInputElement).value).toBe('')
  wrapper.unmount()
  f.session.clear()
  vi.restoreAllMocks()
})

it('discards an old owner list completion and reloads after the pending read settles', async () => {
  const f = fixture()
  await f.login()
  f.replies.push({ sessions: [sessionValue().session], nextCursor: ID })
  const { wrapper } = await view(SessionsView, f)
  let finish!: (page: {
    sessions: ReturnType<typeof sessionValue>['session'][]
    next: string | null
  }) => void
  vi.spyOn(f.api, 'sessions').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '加载更多')!
    .trigger('click')
  f.session.clear()
  await flushPromises()
  expect(wrapper.get('tbody').text()).toBe('')
  const changed = sessionValue()
  changed.identity.principalId = OTHER
  changed.session.id = OTHER
  f.replies.push(
    changed,
    { sessions: [changed.session], nextCursor: null },
    { ...securityValue(), sessionId: OTHER },
    { providers: [] },
  )
  await f.session.check(TENANT)
  finish({ sessions: [sessionValue().session], next: ID })
  await flushPromises()
  expect(wrapper.get('tbody').text()).toContain(OTHER)
  expect(wrapper.get('tbody').text()).not.toContain(ID)
  expect(wrapper.findAll('button').some((b) => b.text() === '加载更多')).toBe(false)
  wrapper.unmount()
  f.session.clear()
  vi.restoreAllMocks()
})

it('offers provider linking without a local password for an SSO account', async () => {
  const f = fixture()
  f.replies.push({ ...sessionValue(), identity: { principalId: ID, hasLocalPassword: false } })
  await f.session.check(TENANT)
  f.replies.push({ sessions: [], nextCursor: null })
  const { wrapper } = await view(SessionsView, f, 'sessions', {}, [
    { providerId: OTHER, label: 'Second provider' },
  ])
  expect(wrapper.find('#link-provider').exists()).toBe(true)
  expect(wrapper.find('#link-password').exists()).toBe(false)
  wrapper.unmount()
  f.session.clear()
})

it.each([
  [false, false, true],
  [false, true, true],
  [true, false, true],
  [true, true, true],
  [false, true, false],
  [true, true, false],
])(
  'renders independent account=%s and provider=%s hints with OIDC=%s',
  async (accounts, providers, oidc) => {
    const f = fixture(oidc)
    f.contextReplies.push({
      tenantId: TENANT,
      principalId: ID,
      sessionId: ID,
      navigation: { manageAccounts: accounts, manageProviders: providers },
    })
    await f.login()
    const { wrapper } = await view(App, f)
    try {
      expect(wrapper.find(`nav a[href="/tenants/${TENANT}/accounts"]`).exists()).toBe(accounts)
      expect(wrapper.find(`nav a[href="/tenants/${TENANT}/providers"]`).exists()).toBe(
        providers && oidc,
      )
      f.session.clear()
      await flushPromises()
      expect(wrapper.find('nav').exists()).toBe(false)
    } finally {
      wrapper.unmount()
      f.session.clear()
    }
  },
)

it('clears both password drafts but retains the session after an incorrect current password', async () => {
  const f = fixture()
  await f.login()
  f.replies.push({ sessions: [], nextCursor: null })
  const { wrapper, router } = await view(SessionsView, f)
  try {
    await wrapper.get('#current-password').setValue('wrong private password')
    await wrapper.get('#new-password').setValue('new private password')
    const count = f.request.mock.calls.length
    f.replies.push(decodeIdentityError(403, { code: 'reauthentication_failed' }))
    await wrapper.get('form').trigger('submit')
    expect((wrapper.get('#current-password').element as HTMLInputElement).value).toBe('')
    expect((wrapper.get('#new-password').element as HTMLInputElement).value).toBe('')
    await flushPromises()
    expect(f.request).toHaveBeenCalledTimes(count + 1)
    expect(f.session.state.value.status).toBe('authenticated')
    expect(router.currentRoute.value.name).toBe('sessions')
    expect(wrapper.get('[role=alert]').text()).toContain('当前密码不正确')
  } finally {
    wrapper.unmount()
    f.session.clear()
  }
})

it('shows a manual navigation retry without hiding the accepted session', async () => {
  const f = fixture()
  f.contextReplies.push(decodeIdentityError(503, { code: 'identity_unavailable' }))
  await f.login()
  const { wrapper } = await view(App, f)
  expect(wrapper.text()).toContain('管理导航暂时不可用')
  expect(wrapper.findAll('nav a')).toHaveLength(1)
  const retry = wrapper.findAll('button').find((button) => button.text() === '重试导航')
  expect(retry).toBeDefined()
  await retry!.trigger('click')
  await flushPromises()
  expect(wrapper.text()).not.toContain('管理导航暂时不可用')
  expect(wrapper.findAll('nav a')).toHaveLength(3)
  wrapper.unmount()
  f.session.clear()
})

it.each([
  {
    component: AccountsView,
    name: 'accounts',
    response: { accounts: [accountValue], nextCursor: null },
    text: 'member',
  },
  {
    component: ProvidersView,
    name: 'providers',
    response: { providers: [providerValue] },
    text: providerValue.settings.issuer,
  },
])(
  'keeps $name unread until an explicit load after navigation recovery',
  async ({ component, name, response, text }) => {
    const f = fixture()
    f.contextReplies.push(decodeIdentityError(503, { code: 'identity_unavailable' }))
    await f.login()
    const before = f.request.mock.calls.length
    const { wrapper } = await view(component, f, name)
    try {
      expect(wrapper.text()).not.toContain('当前账户没有执行此操作的权限')
      expect(wrapper.text()).toContain('管理导航暂时不可用')
      expect(wrapper.find('table').exists()).toBe(false)
      expect(f.request).toHaveBeenCalledTimes(before)
      await f.session.loadContext()
      await flushPromises()
      expect(wrapper.text()).toContain('列表尚未加载')
      expect(wrapper.find('table').exists()).toBe(false)
      expect(f.request).toHaveBeenCalledTimes(before + 1)
      f.replies.push(response)
      await wrapper
        .findAll('button')
        .find((button) => button.text() === '加载列表')!
        .trigger('click')
      await flushPromises()
      expect(wrapper.text()).not.toContain('列表尚未加载')
      expect(wrapper.get('tbody').text()).toContain(text)
      expect(wrapper.find('form').exists()).toBe(false)
      expect(
        wrapper
          .findAll('button')
          .some((button) => /创建本地账户|新增身份提供方/.test(button.text())),
      ).toBe(true)
      expect(f.request).toHaveBeenCalledTimes(before + 2)
      expect(f.session.state.value.status).toBe('authenticated')
    } finally {
      wrapper.unmount()
      f.session.clear()
    }
  },
)

it.each([
  {
    component: AccountsView,
    name: 'accounts',
    response: { accounts: [accountValue], nextCursor: null },
    row: accountValue.login,
    open: '创建本地账户',
    field: '#account-login',
    secret: '#account-password',
  },
  {
    component: ProvidersView,
    name: 'providers',
    response: { providers: [providerValue] },
    row: providerValue.settings.issuer,
    open: '编辑',
    field: '#client-id',
    secret: '#client-secret',
  },
])(
  'preserves $name drafts during context reads and activity renewal, but clears a changed owner',
  async (entry) => {
    const f = fixture()
    await f.login()
    const nearExpiry = sessionValue()
    nearExpiry.session.idleExpiresAt = Math.floor(Date.now() / 1000) + 60
    f.replies.push(nearExpiry)
    await f.session.check(TENANT)
    f.replies.push(entry.response)
    const { wrapper } = await view(entry.component, f, entry.name)
    try {
      await wrapper
        .findAll('button')
        .find((b) => b.text() === entry.open)!
        .trigger('click')
      await flushPromises()
      const body = () => new DOMWrapper(document.body)
      await body().get(entry.field).setValue('Unsubmitted draft')
      await body().get(entry.secret).setValue('Synthetic unsubmitted secret')
      const expectDraft = () => {
        expect(wrapper.get('tbody').text()).toContain(entry.row)
        expect((body().get(entry.field).element as HTMLInputElement).value).toBe(
          'Unsubmitted draft',
        )
        expect((body().get(entry.secret).element as HTMLInputElement).value).toBe(
          'Synthetic unsubmitted secret',
        )
      }
      await f.session.loadContext()
      await flushPromises()
      expectDraft()
      f.replies.push(sessionValue(true, 'b'.repeat(64)))
      await f.session.activity()
      await flushPromises()
      expect(
        f.request.mock.calls.filter(([o]) => o.path.endsWith('/session/refresh')),
      ).toHaveLength(1)
      expectDraft()
      f.replies.push({
        ...sessionValue(),
        identity: { ...sessionValue().identity, principalId: OTHER },
        session: { ...sessionValue().session, id: OTHER },
      })
      await f.session.login(OTHER, 'other-owner', 'Synthetic login secret')
      await flushPromises()
      await vi.waitFor(() => expect(body().find(entry.field).exists()).toBe(false))
      expect(wrapper.find('tbody').exists()).toBe(false)
    } finally {
      wrapper.unmount()
      f.session.clear()
    }
  },
)

it.each(['login', 'continue', 'resume'])('uses the app landing route after %s', async (mode) => {
  const f = Object.assign(fixture(), {
    landingTarget: (tenant: string) => ({ name: 'workspace', params: { tenant } }),
  })
  if (mode === 'resume') f.flows.save({ kind: 'sso', tenant: TENANT })
  f.replies.push(
    mode === 'login' ? decodeIdentityError(401, { code: 'invalid_credential' }) : sessionValue(),
  )
  if (mode !== 'resume') f.replies.push({ providers: [] })
  const { wrapper, router } = await view(LoginView, f, mode === 'resume' ? 'resume' : 'login')
  if (mode === 'login') {
    await wrapper.get('#login-name').setValue('user')
    await wrapper.get('#login-password').setValue('secret')
    f.replies.push(sessionValue())
    await wrapper.get('form').trigger('submit')
  } else if (mode === 'continue') await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.name).toBe('workspace')
  wrapper.unmount()
  f.session.clear()
})

it('does not revoke sessions until logout-all is confirmed', async () => {
  const f = fixture(false)
  await f.login()
  f.replies.push({ sessions: [], nextCursor: null })
  const { wrapper } = await view(SessionsView, f)
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '退出全部会话')!
    .trigger('click')
  await flushPromises()
  expect(f.request.mock.calls.filter(([r]) => r.path.endsWith('/logout-all'))).toHaveLength(0)
  await new DOMWrapper(document.body)
    .get('[role=alertdialog] button[aria-label="取消"]')
    .trigger('click')
  await flushPromises()
  expect(f.request.mock.calls.filter(([r]) => r.path.endsWith('/logout-all'))).toHaveLength(0)
  expect(f.session.state.value.status).toBe('authenticated')
  wrapper.unmount()
  f.session.clear()
})

it('recovers a lost local-profile write by receipt and clears values after permission withdrawal', async () => {
  const f = fixture()
  await f.login()
  const local = {
    displayName: 'Person',
    username: null,
    email: null,
    extensions: { remote: false },
    maxAgeSeconds: 14400,
  }
  f.replies.push({ revision: 1, value: local })
  const component = {
    components: { LocalProfileEditor },
    template: `<LocalProfileEditor principal-id="${ID}" />`,
  }
  const { wrapper } = await view(component, f, 'accounts')
  await wrapper.get('#local-display').setValue('Changed')
  const beforeContext = f.request.mock.calls.length
  await f.session.loadContext()
  await flushPromises()
  expect((wrapper.get('#local-display').element as HTMLInputElement).value).toBe('Changed')
  expect(f.request).toHaveBeenCalledTimes(beforeContext + 1)
  f.replies.push(new Error('response lost'))
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect((wrapper.get('#local-display').element as HTMLInputElement).value).toBe('')
  expect(wrapper.get('#local-display').attributes('disabled')).toBeDefined()
  const write = f.request.mock.calls.findLast(([o]) => o.method === 'PUT')![0]
  const operation = (write.body as { operationId: string }).operationId
  f.replies.push(
    { operationId: operation, revision: 2 },
    { revision: 2, value: { ...local, displayName: 'Changed' } },
  )
  await wrapper
    .findAll('button')
    .find((v) => v.text() === '查询原操作')!
    .trigger('click')
  await flushPromises()
  expect((wrapper.get('#local-display').element as HTMLInputElement).value).toBe('Changed')
  expect(f.request.mock.calls.filter(([o]) => o.method === 'PUT')).toHaveLength(1)
  f.replies.push(decodeIdentityError(403, { code: 'insufficient_privilege' }))
  await wrapper
    .findAll('button')
    .find((v) => v.text() === '重新读取')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.find('#local-display').exists()).toBe(false)
  wrapper.unmount()
  f.session.clear()
})

it('preserves empty local fields and explicitly recovers an uncommitted unknown operation', async () => {
  const f = fixture()
  await f.login()
  const local = { displayName: '', username: null, email: '', extensions: {}, maxAgeSeconds: 14400 }
  f.replies.push({ revision: 1, value: local })
  const component = {
    components: { LocalProfileEditor },
    template: `<LocalProfileEditor principal-id="${ID}" />`,
  }
  const { wrapper } = await view(component, f, 'accounts')
  await wrapper.get('#local-extensions').setValue('{"remote":false}')
  f.replies.push(new Error('request lost'))
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  const writes = () => f.request.mock.calls.filter(([r]) => r.method === 'PUT')
  expect((writes()[0]![0].body as { value: unknown }).value).toEqual({
    ...local,
    extensions: { remote: false },
  })
  f.replies.push(null)
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '查询原操作')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.get('#local-display').attributes('disabled')).toBeDefined()
  f.replies.push({ revision: 1, value: local })
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '重新读取')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.get('#local-display').attributes('disabled')).toBeDefined()
  expect(writes()).toHaveLength(1)
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '已比较，重新编辑')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.get('#local-display').attributes('disabled')).toBeUndefined()
  expect((wrapper.get('#local-display').element as HTMLInputElement).value).toBe('')
  expect((wrapper.get('#local-display-missing').element as HTMLInputElement).checked).toBe(false)
  expect((wrapper.get('#local-username-missing').element as HTMLInputElement).checked).toBe(true)
  expect(writes()).toHaveLength(1)
  wrapper.unmount()
  f.session.clear()
})

it('shows the server recovery time in each locale, clears passwords and waits for explicit resubmission', async () => {
  for (const locale of ['zh-CN', 'en-US']) {
    const f = fixture(false)
    f.replies.push(decodeIdentityError(401, { code: 'invalid_credential' }))
    const { wrapper } = await view(LoginView, f, 'login', {}, [], locale)
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    try {
      await wrapper.get('#login-name').setValue('admin')
      await wrapper.get('#login-password').setValue('private password')
      f.replies.push(decodeIdentityError(429, { code: 'rate_limited' }, '537'))
      const requests = f.request.mock.calls.length
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect((wrapper.get('#login-password').element as HTMLInputElement).value).toBe('')
      expect(wrapper.get('[role=alert]').text()).toContain(
        new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium' }).format(
          now + 537_000,
        ),
      )
      expect(wrapper.get('[role=alert]').text()).toContain(
        locale === 'zh-CN' ? '最早可于' : 'Try again at or after',
      )
      clock.mockReturnValue(now + 600_000)
      await flushPromises()
      expect(f.request.mock.calls).toHaveLength(requests + 1)
      expect(f.session.state.value.status).toBe('anonymous')
      await wrapper.get('#login-password').setValue('new private password')
      f.replies.push(decodeIdentityError(401, { code: 'invalid_credential' }))
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(wrapper.get('[role=alert]').text()).not.toContain('537')
      expect(f.request.mock.calls).toHaveLength(requests + 2)
    } finally {
      clock.mockRestore()
      wrapper.unmount()
      f.session.clear()
    }
  }
})

it('associates session tabs with retained panels and clears passwords when leaving security', async () => {
  const f = fixture(false)
  await f.login()
  f.replies.push({ sessions: [sessionValue().session], nextCursor: null })
  const { wrapper } = await view(SessionsView, f)
  const tabs = wrapper.findAll('[role=tab]')
  const panels = wrapper.findAll('[role=tabpanel]')
  expect(tabs).toHaveLength(2)
  expect(panels).toHaveLength(2)
  for (let index = 0; index < tabs.length; index++) {
    expect(tabs[index]!.attributes('aria-controls')).toBe(panels[index]!.attributes('id'))
    expect(panels[index]!.attributes('aria-labelledby')).toBe(tabs[index]!.attributes('id'))
  }
  const requests = f.request.mock.calls.length
  await tabs[1]!.trigger('click')
  await flushPromises()
  expect(tabs[1]!.attributes('aria-selected')).toBe('true')
  await vi.waitFor(() => expect(panels[0]!.isVisible()).toBe(false))
  expect(panels[1]!.isVisible()).toBe(true)
  const password = wrapper.get('#new-password').element
  await wrapper.get('#new-password').setValue('sensitive draft')
  await tabs[0]!.trigger('click')
  await flushPromises()
  expect(wrapper.get('#new-password').element).toBe(password)
  expect((password as HTMLInputElement).value).toBe('')
  expect(panels[0]!.text()).toContain(ID)
  expect(f.request).toHaveBeenCalledTimes(requests)
  wrapper.unmount()
  f.session.clear()
})

it('dismisses logout confirmation with Escape before focus has entered the overlay', async () => {
  const f = fixture(false)
  await f.login()
  f.replies.push({ sessions: [], nextCursor: null })
  const { wrapper } = await view(SessionsView, f)
  const opener = wrapper.findAll('button').find((button) => button.text() === '退出全部会话')!
  await opener.trigger('click')
  await opener.trigger('keydown', { key: 'Escape' })
  await vi.waitFor(() =>
    expect(new DOMWrapper(document.body).find('[role=alertdialog]').exists()).toBe(false),
  )
  expect(f.session.state.value.status).toBe('authenticated')
  expect(f.request.mock.calls.some(([request]) => request.path.endsWith('/logout-all'))).toBe(false)
  wrapper.unmount()
  f.session.clear()
})
