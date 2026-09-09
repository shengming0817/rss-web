import { describe, expect, it } from 'vitest'
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
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      ...['login', 'sessions', 'accounts', 'providers'].map((name) => ({
        path: `/tenants/:tenant/${name}`,
        name,
        component: { template: '<div/>' },
      })),
      { path: '/auth/error', name: 'error', component: { template: '<div/>' } },
    ],
  })
  await router.push(
    name === 'error' ? { name, query } : { name, params: { tenant: TENANT }, query },
  )
  await router.isReady()
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
  it('clears the login password immediately, reports a safe failure and completes sign-in', async () => {
    const f = fixture()
    f.replies.push(decodeIdentityError(401, { code: 'invalid_credential' }, false), {
      providers: [],
    })
    const { wrapper, router } = await view(LoginView, f, 'login', { reason: 'expired' })
    expect(wrapper.get('#login-name').attributes('autocomplete')).toBe('username')
    await wrapper.get('#login-name').setValue('admin')
    await wrapper.get('#login-password').setValue('private password')
    f.replies.push(decodeIdentityError(401, { code: 'invalid_credential' }, false))
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
    f.replies.push(decodeIdentityError(401, { code: 'invalid_credential' }, false), {
      providers: [{ provider_id: OTHER, label: 'Organization' }],
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
    f.replies.push({ sessions: [sessionValue().session], next_cursor: ID })
    const { wrapper, router } = await view(SessionsView, f)
    expect(wrapper.text()).toContain(ID)
    f.replies.push({ sessions: [], next_cursor: null })
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('加载更多'))!
      .trigger('click')
    await flushPromises()
    await wrapper.get('#current-password').setValue('private old password')
    await wrapper.get('#new-password').setValue('private new password')
    f.replies.push({ ...accountValue, principal_id: ID })
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('login')
    wrapper.unmount()
  })
  it('revokes current or all sessions explicitly', async () => {
    for (const label of ['退出当前会话', '退出全部会话']) {
      const f = fixture()
      await f.login()
      f.replies.push({ sessions: [], next_cursor: null })
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
    f.replies.push({ accounts: [accountValue], next_cursor: OTHER })
    const { wrapper } = await view(AccountsView, f, 'accounts')
    f.replies.push({ accounts: [], next_cursor: null })
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '加载更多')!
      .trigger('click')
    await flushPromises()
    await wrapper.get('#account-login').setValue('newmember')
    await wrapper.get('#account-password').setValue('private new password')
    f.replies.push(accountValue, { accounts: [accountValue], next_cursor: null })
    await wrapper.findAll('form')[0]!.trigger('submit')
    await flushPromises()
    expect((wrapper.get('#account-password').element as HTMLInputElement).value).toBe('')
    for (const label of ['停用账户', '停用成员', '授予管理员']) {
      await wrapper
        .findAll('button')
        .find((b) => b.text() === label)!
        .trigger('click')
      await flushPromises()
      f.replies.push(accountValue, { accounts: [accountValue], next_cursor: null })
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
    f.replies.push(accountValue, { accounts: [accountValue], next_cursor: null })
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
        tls_verified: true,
        authorization_response_issuer: true,
      },
    })
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '测试连接')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('连接测试通过')
    f.replies.push({ passed: false, diagnostic: { stage: 'binding', reason: 'missing_secret' } })
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '测试连接')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('missing_secret')
    f.replies.push(
      { ...providerValue, enabled: true, version: 3 },
      { providers: [{ ...providerValue, enabled: true, version: 3 }] },
    )
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '启用账户')!
      .trigger('click')
    await flushPromises()
    await wrapper.get('#issuer').setValue('https://second.test')
    await wrapper.get('#client-id').setValue('second')
    await wrapper.get('#secret-ref').setValue('second@1')
    f.replies.push(providerValue, { providers: [providerValue] })
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    wrapper.unmount()
  })
  it('clears pending continuation on safe error pages', async () => {
    const f = fixture()
    f.flows.save({
      kind: 'login',
      tenant: TENANT,
      challenge: 'private challenge',
      flow: { tenant_id: TENANT, grant_id: ID },
    })
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
