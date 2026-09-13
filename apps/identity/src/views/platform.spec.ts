import { describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { decodeIdentityError } from '@rss/api/identity'
import { fixture, sessionValue, TENANT, OTHER, ID } from '../../tests/support'
import { runtimeKey } from '../context'
import { identityI18n } from '../i18n'
import type { CreateTenant } from '../services/api'
import PlatformView from './PlatformView.vue'
async function platform(admin = true, operation?: string) {
  const f = fixture()
  const value = sessionValue(false)
  value.identity.platform_administrator = admin
  f.replies.push(value)
  await f.session.check(TENANT)
  if (admin)
    f.replies.push(
      { system_domain_id: TENANT, identity: value.identity },
      { tenants: [], next_cursor: null },
    )
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/tenants/:tenant/platform', name: 'platform', component: PlatformView },
      { path: '/tenants/:tenant/login', name: 'login', component: { template: '<div/>' } },
    ],
  })
  await router.push({
    name: 'platform',
    params: { tenant: TENANT },
    query: operation ? { operation } : {},
  })
  const wrapper = mount(PlatformView, {
    attachTo: document.body,
    global: {
      plugins: [createPinia(), identityI18n(), router],
      provide: { [runtimeKey as symbol]: f },
    },
  })
  await flushPromises()
  return { ...f, wrapper, router }
}
async function prepare(f: Awaited<ReturnType<typeof platform>>) {
  await f.wrapper.get('#tenant-name').setValue('Customer A')
  await f.wrapper.get('#tenant-admin-login').setValue('first-admin')
  await f.wrapper.get('#tenant-admin-password').setValue('private administrator password')
  await f.wrapper.get('form').trigger('submit')
}
async function confirm(f: Awaited<ReturnType<typeof platform>>) {
  await f.wrapper
    .get('[role=alertdialog]')
    .findAll('button')
    .find((b) => b.text() === '确认')!
    .trigger('click')
  await flushPromises()
}
function reply(f: Awaited<ReturnType<typeof platform>>, active = true) {
  return () => {
    const input = f.request.mock.calls.at(-1)![0].body as CreateTenant
    return {
      active,
      operation: {
        operation_id: input.administrator.operation_id,
        kind: 'tenant_created',
        tenant_id: input.tenant_id,
        principal_id: input.administrator.principal_id,
        created_at: 1,
      },
    }
  }
}
describe('platform tenant provisioning', () => {
  it('uses an explicit platform role, not an ordinary tenant administrator flag', async () => {
    const f = await platform(false)
    expect(f.wrapper.find('form').exists()).toBe(false)
    expect(f.wrapper.text()).toContain('没有平台管理员权限')
    expect(f.request).toHaveBeenCalledTimes(1)
    f.wrapper.unmount()
    f.session.clear()
  })
  it('generates coordinates, confirms once, clears the password and preserves committed success after read failure', async () => {
    const f = await platform()
    await prepare(f)
    expect(f.wrapper.get('[role=alertdialog]').text()).toContain('Customer A')
    expect(f.request.mock.calls.filter(([o]) => o.method === 'POST')).toHaveLength(0)
    f.replies.push(reply(f))
    await confirm(f)
    expect(f.wrapper.get('[data-testid=provisioning-outcome]').text()).toContain('已确认开通')
    expect(f.wrapper.find('#tenant-admin-password').exists()).toBe(false)
    const input = f.request.mock.calls.at(-1)![0].body as CreateTenant
    expect(
      new Set([input.tenant_id, input.administrator.principal_id, input.administrator.operation_id])
        .size,
    ).toBe(3)
    expect(f.router.currentRoute.value.query['operation']).toBe(input.administrator.operation_id)
    expect(f.wrapper.html()).not.toContain(input.administrator.password)
    expect(f.wrapper.find('a').attributes('href')).toBe('/tenants/' + input.tenant_id + '/login')
    f.replies.push(decodeIdentityError(503, { code: 'identity_unavailable' }, false))
    await f.wrapper
      .findAll('button')
      .find((b) => b.text() === '重新读取')!
      .trigger('click')
    await flushPromises()
    expect(f.wrapper.get('[data-testid=provisioning-outcome]').text()).toContain('已确认开通')
    expect(f.wrapper.find('table').exists()).toBe(false)
    expect(f.session.state.value.status).toBe('unavailable')
    f.wrapper.unmount()
    f.session.clear()
  })
  it('treats accepted activation as pending and only queries the original operation', async () => {
    const f = await platform()
    await prepare(f)
    f.replies.push(reply(f, false))
    await confirm(f)
    expect(f.wrapper.text()).toContain('等待激活')
    expect(f.wrapper.find('a').exists()).toBe(false)
    const operation = String(f.router.currentRoute.value.query['operation'])
    const input = f.request.mock.calls.at(-1)![0].body as CreateTenant
    f.replies.push({
      active: true,
      operation: {
        operation_id: operation,
        kind: 'tenant_created',
        tenant_id: input.tenant_id,
        principal_id: input.administrator.principal_id,
        created_at: 1,
      },
    })
    await f.wrapper
      .findAll('button')
      .find((b) => b.text() === '核实原操作')!
      .trigger('click')
    await flushPromises()
    expect(f.wrapper.text()).toContain('已确认开通')
    expect(f.request.mock.calls.at(-1)?.[0].method).toBe('GET')
    f.wrapper.unmount()
    f.session.clear()
  })
  it.each([
    [409, 'platform_conflict', '明确拒绝'],
    [503, 'operation_not_completed', '操作未完成'],
    [503, 'operation_outcome_unknown', '结果尚未确认'],
  ] as const)('distinguishes %s %s without replay', async (status, code, label) => {
    const f = await platform()
    await prepare(f)
    f.replies.push(decodeIdentityError(status, { code }, false))
    await confirm(f)
    expect(f.wrapper.get('[data-testid=provisioning-outcome]').text()).toContain(label)
    expect(f.request.mock.calls.filter(([o]) => o.method === 'POST')).toHaveLength(1)
    expect(f.wrapper.find('form').exists()).toBe(false)
    expect(f.router.currentRoute.value.query['operation']).toBeDefined()
    if (code === 'operation_not_completed') {
      const restart = f.wrapper.findAll('a').find((v) => v.text() === '重新登录后创建新租户')!
      expect(restart.attributes('href')).toBe('/tenants/' + TENANT + '/login')
    }
    if (code === 'operation_outcome_unknown')
      expect(f.wrapper.find('a').attributes('href')).toContain('operation=')
    f.wrapper.unmount()
    f.session.clear()
  })
  it('restores only a query after reload and keeps a missing receipt unknown', async () => {
    const f = await platform(true, OTHER)
    expect(f.wrapper.find('form').exists()).toBe(false)
    expect(f.request.mock.calls.some(([o]) => o.method === 'POST')).toBe(false)
    f.replies.push(decodeIdentityError(404, { code: 'operation_not_observed' }, false))
    await f.wrapper
      .findAll('button')
      .find((b) => b.text() === '核实原操作')!
      .trigger('click')
    await flushPromises()
    expect(f.wrapper.text()).toContain('不代表未提交')
    expect(f.wrapper.get('[data-testid=provisioning-outcome]').text()).toContain('结果尚未确认')
    expect(f.wrapper.findAll('button').some((b) => b.text() === '创建新租户')).toBe(false)
    f.wrapper.unmount()
    f.session.clear()
  })
  it('loads pagination explicitly and drops rows when the session is revoked', async () => {
    const f = await platform()
    f.replies.push({
      tenants: [{ tenant_id: OTHER, name: 'Customer', initial_principal_id: ID }],
      next_cursor: OTHER,
    })
    await f.wrapper
      .findAll('button')
      .find((b) => b.text() === '重新读取')!
      .trigger('click')
    await flushPromises()
    f.replies.push({ tenants: [], next_cursor: null })
    await f.wrapper
      .findAll('button')
      .find((b) => b.text() === '加载更多')!
      .trigger('click')
    await flushPromises()
    expect(f.request.mock.calls.at(-1)?.[0].query).toEqual({ cursor: OTHER })
    f.session.clear()
    await flushPromises()
    expect(f.wrapper.find('table').exists()).toBe(false)
    expect(f.wrapper.find('form').exists()).toBe(false)
    f.wrapper.unmount()
  })
})
