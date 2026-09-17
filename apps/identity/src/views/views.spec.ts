import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
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
import LoginView from './LoginView.vue'
import SessionsView from './SessionsView.vue'
import AccountsView from './AccountsView.vue'
import ProvidersView from './ProvidersView.vue'
import ErrorView from './ErrorView.vue'
async function view(
  component: Component,
  f: ReturnType<typeof fixture>,
  name = 'sessions',
  query: Record<string, string> = {},
  sessionProviders: { providerId: string; label: string }[] = [],
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      ...['login', 'sessions', 'accounts', 'providers'].map((name) => ({
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
  const wrapper = mount(component, {
    attachTo: document.body,
    global: {
      plugins: [createPinia(), identityI18n(), router],
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
    expect(router.currentRoute.value.name).toBe('login')
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
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('login')
      wrapper.unmount()
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
    await wrapper.get('#account-login').setValue('newmember')
    await wrapper.get('#account-password').setValue('private new password')
    f.replies.push(accountValue, {
      accounts: [accountValue],
      nextCursor: null,
    })
    await wrapper.findAll('form')[0]!.trigger('submit')
    await flushPromises()
    expect((wrapper.get('#account-password').element as HTMLInputElement).value).toBe('')
    for (const label of ['停用账户', '停用成员']) {
      await wrapper
        .findAll('button')
        .find((b) => b.text() === label)!
        .trigger('click')
      await flushPromises()
      f.replies.push(accountValue, {
        accounts: [accountValue],
        nextCursor: null,
      })
      await wrapper
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
    await wrapper.get('#reset-password').setValue('private reset password')
    f.replies.push(accountValue, {
      accounts: [accountValue],
      nextCursor: null,
    })
    await wrapper.get('[role=dialog] form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('#reset-password').exists()).toBe(false)
    wrapper.unmount()
  })
  it('edits, tests and enables IdPs through versioned writes', async () => {
    const f = fixture()
    await f.login()
    f.replies.push({ providers: [providerValue] })
    const { wrapper } = await view(ProvidersView, f, 'providers')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '编辑')!
      .trigger('click')
    await wrapper.get('#client-id').setValue('updated')
    f.replies.push(
      { ...providerValue, version: 2 },
      { providers: [{ ...providerValue, version: 2 }] },
    )
    await wrapper.get('form').trigger('submit')
    await flushPromises()
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
      { ...providerValue, enabled: true, version: 3 },
      { providers: [{ ...providerValue, enabled: true, version: 3 }] },
    )
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '启用身份提供方')!
      .trigger('click')
    await flushPromises()
    await wrapper.get('#issuer').setValue('https://second.test')
    await wrapper.get('#client-id').setValue('second')
    await wrapper.get('#client-secret').setValue('second@1')
    f.replies.push(providerValue, { providers: [providerValue] })
    await wrapper.get('form').trigger('submit')
    await flushPromises()
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
  expect(wrapper.get('[role=alertdialog]').text()).toContain('已有联合会话将失效')
  f.replies.push(providerValue, { providers: [providerValue] })
  await wrapper
    .get('[role=alertdialog]')
    .findAll('button')
    .find((b) => b.text() === '确认')!
    .trigger('click')
  await flushPromises()
  expect(f.request.mock.calls.at(-2)?.[0].body).toEqual({ expectedVersion: 1, enabled: false })
  wrapper.unmount()
})

it('does not erase provider edits when the initial list finishes late', async () => {
  const f = fixture()
  await f.login()
  let finish!: (v: unknown) => void
  f.replies.push(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const { wrapper } = await view(ProvidersView, f, 'providers')
  await wrapper.get('#issuer').setValue('https://new.example.test')
  await wrapper.get('#client-id').setValue('new-client')
  await wrapper.get('#client-secret').setValue('new-secret@1')
  finish({ providers: [] })
  await flushPromises()
  expect((wrapper.get('#issuer').element as HTMLInputElement).value).toBe(
    'https://new.example.test',
  )
  expect((wrapper.get('#client-id').element as HTMLInputElement).value).toBe('new-client')
  expect((wrapper.get('#client-secret').element as HTMLInputElement).value).toBe('new-secret@1')
  wrapper.unmount()
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
