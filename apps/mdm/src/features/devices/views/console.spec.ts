import { shallowRef } from 'vue'
import { runtimeKey, type IdentitySession } from '@rss/auth'
import { createRegistrationChannelsClient } from '../../../services/registrationChannels'
import { createRegistrationChannels } from '../../../services/registrationChannelState'
import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { networkErrorForTest } from '@rss/api/testing'
import { decodeMdmError } from '@rss/api/mdm'
import { createScenario, TENANT } from '../../../../demo/scenario'
import { createDeviceDemo } from '../../../../demo/devices/state'
import { createAutomationDemo } from '../../../../demo/policies/state'
import { ADMIN } from '../../../../demo/operations/authorization'
import { createOperationsClients } from '../../operations/client'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import { policyFeature } from '../../policies/routes'
import { securityFeature } from '../../security/routes'
import { operationsFeature } from '../../operations/routes'
import { deviceFeature } from '../routes'
import { createPolicyClients } from '../../policies/client'
import { createDeviceClients } from '../client'
const wrappers: VueWrapper[] = []
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  document.body.innerHTML = ''
})
async function setup(
  name = 'devices',
  params: Record<string, string> = {},
  query: Record<string, string> = {},
) {
  const domain = createDeviceDemo(),
    automation = createAutomationDemo(domain),
    scenario = createScenario([automation.handle, domain.handle], () => {
      domain.reset()
      automation.reset()
    })
  domain.bindAuthorization(automation.authorization.can)
  const login = await scenario.handle('POST', `/api/v1/identity/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  const headers = {
    'x-csrf-token': (login.body as { csrfToken: string }).csrfToken,
    'x-identity-request': '1',
  }
  const requests: RequestOptions<unknown>[] = []
  const loseReply = { path: '' }
  const transport = {
    async request<T>(options: RequestOptions<T>) {
      const o = { ...options }
      // Deliberately retain no secret body in test diagnostics.
      if (!o.path.includes('enrollments')) requests.push(o as RequestOptions<unknown>)
      const path = o.path.replace(/\{([^}]+)\}/g, (_, key: string) =>
        encodeURIComponent(o.pathParams?.[key] ?? ''),
      )
      const query = new URLSearchParams(
        Object.entries(o.query ?? {})
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      )
      const reply = await scenario.handle(o.method, `${path}?${query}`, o.body, {
        ...headers,
        ...Object.fromEntries(
          Object.entries(o.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
        ),
      })
      if (reply.status !== o.successStatus) throw decodeMdmError(reply.status, reply.body)
      if (loseReply.path === o.path) throw networkErrorForTest()
      return o.decode(reply.body)
    },
  } as unknown as HttpTransport
  const devices = createDeviceClients(transport, TENANT)
  const operations = createOperationsClients(transport, TENANT, true)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/downloads/agent', name: 'agent-downloads', component: { template: '<div />' } },
      deviceFeature.entry,
      ...(deviceFeature.routes ?? []),
      policyFeature.entry,
      ...(policyFeature.routes ?? []),
      securityFeature.entry,
      ...(securityFeature.routes ?? []),
      operationsFeature.entry,
      ...(operationsFeature.routes ?? []),
    ],
  })
  await router.push({ name, params: { tenant: TENANT, ...params }, query })
  await router.isReady()
  const session = {
    state: shallowRef({
      status: 'authenticated',
      tenant: TENANT,
      identity: { principalId: ADMIN },
      session: { id: 'demo-session' },
    }),
  } as unknown as IdentitySession
  const registrationChannels = createRegistrationChannels(
    createRegistrationChannelsClient(transport, TENANT),
    session,
    operations.authorization,
    TENANT,
  )
  const i18n = mdmI18n()
  i18n.global.locale.value = 'zh-CN'
  const wrapper = mount(RouterView, {
    attachTo: document.body,
    global: {
      plugins: [router, i18n],
      provide: {
        [mdmKey as symbol]: {
          devices,
          policies: createPolicyClients(transport, TENANT, true),
          transport,
          operations,
          tenant: TENANT,
          demo: true,
          session,
          registrationChannels,
        },
        [runtimeKey as symbol]: {
          api: {
            accounts: async () => ({
              accounts: [
                {
                  principalId: '33333333-3333-4333-8333-333333333333',
                  login: 'reviewer',
                  enabled: true,
                  memberActive: true,
                },
              ],
              next: null,
            }),
          },
        },
      },
    },
  })
  wrapper.vm.$.appContext.app.onUnmount(() => registrationChannels.dispose())
  wrappers.push(wrapper)
  await flushPromises()
  const button = (text: string) => {
    const result = new DOMWrapper(document.body)
      .findAll('button')
      .find((b) => b.isVisible() && b.text() === text)
    if (!result) throw new Error(`Missing button: ${text}`)
    return result
  }
  const click = async (text: string) => {
    const target = button(text)
    await target.trigger(target.attributes('role') === 'tab' ? 'mousedown' : 'click', {
      button: 0,
      ctrlKey: false,
    })
    await flushPromises()
  }
  if (name === 'device-search') {
    await wrapper.get('details > summary').trigger('click')
    await flushPromises()
  }
  if (name === 'device-groups') await click('创建')
  return {
    wrapper,
    router,
    scenario,
    devices,
    domain,
    requests,
    button,
    click,
    loseReply,
    operations,
    i18n,
    registrationChannels,
    transport,
    session,
  }
}
async function confirmCredential() {
  const dialog = new DOMWrapper(document.body).get('[role=alertdialog]')
  await dialog
    .findAll('button')
    .find((button) => button.text() === '我已核对目标、世代和风险，确认操作')!
    .trigger('click')
  await flushPromises()
}
it('renders server view counters, endpoint references, pagination and empty state', async () => {
  const { wrapper, click, scenario, requests } = await setup()
  expect(wrapper.text()).toContain('device-01')
  expect(requests.some((r) => r.path === '/api/v1/device-views')).toBe(true)
  expect(requests.some((r) => r.path === '/api/v1/mdm-candidate/devices')).toBe(false)
  await click('下一页')
  expect(wrapper.text()).toContain('device-21')
  scenario.set('empty')
  await click('重新读取')
  expect(wrapper.text()).toContain('当前没有结果')
})
it('opens the existing registration owner from a software source-policy deep link', async () => {
  const { wrapper, requests, router } = await setup(
    'device-detail',
    { device: 'device-01' },
    { tab: 'management' },
  )
  expect(requests.some((r) => r.path === '/api/v1/devices/{device}/registrations')).toBe(true)
  expect(wrapper.text()).toContain('agent.builtin')
  await router.push({
    name: 'device-detail',
    params: { tenant: TENANT, device: 'device-02' },
    query: { tab: 'management' },
  })
  await flushPromises()
  expect(wrapper.text()).toContain('mdm.apple')
  const registrations = wrapper
    .findAll('li')
    .filter((row) => row.findAll('button').some((button) => button.text() === '撤销凭据'))
  expect(registrations).toHaveLength(1)
  expect(registrations[0]!.text()).toContain('mdm.apple')
  expect(registrations[0]!.text()).not.toContain('agent.builtin')
})
it('renders asset categories, edits manual fields and keeps ownership blocked', async () => {
  const { wrapper, click, scenario } = await setup('device-detail', { device: 'device-01' })
  await click('硬件')
  expect(wrapper.text()).toContain('ThinkPad T14')
  await click('编辑人工资产信息')
  const manual = wrapper.findComponent({ name: 'ManualPanel' })
  await manual.find('select').setValue('custom.is_loaner')
  await manual.findAll('select')[1]!.setValue('delete')
  scenario.set('conflict')
  await manual.find('form').trigger('submit')
  await flushPromises()
  expect(manual.text()).toContain('草稿已保留')
  scenario.set('normal')
  await manual.find('form').trigger('submit')
  await flushPromises()
  expect(manual.text()).toContain('已删除')
  await manual.findAll('select')[1]!.setValue('null')
  await manual.find('form').trigger('submit')
  await flushPromises()
  expect(manual.text()).toContain('显式空值')
  await new DOMWrapper(document.body).get('[role=dialog] button[aria-label=取消]').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('设备型号')
  const list = wrapper
    .findAll('details')
    .find((d) => d.find('summary').text().includes('device.software'))!
  await list.element.setAttribute('open', '')
  await click('展开此来源')
  expect(wrapper.text()).toContain('旧分页失效')
  await click('重新读取')
  const refreshed = wrapper
    .findAll('details')
    .find((d) => d.find('summary').text().includes('device.software'))!
  refreshed.element.setAttribute('open', '')
  await click('展开此来源')
  expect(wrapper.text()).toContain('Enterprise Browser')
  await click('历史')
  expect(wrapper.text()).toContain('registration_bound')
  await click('管理')
  expect(wrapper.text()).toContain('撤销服务端凭据不会擦除设备')
  wrapper
    .findAll('details')
    .find((d) => d.find('summary').text() === '注册凭据')!
    .element.setAttribute('open', '')
  await click('撤销凭据')
  await confirmCredential()
  expect(wrapper.text()).not.toContain('擦除成功')
})
it('executes asynchronous searches, facets, and personal saved query create/read/delete', async () => {
  const { wrapper, click } = await setup('device-search')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  await click('读取任务状态')
  expect(wrapper.text()).toContain('运行中')
  await click('读取任务状态')
  await click('载入')
  expect(wrapper.text()).toContain('device-01')
  const facetSection = wrapper.findAll('section').find((s) => s.find('h2').text().includes('聚合'))
  expect(facetSection).toBeDefined()
  await facetSection!.find('button').trigger('click')
  await flushPromises()
  expect(facetSection!.text()).toContain('11.24H2')
  const saveForm = wrapper.findAll('form').at(-1)!
  await saveForm.find('input').setValue('All devices')
  await saveForm.trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('按当前授权执行')
  await click('按当前授权执行')
  await click('读取任务状态')
  await click('读取任务状态')
  await click('重新读取')
  const savedButton = wrapper.findAll('button').find((b) => b.text().includes('All devices'))!
  await savedButton.trigger('click')
  await flushPromises()
  expect(saveForm.find('input').element.value).toBe('All devices')
  await click('删除')
  expect(wrapper.text()).toContain('已删除')
  await click('创建')
  expect(saveForm.find('input').element.value).toBe('')
})
it('creates a group, edits its definition, previews and recomputes server membership', async () => {
  const { wrapper, click } = await setup('device-groups')
  const form = wrapper.findAll('form')[1]!
  await form.find('input').setValue('New group')
  await form.trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('成员版本')
  await wrapper.find('textarea').setValue('device-01\ndevice-02')
  await wrapper.findAll('form')[2]!.trigger('submit')
  await flushPromises()
  await click('读取任务状态')
  await click('读取任务状态')
  await click('载入')
  expect(wrapper.text()).toContain('device-01')
  await click('重读服务器值并比较')
  await click('预览已保存版本')
  await click('读取任务状态')
  await click('读取任务状态')
  await click('载入')
  expect(wrapper.text()).toContain('当前已发布成员集: 否')
  await click('重算并发布成员')
  await click('读取任务状态')
  await click('读取任务状态')
  await click('载入')
  expect(wrapper.text()).toContain('当前已发布成员集: 是')
})
it('clears enrollment password at submission, supports recovery, and never persists a secret', async () => {
  const { wrapper, click, scenario, devices } = await setup('device-enroll')
  const form = wrapper.find('form')
  await form.find('input').setValue('new-device')
  await click('生成一次性交付口令')
  const password = form.findAll('input')[1]!
  expect(password.element.value).toHaveLength(43)
  const originalPassword = password.element.value
  await form.find('input[type=checkbox]').setValue(true)
  scenario.set('unknown')
  await form.trigger('submit')
  await flushPromises()
  expect(password.element.value).toBe('')
  expect(wrapper.text()).toContain('提交结果未知')
  expect(window.sessionStorage.length).toBe(0)
  scenario.set('normal')
  const originalOperation = wrapper
    .findAll('p')
    .find((p) => p.text().includes('操作 ID'))
    ?.text()
  expect(originalOperation).toBeDefined()
  await password.setValue(originalPassword)
  await form.find('input[type=checkbox]').setValue(true)
  expect(form.find('button[type=submit]').attributes('disabled')).toBeDefined()
  await click('明确重放原操作')
  expect(
    wrapper
      .findAll('p')
      .find((p) => p.text().includes('操作 ID'))
      ?.text(),
  ).toBe(originalOperation)
  await flushPromises()
  expect((await devices.directory.detail('new-device')).enrollments).toHaveLength(1)
  expect(wrapper.text()).toContain('待注册')
  expect(password.element.value).toBe('')
  await click('读取原请求状态')
  await click('取消')
  expect(wrapper.text()).toContain('已取消')
})

it('compares a saved server definition without replacing the local draft', async () => {
  const { wrapper, click, devices } = await setup('device-search')
  const form = wrapper.findAll('form').at(-1)!
  await form.find('input').setValue('Original')
  await form.trigger('submit')
  await flushPromises()
  const saved = (await devices.assets.saved()).items[0]!
  await devices.assets.save(saved.id, {
    operationId: crypto.randomUUID(),
    expectedRevision: saved.revision,
    input: {
      action: 'put',
      definition: {
        name: 'Other operator',
        query: {
          criteria: {
            kind: 'predicate',
            field: 'device.model',
            op: 'eq',
            value: { kind: 'string', value: 'MacBook Pro' },
          },
          select: ['device.model'],
          sort: { field: 'device.model', descending: true },
        },
      },
    },
  })
  await form.find('input').setValue('My retained draft')
  await click('重读服务器值并比较')
  expect(form.find('input').element.value).toBe('My retained draft')
  const current = wrapper.find('[data-testid=server-definition]')
  expect(current.text()).toContain('Other operator')
  expect(current.text()).toContain('device.model')
  expect(current.find('input').element.value).toBe('MacBook Pro')
})
it('saves dynamic rules and renders unknown decisions, explanations and provenance', async () => {
  const { wrapper, click, devices, scenario } = await setup('device-groups')
  const form = wrapper.findAll('form')[1]!
  await form.find('input').setValue('Dynamic')
  await form.find('select').setValue('dynamic')
  const editor = form.find('.condition-editor')
  await editor.find('select').setValue('predicate')
  await editor.findAll('select')[1]!.setValue('custom.is_loaner')
  await form.trigger('submit')
  await flushPromises()
  await editor.findAll('select').at(-1)!.setValue('true')
  await click('编辑')
  await click('保存动态条件')
  const group = (await devices.groups.list()).items.find((g) => g.name === 'Dynamic')!
  expect((await devices.groups.read(group.id)).criteria).toMatchObject({
    value: { kind: 'boolean', value: true },
  })
  await click('预览已保存版本')
  await click('读取任务状态')
  await click('读取任务状态')
  await wrapper.findAll('select').at(-1)!.setValue('decisions')
  await click('载入')
  expect(wrapper.text()).toContain('当前已发布成员集: 否')
  expect(wrapper.text()).toContain('未采集')
  expect(
    wrapper.findAll('details').find((detail) => detail.text().includes('manual')),
  ).toBeDefined()
  await click('重算并发布成员')
  await click('读取任务状态')
  await click('读取任务状态')
  await click('载入')
  expect(wrapper.text()).toContain('当前已发布成员集: 是')
  scenario.set('partial')
  await click('预览已保存版本')
  await click('读取任务状态')
  await click('读取任务状态')
  expect(wrapper.text()).toContain('计划已失效，请重新预览')
  expect(wrapper.text()).toContain('阶段')
  scenario.set('normal')
  const authoritative = await devices.groups.read(group.id)
  await devices.groups.change(group.id, {
    operationId: crypto.randomUUID(),
    expectedRevision: authoritative.group.revision,
    input: { action: 'edit', name: 'Server changed name', description: 'Server description' },
  })
  await form.find('input').setValue('Retained group draft')
  await click('重读服务器值并比较')
  expect(wrapper.find('[data-testid=server-definition]').text()).toContain('Server changed name')
  expect(wrapper.find('[data-testid=server-definition]').text()).toContain('Server description')
  expect(form.find('input').element.value).toBe('Retained group draft')
})

it('does not call a confirmed manual write unknown when its follow-up read fails', async () => {
  const { wrapper, devices, click } = await setup('device-detail', { device: 'device-01' })
  await click('编辑人工资产信息')
  const manual = wrapper.findComponent({ name: 'ManualPanel' })
  await manual.find('select').setValue('custom.is_loaner')
  await manual.findAll('select')[1]!.setValue('delete')
  const inventory = devices.assets.inventory
  devices.assets.inventory = async () => {
    throw decodeMdmError(503, { code: 'service_unavailable' })
  }
  await manual.find('form').trigger('submit')
  await flushPromises()
  expect(manual.text()).not.toContain('明确重放原操作')
  devices.assets.inventory = inventory
  expect((await inventory('device-01')).fields['custom.is_loaner']?.state.kind).toBe('deleted')
})

it('replays the original search after a lost committed response, even after an intervening read', async () => {
  const { wrapper, requests, click, loseReply } = await setup('device-search')
  loseReply.path = '/api/v1/device-queries'
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('提交结果未知')
  const original = requests.find((r) => r.path === loseReply.path)!.body
  loseReply.path = ''
  await click('重新读取')
  await wrapper.find('form').trigger('submit')
  expect(requests.filter((r) => r.path === '/api/v1/device-queries')).toHaveLength(1)
  await click('明确重放原操作')
  expect(requests.filter((r) => r.path === '/api/v1/device-queries').map((r) => r.body)).toEqual([
    original,
    original,
  ])
  expect(wrapper.text()).toContain('读取任务状态')
})

it('keeps the current group target when opening another group fails', async () => {
  const { wrapper, click, scenario, devices } = await setup('device-groups')
  const other = crypto.randomUUID()
  await devices.groups.change(other, {
    operationId: crypto.randomUUID(),
    expectedRevision: 0,
    input: {
      action: 'create',
      assetContext: 'endpoint',
      name: 'Other group',
      description: '',
      criteria: null,
    },
  })
  await click('重新读取')
  await wrapper
    .findAll('button')
    .find((b) => b.text().includes('Pilot devices'))!
    .trigger('click')
  await flushPromises()
  scenario.set('offline')
  await wrapper
    .findAll('button')
    .find((b) => b.text().includes('Other group'))!
    .trigger('click')
  await flushPromises()
  scenario.set('normal')
  await click('删除')
  expect((await devices.groups.read(other)).group.deleted).toBe(false)
})
it('does not switch saved-query targets while the original write is unresolved', async () => {
  const { wrapper, click, devices, scenario } = await setup('device-search')
  const other = crypto.randomUUID()
  await devices.assets.save(other, {
    operationId: crypto.randomUUID(),
    expectedRevision: 0,
    input: {
      action: 'put',
      definition: { name: 'Other query', query: { criteria: null, select: [], sort: null } },
    },
  })
  const form = wrapper.findAll('form').at(-1)!
  await form.find('input').setValue('Original query')
  scenario.set('unknown')
  await form.trigger('submit')
  await flushPromises()
  scenario.set('normal')
  await click('重新读取')
  await wrapper
    .findAll('button')
    .find((b) => b.text().includes('Other query'))!
    .trigger('click')
  await flushPromises()
  expect(form.find('input').element.value).toBe('Original query')
  await click('创建')
  expect(form.find('input').element.value).toBe('Original query')
  await click('明确重放原操作')
  await form.trigger('submit')
  await flushPromises()
  expect((await devices.assets.readSaved(other)).definition?.name).toBe('Other query')
})
it('keeps an uncertain manual operation across tabs and replays the same request', async () => {
  const { wrapper, click, scenario, requests } = await setup('device-detail', {
    device: 'device-01',
  })
  await click('编辑人工资产信息')
  let manual = wrapper.findComponent({ name: 'ManualPanel' })
  await manual.find('select').setValue('custom.is_loaner')
  await manual.findAll('select')[1]!.setValue('delete')
  scenario.set('unknown')
  await manual.find('form').trigger('submit')
  await flushPromises()
  const original = requests.find((r) => r.method === 'PUT')!.body
  scenario.set('normal')
  await new DOMWrapper(document.body).get('[role=dialog] button[aria-label=取消]').trigger('click')
  await flushPromises()
  await click('编辑人工资产信息')
  manual = wrapper.findComponent({ name: 'ManualPanel' })
  expect(manual.text()).toContain('明确重放原操作')
  await click('明确重放原操作')
  expect(requests.filter((r) => r.method === 'PUT').map((r) => r.body)).toEqual([
    original,
    original,
  ])
})
it('refreshes channels after revoking each credential and never shows ready with no active channel', async () => {
  const { wrapper, click, devices } = await setup('device-detail', { device: 'device-01' })
  await click('管理')
  const rows = (await devices.enrollment.registrations('device-01')).items
  for (let index = 0; index < rows.length; index++) {
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '撤销凭据' && b.attributes('disabled') === undefined)!
      .trigger('click')
    await flushPromises()
    await confirmCredential()
  }
  const detail = await devices.directory.detail('device-01')
  expect(detail.channels.filter((c) => c.status === 'active')).toEqual([])
  expect(detail.capabilities.every((c) => c.devicePrerequisite.state === 'blocked')).toBe(true)
  expect(wrapper.text()).not.toContain('mdm + agent')
})
it('reports oversized member changes as rejected without entering unknown recovery', async () => {
  const { wrapper } = await setup('device-groups')
  await wrapper
    .findAll('button')
    .find((b) => b.text().includes('Pilot devices'))!
    .trigger('click')
  await flushPromises()
  await wrapper
    .find('textarea')
    .setValue(Array.from({ length: 500 }, () => crypto.randomUUID()).join('\n'))
  await wrapper.find('form input[type=checkbox]').setValue(true)
  await wrapper.findAll('form')[2]!.trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('请求超过 16 KiB')
  expect(wrapper.text()).not.toContain('明确重放原操作')
})

it('retains an in-flight manual write when tabs change before its unknown result', async () => {
  const { wrapper, click, devices, requests } = await setup('device-detail', {
    device: 'device-01',
  })
  await click('编辑人工资产信息')
  const manual = wrapper.findComponent({ name: 'ManualPanel' })
  await manual.find('select').setValue('custom.is_loaner')
  await manual.findAll('select')[1]!.setValue('delete')
  const assign = devices.assets.assign
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  devices.assets.assign = async (...args) => {
    await assign(...args)
    await gate
    throw networkErrorForTest()
  }
  await manual.find('form').trigger('submit')
  await new DOMWrapper(document.body).get('[role=dialog] button[aria-label=取消]').trigger('click')
  await flushPromises()
  release()
  await flushPromises()
  devices.assets.assign = assign
  await click('编辑人工资产信息')
  expect(manual.text()).toContain('明确重放原操作')
  await click('明确重放原操作')
  const writes = requests.filter((r) => r.method === 'PUT')
  expect(writes).toHaveLength(2)
  expect(writes[1]!.body).toEqual(writes[0]!.body)
})
it('marks credential details stale after an acknowledged revoke with a failed refresh', async () => {
  const { wrapper, click, devices } = await setup('device-detail', { device: 'device-01' })
  await click('管理')
  const read = devices.directory.detail
  devices.directory.detail = async () => {
    throw decodeMdmError(503, { code: 'service_unavailable' })
  }
  wrapper
    .findAll('details')
    .find((d) => d.find('summary').text() === '注册凭据')!
    .element.setAttribute('open', '')
  await click('撤销凭据')
  await confirmCredential()
  expect(wrapper.text()).toContain('暂不可用')
  expect(wrapper.text()).not.toContain('mdm + agent')
  expect(wrapper.text()).not.toContain('明确重放原操作')
  expect(wrapper.text()).not.toContain('已就绪')
  devices.directory.detail = read
  await click('重新读取')
  expect(wrapper.text()).not.toContain('详情尚未刷新')
})

it('self enrollment works without the management frame and clears handoff secrets on submit and navigation', async () => {
  const { wrapper, click, router } = await setup('self-enrollments')
  expect(wrapper.text()).toContain('注册我的设备')
  expect(wrapper.find('nav').exists()).toBe(false)
  await click('生成一次性交付口令')
  await wrapper.find('form input[type=checkbox]').setValue(true)
  const password = wrapper.find('input[autocomplete=off]')
  expect((password.element as HTMLInputElement).value).toHaveLength(43)
  await wrapper.findAll('form')[0]!.trigger('submit')
  await flushPromises()
  expect((password.element as HTMLInputElement).value).toBe('')
  expect(wrapper.text()).toContain('self:')
  expect(wrapper.find('tbody').text()).toContain('1')
  await click('生成一次性交付口令')
  await wrapper.find('form input[type=checkbox]').setValue(true)
  await router.push({ name: 'devices', params: { tenant: TENANT } })
  await flushPromises()
  expect(wrapper.text()).not.toContain('self:')
})
it('administrator quota editing preserves exact commands after a lost response', async () => {
  const { wrapper, scenario, click } = await setup('registration-quotas')
  await wrapper.find('input[type=number]').setValue('0')
  scenario.set('unknown')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('结果未知')
  scenario.set('normal')
  await click('核对后重试原操作')
  expect(wrapper.text()).toContain('已保存')
  await wrapper.find('select').setValue('override')
  await flushPromises()
  await wrapper.findAll('select')[1]!.setValue('33333333-3333-4333-8333-333333333333')
  await flushPromises()
  expect(wrapper.find('input[type=number]').exists()).toBe(true)
  await wrapper.find('input[type=number]').setValue('0')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(wrapper.find('tbody tr').findAll('td')[0]!.text()).toBe('0')
})
it('organization responsibility can be assigned and cleared without occupying personal quota', async () => {
  const { wrapper, devices, click } = await setup('registration-users', {}, { device: 'device-01' })
  await wrapper.find('select').setValue('33333333-3333-4333-8333-333333333333')
  await wrapper.findAll('form')[1]!.trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('已保存')
  const assigned = await devices.registration.responsibility('device-01')
  expect(assigned.user?.principalId).toBe('33333333-3333-4333-8333-333333333333')
  await wrapper.find('select').setValue('')
  await wrapper.findAll('form')[1]!.trigger('submit')
  await flushPromises()
  expect((await devices.registration.responsibility('device-01')).user).toBeNull()
  expect((await devices.registration.me()).channels.every((c) => c.used === 0)).toBe(true)
  await click('重新读取')
})

it('invalidates the displayed native registration when the query target changes and cancels only the newly read target', async () => {
  const { wrapper, devices, click } = await setup('self-enrollments')
  const first = await devices.registration.enroll(
    crypto.randomUUID(),
    'A'.repeat(43),
    'mdm.windows',
    'Device',
  )
  const second = await devices.registration.enroll(
    crypto.randomUUID(),
    'A'.repeat(43),
    'mdm.windows',
    'Device',
  )
  const query = wrapper.findAll('form')[1]!
  await query.find('input').setValue(first.enrollmentId)
  await query.trigger('submit')
  await flushPromises()
  expect(wrapper.find('dl').text()).toContain(first.enrollmentId)
  const cancel = vi.spyOn(devices.enrollment, 'cancel')
  await query.find('input').setValue(second.enrollmentId)
  expect(wrapper.find('dl').exists()).toBe(false)
  expect(wrapper.findAll('button').some((b) => b.text() === '取消')).toBe(false)
  expect(cancel).not.toHaveBeenCalled()
  await query.trigger('submit')
  await flushPromises()
  await click('取消')
  expect(cancel.mock.calls.map(([id]) => id)).toEqual([second.enrollmentId])
  expect((await devices.enrollment.status(first.enrollmentId)).status).toBe('pending')
  expect((await devices.enrollment.status(second.enrollmentId)).status).toBe('cancelled')
})

it('discards a native read that arrives after its query target changes', async () => {
  const { wrapper, devices } = await setup('self-enrollments')
  const first = await devices.registration.enroll(
    crypto.randomUUID(),
    'A'.repeat(43),
    'mdm.windows',
    'Device',
  )
  const second = await devices.registration.enroll(
    crypto.randomUUID(),
    'A'.repeat(43),
    'mdm.windows',
    'Device',
  )
  const read = devices.enrollment.status
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  vi.spyOn(devices.enrollment, 'status').mockImplementationOnce(async (id) => {
    const result = await read(id)
    await gate
    return result
  })
  const query = wrapper.findAll('form')[1]!
  await query.find('input').setValue(first.enrollmentId)
  await query.trigger('submit')
  expect(query.find('input').attributes('disabled')).toBeDefined()
  // Also fence a programmatic edit while the request is in flight.
  const input = query.find('input').element as HTMLInputElement
  input.value = second.enrollmentId
  input.dispatchEvent(new Event('input', { bubbles: true }))
  release()
  await flushPromises()
  expect(wrapper.find('dl').exists()).toBe(false)
  await query.trigger('submit')
  await flushPromises()
  expect(wrapper.find('dl').text()).toContain(second.enrollmentId)
  expect(wrapper.find('dl').text()).not.toContain(first.enrollmentId)
})

it('refreshes native binding and resumes the same bound identity even when new enrollment is disabled', async () => {
  const { wrapper, devices, domain, click } = await setup('self-enrollments')
  await click('生成一次性交付口令')
  await wrapper.find('form input[type=checkbox]').setValue(true)
  await wrapper.findAll('form')[0]!.trigger('submit')
  await flushPromises()
  const id = (wrapper.findAll('form')[1]!.find('input').element as HTMLInputElement).value
  const deviceId = wrapper.findAll('dl dd')[1]!.text()
  domain.tick({
    kind: 'enrollment_bind',
    device: deviceId,
    enrollment: id,
    at: Math.floor(Date.now() / 1000),
  })
  const bound = await devices.enrollment.status(id)
  expect(bound.status).toBe('bound')
  await devices.registration.change(crypto.randomUUID(), 0, {
    agent: 20,
    windows_mdm: 0,
    macos_mdm: 20,
  })
  await click('刷新状态与额度')
  expect(wrapper.find('dl').text()).toContain('已绑定')
  expect(wrapper.find('dl').text()).toContain(deviceId)
  expect(wrapper.findAll('button').some((b) => b.text() === '取消')).toBe(false)
  const resume = vi.spyOn(devices.enrollment, 'resume')
  const create = vi.spyOn(devices.registration, 'enroll')
  await click('生成一次性交付口令')
  await wrapper.find('form input[type=checkbox]').setValue(true)
  await click('更新口令并继续')
  expect(resume.mock.calls.map(([target]) => target)).toEqual([id])
  expect(create).not.toHaveBeenCalled()
  expect(await devices.enrollment.status(id)).toMatchObject({
    enrollmentId: id,
    registrationId: bound.registrationId,
    status: 'bound',
  })
  expect(
    (await devices.registration.me()).channels.find((c) => c.channel === 'windows_mdm')?.used,
  ).toBe(1)
  await expect(devices.enrollment.cancel(id, crypto.randomUUID())).rejects.toMatchObject({
    status: 409,
  })
})
async function chooseAssociation(h: Awaited<ReturnType<typeof setup>>) {
  await h.click('管理')
  await h.click('查找另一通道候选')
  const panel = h.wrapper.find('[data-testid=association-panel]')
  await panel.find('input[type=radio]').setValue(true)
  await flushPromises()
  await panel.find('textarea').setValue('Verified physical possession')
  await panel.find('input[type=checkbox]').setValue(true)
  return panel
}
it('creates a unified route and revokes the relation without credential writes', async () => {
  const h = await setup('device-detail', { device: 'device-01' })
  await chooseAssociation(h)
  await h.click('确认关联')
  await vi.waitFor(() => expect(h.router.currentRoute.value.name).toBe('device-view-detail'))
  await flushPromises()
  await h.click('管理')
  const panel = h.wrapper.find('[data-testid=association-panel]')
  await panel.findAll('textarea')[1]!.setValue('Separate instances')
  await panel.find('input[type=checkbox]').setValue(true)
  await h.click('解除关联')
  await vi.waitFor(() => expect(h.router.currentRoute.value.name).toBe('devices'))
  await flushPromises()
  expect(h.requests.filter((r) => r.method === 'POST').map((r) => r.path)).toEqual([
    '/api/v1/device-associations',
    '/api/v1/device-associations/{id}/revoke',
  ])
})
it('locks an unknown association, survives navigation, and requires explicit exact POST replay', async () => {
  const h = await setup('device-detail', { device: 'device-01' })
  await chooseAssociation(h)
  h.loseReply.path = '/api/v1/device-associations'
  await h.click('确认关联')
  const original = h.requests.find((r) => r.method === 'POST')!.body
  await h.router.push({ name: 'devices', params: { tenant: TENANT } })
  await flushPromises()
  await h.router.push({ name: 'device-detail', params: { tenant: TENANT, device: 'device-01' } })
  await flushPromises()
  await h.click('管理')
  const panel = h.wrapper.find('[data-testid=association-panel]')
  expect(panel.text()).toContain('结果未知')
  expect(h.button('确认关联').attributes('disabled')).toBeDefined()
  h.loseReply.path = ''
  await panel.find('input[type=checkbox]').setValue(true)
  await h.click('幂等重放原关联操作')
  expect(h.requests.filter((r) => r.method === 'POST').map((r) => r.body)).toEqual([
    original,
    original,
  ])
  await vi.waitFor(() => expect(h.router.currentRoute.value.name).toBe('device-view-detail'))
  await flushPromises()
})
it('clears sensitive counterpart facts when an association write loses authority', async () => {
  const h = await setup('device-detail', { device: 'device-01' })
  await chooseAssociation(h)
  h.scenario.set('denied')
  await h.click('确认关联')
  expect(h.wrapper.find('[data-testid=association-panel]').exists()).toBe(false)
  expect(h.wrapper.text()).toContain('请求被拒绝')
  expect(h.wrapper.text()).not.toContain('Verified physical possession')
})

it.each([403, 404])(
  'clears the entire unified view after source pagination loses access (%s)',
  async (status) => {
    const h = await setup('device-detail', { device: 'device-01' })
    await chooseAssociation(h)
    await h.click('确认关联')
    await vi.waitFor(() => expect(h.router.currentRoute.value.name).toBe('device-view-detail'))
    await flushPromises()
    expect(h.wrapper.findComponent({ name: 'ViewFacts' }).exists()).toBe(true)
    vi.spyOn(h.devices.views, 'items').mockRejectedValueOnce(
      decodeMdmError(status, { code: status === 403 ? 'forbidden' : 'not_found' }),
    )
    const source = h.wrapper.findComponent({ name: 'SourceList' })
    await source.find('button').trigger('click')
    await flushPromises()
    expect(h.wrapper.findComponent({ name: 'ViewFacts' }).exists()).toBe(false)
    expect(h.wrapper.find('[data-testid=association-panel]').exists()).toBe(false)
    expect(h.wrapper.find('[role=alert]').exists()).toBe(true)
  },
)
it('shows authorization read failure and retries without treating it as read-only access', async () => {
  const h = await setup('device-detail', { device: 'device-01' })
  const effective = vi
    .spyOn(h.operations.authorization, 'effective')
    .mockRejectedValueOnce(decodeMdmError(503, { code: 'service_unavailable' }))
  await h.router.push({ name: 'devices', params: { tenant: TENANT } })
  await flushPromises()
  await h.router.push({ name: 'device-detail', params: { tenant: TENANT, device: 'device-01' } })
  await flushPromises()
  const authority = h.wrapper.find('[data-testid=association-authority]')
  expect(authority.find('[role=alert]').exists()).toBe(true)
  expect(h.wrapper.find('[data-testid=association-panel]').exists()).toBe(false)
  effective.mockRestore()
  await authority.find('button').trigger('click')
  await flushPromises()
  expect(h.wrapper.find('[data-testid=association-panel]').exists()).toBe(true)
})

it('displays the exact new origin coordinates used to create after the open detail becomes stale', async () => {
  const h = await setup('device-detail', { device: 'device-01' })
  const before = await h.devices.directory.detail('device-01')
  const receipt = await h.devices.enrollment.create(crypto.randomUUID(), {
    deviceId: 'device-01',
    password: 'A'.repeat(43),
    source: before.primaryMdmRegistration!.source,
    windowsProfile: 'Device',
  })
  h.domain.tick({
    kind: 'enrollment_bind',
    device: 'device-01',
    enrollment: receipt.enrollmentId,
    at: Math.floor(Date.now() / 1000),
  })
  const after = await h.devices.directory.detail('device-01')
  expect(after.primaryMdmRegistration!.generation).toBe(
    before.primaryMdmRegistration!.generation + 1,
  )
  const panel = await chooseAssociation(h)
  const coordinates = panel.find('[data-testid=confirmation-coordinates]')
  expect(coordinates.text()).toContain(after.primaryMdmRegistration!.registrationId)
  expect(coordinates.text()).not.toContain(before.primaryMdmRegistration!.registrationId)
  const displayed = coordinates.findAll('li').map((m) => m.text())
  await h.click('确认关联')
  const body = h.requests.findLast((r) => r.path === '/api/v1/device-associations')!.body as {
    mdm: { device: string; registrationId: string; generation: number }
    agent: { device: string; registrationId: string; generation: number }
  }
  for (const member of [body.mdm, body.agent])
    expect(
      displayed.some((text) =>
        text.includes(`${member.device} · ${member.registrationId} / ${member.generation}`),
      ),
    ).toBe(true)
})
it.each(['confirm', 'revoke', 'inactive-revoke'])(
  'shows the refreshed relation basis actually used by %s',
  async (action) => {
    const h = await setup('device-detail', { device: 'device-01' })
    await chooseAssociation(h)
    await h.click('确认关联')
    await vi.waitFor(() => expect(h.router.currentRoute.value.name).toBe('device-view-detail'))
    await flushPromises()
    const id = String(h.router.currentRoute.value.params['view'])
    const old = await h.devices.associations.get(id)
    const current = await h.devices.associations.confirm({
      operationId: crypto.randomUUID(),
      associationId: id,
      expectedVersion: old.version,
      mdm: old.members.find((m) => m.channel === 'mdm')!,
      agent: old.members.find((m) => m.channel === 'agent')!,
      evidence: 'Other operator current evidence',
    })
    if (action === 'inactive-revoke')
      await h.devices.enrollment.revoke(
        current.members[0]!.device,
        current.members[0]!.registrationId,
        crypto.randomUUID(),
      )
    await h.click('管理')
    await h.click('读取当前关系与主注册')
    const panel = h.wrapper.find('[data-testid=association-panel]'),
      basis = panel.find('[data-testid=association-basis]')
    expect(basis.text()).toContain(`${id} / ${current.version}`)
    expect(basis.text()).toContain(current.evidence)
    expect(basis.text()).not.toContain(old.evidence)
    if (action === 'inactive-revoke')
      expect(h.button('重新核实关联').attributes('disabled')).toBeDefined()
    await panel.find('input[type=checkbox]').setValue(true)
    await panel
      .findAll('textarea')
      [action === 'confirm' ? 0 : 1]!.setValue('Checked displayed current basis')
    await h.click(action === 'confirm' ? '重新核实关联' : '解除关联')
    const request = h.requests.findLast((r) => r.method === 'POST')!
    expect(request.body).toMatchObject({ expectedVersion: current.version })
    expect(request.path).toBe(
      action === 'confirm'
        ? '/api/v1/device-associations'
        : '/api/v1/device-associations/{id}/revoke',
    )
  },
)
it.each(['zh-CN', 'en-US'] as const)(
  'resolves all directory source options in %s',
  async (locale) => {
    const h = await setup()
    h.i18n.global.locale.value = locale
    await flushPromises()
    expect(
      h.wrapper
        .findAll('select')[2]!
        .findAll('option')
        .map((o) => o.text()),
    ).toEqual([locale === 'zh-CN' ? '全部' : 'All', 'Windows MDM', 'Apple MDM', 'Agent'])
  },
)

it('rejects a stale self-enrollment submit at the backend, refreshes admission and retains query/cancel', async () => {
  const { wrapper, transport, registrationChannels, devices, click } =
    await setup('self-enrollments')
  const { createRegistrationChannelsClient } =
    await import('../../../services/registrationChannels')
  const server = createRegistrationChannelsClient(transport, TENANT)
  const existing = await devices.registration.enroll(
    crypto.randomUUID(),
    'A'.repeat(43),
    'mdm.windows',
    'Device',
  )
  await server.change('windows_mdm', crypto.randomUUID(), 0, 'paused')
  expect(registrationChannels.allowed('windows_mdm')).toBe(true)
  await click('生成一次性交付口令')
  await wrapper.find('form input[type=checkbox]').setValue(true)
  const enroll = vi.spyOn(devices.registration, 'enroll')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(enroll).toHaveBeenCalledTimes(1)
  expect(wrapper.text()).toContain('已暂停新注册')
  expect(registrationChannels.allowed('windows_mdm')).toBe(false)
  // Programmatic submits cannot bypass the refreshed gate.
  await wrapper.find('form').trigger('submit')
  expect(enroll).toHaveBeenCalledTimes(1)
  expect(registrationChannels.allowed('macos_mdm')).toBe(true)
  const query = wrapper.findAll('form')[1]!
  await query.find('input').setValue(existing.enrollmentId)
  await query.trigger('submit')
  await flushPromises()
  await click('生成一次性交付口令')
  await wrapper.find('form input[type=checkbox]').setValue(true)
  expect(
    wrapper
      .findAll('button')
      .find((b) => b.text() === '更新口令并继续')!
      .attributes('disabled'),
  ).toBeDefined()
  await click('取消')
  expect((await devices.enrollment.status(existing.enrollmentId)).status).toBe('cancelled')
  await server.change('windows_mdm', crypto.randomUUID(), 1, 'allowed')
  await click('刷新状态与额度')
  expect(registrationChannels.allowed('windows_mdm')).toBe(true)
})

it('keeps unknown admission intent across navigation and explicitly replays the original CAS command', async () => {
  const { wrapper, router, loseReply, requests, registrationChannels } =
    await setup('registration-quotas')
  loseReply.path = '/api/v1/registration-channels/{channel}/admission'
  await registrationChannels.change('windows_mdm', 'paused').catch(() => {})
  const first = requests.filter(
    (r) => r.method === 'PUT' && r.path.includes('registration-channels'),
  )[0]!
  expect(registrationChannels.commands.get('windows_mdm')?.state).toBe('unknown')
  await router.push({ name: 'devices', params: { tenant: TENANT } })
  await router.push({ name: 'registration-quotas', params: { tenant: TENANT } })
  await flushPromises()
  expect(wrapper.text()).toContain('原操作结果未知')
  loseReply.path = ''
  await registrationChannels.change('windows_mdm', 'allowed', true)
  const writes = requests.filter(
    (r) => r.method === 'PUT' && r.path.includes('registration-channels'),
  )
  expect(writes).toHaveLength(2)
  expect(writes[1]!.body).toEqual(first.body)
  expect(writes[1]!.headers).toEqual(first.headers)
  expect(registrationChannels.status('windows_mdm')?.admission).toBe('paused')
})

it('allows a quota reader to select user queries while keeping edits and submission disabled', async () => {
  const { wrapper, router, operations, devices } = await setup('devices')
  const effective = operations.authorization.effective
  vi.spyOn(operations.authorization, 'effective').mockImplementation(async () => {
    const value = await effective()
    return {
      ...value,
      grants: value.grants.filter((g) => g.operation !== 'registration_configuration_write'),
    }
  })
  await router.push({ name: 'registration-quotas', params: { tenant: TENANT } })
  await flushPromises()
  const mode = wrapper.find('select')
  expect((mode.element as HTMLSelectElement).disabled).toBe(false)
  await mode.setValue('override')
  await wrapper.findAll('select')[1]!.setValue('33333333-3333-4333-8333-333333333333')
  await flushPromises()
  expect(wrapper.find('tbody').exists()).toBe(true)
  const edit = wrapper.get('form input[type=number]').element as HTMLInputElement
  expect(edit.closest('fieldset')?.disabled).toBe(true)
  const change = vi.spyOn(devices.registration, 'change')
  await wrapper.get('form').trigger('submit')
  expect(change).not.toHaveBeenCalled()
})

it('retains directory cursor and display columns when opening and returning from a detail', async () => {
  const f = await setup()
  await f.click('下一页')
  expect(f.wrapper.text()).toContain('device-21')
  const query = { ...f.router.currentRoute.value.query }
  await f.wrapper.find('tbody a').trigger('click')
  await flushPromises()
  await f.wrapper
    .findAll('a')
    .find((a) => a.text() === '设备目录')!
    .trigger('click')
  await flushPromises()
  expect(f.router.currentRoute.value.query).toEqual(query)
  expect(f.wrapper.text()).toContain('device-21')
  await f.wrapper.findAll('tbody a').at(-1)!.trigger('click')
  await flushPromises()
  await f.wrapper
    .findAll('a')
    .find((a) => a.text() === '设备目录')!
    .trigger('click')
  await flushPromises()
  expect(f.router.currentRoute.value.query).toEqual(query)
  await f.click('上一页')
  expect(f.wrapper.text()).toContain('device-01')
})
it('binds lock to the actual enrollment, clears its PIN, and queries an unknown operation across navigation', async () => {
  const f = await setup('device-detail', { device: 'device-02' }, { tab: 'management' })
  await f.click('锁定')
  const dialog = new DOMWrapper(document.body).get('[role=alertdialog]')
  await dialog.get('input[type=password]').setValue('123456')
  f.loseReply.path = '/api/v1/devices/{device}/operations'
  await dialog.get('form').trigger('submit')
  await flushPromises()
  expect((dialog.get('input[type=password]').element as HTMLInputElement).value).toBe('')
  const op = f.router.currentRoute.value.query['operation']
  expect(op).toBeTruthy()
  expect(
    f.requests.filter((r) => r.method === 'POST' && r.path.endsWith('/operations')),
  ).toHaveLength(1)
  await f.router.push({ name: 'devices', params: { tenant: TENANT } })
  await flushPromises()
  f.loseReply.path = ''
  await f.router.push({
    name: 'device-detail',
    params: { tenant: TENANT, device: 'device-02' },
    query: { operation: String(op), operationDevice: 'device-02' },
  })
  await flushPromises()
  expect(f.router.currentRoute.value.query['operation']).toBeUndefined()
  expect(f.wrapper.text()).toContain('unverified')
  expect(
    f.requests.filter((r) => r.method === 'POST' && r.path.endsWith('/operations')),
  ).toHaveLength(1)
})
it('disables Windows lock and requires the displayed name before wipe', async () => {
  const f = await setup('device-detail', { device: 'device-01' }, { tab: 'management' })
  expect(f.button('锁定').attributes('disabled')).toBeDefined()
  await f.click('擦除')
  const dialog = new DOMWrapper(document.body).get('[role=alertdialog]')
  const submit = dialog.get('button[type=submit]')
  expect(submit.attributes('disabled')).toBeDefined()
  await dialog.get('input').setValue('wrong')
  expect(submit.attributes('disabled')).toBeDefined()
  await dialog.get('input').setValue('device-01')
  expect(submit.attributes('disabled')).toBeUndefined()
  await dialog.get('form').trigger('submit')
  await flushPromises()
  expect(f.wrapper.text()).toContain('unverified')
})
