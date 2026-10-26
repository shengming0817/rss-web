import GroupsView from './GroupsView.vue'
import InventoryQuery from '../components/InventoryQuery.vue'
import DeviceGroupsPanel from '../components/DeviceGroupsPanel.vue'
import { VSelect, VAutocomplete, VTextField, VAlert } from 'vuetify/components'
import { encodeAssetQuery } from '../clients/asset-query'
import GroupDependencies from '../components/GroupDependencies.vue'
import { createSecurityClients as createFormalSecurityClients } from '../../security/client'
import TenantUserSelect from '../components/TenantUserSelect.vue'
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
import { createOperationsClients } from '../../../../demo/features/operations/client'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import { policyFeature } from '../../policies/routes'
import { securityFeature } from '../../security/routes'
import { operationsFeature } from '../../operations/routes'
import { settingsFeature } from '../../settings/routes'
import { deviceFeature } from '../routes'
import { createPolicyClients } from '../../../../demo/features/policies/client'
import { createDeviceClients } from '../client'
const wrappers: VueWrapper[] = []
it('shows channel communication separately and clears the MDM receipt after registering again', async () => {
  const h = await setup('device-detail', { device: 'device-01' })
  const before = await h.devices.directory.detail('device-01')
  expect(before.channels.map((c) => c.channel).sort()).toEqual(['agent', 'mdm'])
  const card = () => h.wrapper.find('[data-endpoint="device-01"]')
  async function openChannels() {
    await h.click('管理')
    h.wrapper.get('[data-device-channels]').element.setAttribute('open', '')
    await flushPromises()
  }
  await openChannels()
  for (const channel of before.channels) {
    expect(channel.lastCommunicationReceivedAt).not.toBeNull()
    expect(card().text()).toContain(
      new Date(channel.lastCommunicationReceivedAt! * 1000)
        .toISOString()
        .replace('T', ' ')
        .replace('.000Z', ' UTC'),
    )
  }
  expect(card().text()).not.toContain('后端暂未提供')
  expect(card().text()).toContain('当前注册')
  const enrollment = await h.devices.enrollment.create(crypto.randomUUID(), {
    deviceId: 'device-01',
    password: 'A'.repeat(43),
    source: before.primaryMdmRegistration!.source,
    windowsProfile: 'Device',
  })
  h.domain.tick({
    kind: 'enrollment_bind',
    device: 'device-01',
    enrollment: enrollment.enrollmentId,
    at: Math.floor(Date.now() / 1000),
  })
  await h.click('重新读取')
  await openChannels()
  const after = await h.devices.directory.detail('device-01')
  expect(after.channels.find((c) => c.channel === 'mdm')?.lastCommunicationReceivedAt).toBeNull()
  expect(card().text()).toContain('当前注册尚无有效通信记录')
  expect(after.channels.find((c) => c.channel === 'agent')?.lastCommunicationReceivedAt).toBe(
    before.channels.find((c) => c.channel === 'agent')?.lastCommunicationReceivedAt,
  )
})
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
      { path: '/tenants/:tenant/test/groups-hub', name: 'groups-hub', component: GroupsView },
      ...(deviceFeature.routes ?? []).map((route) =>
        route.name === 'device-groups'
          ? { path: route.path, name: route.name, component: DeviceGroupsPanel }
          : route,
      ),
      {
        path: '/tenants/:tenant/test/inventory-query',
        name: 'inventory-query',
        component: InventoryQuery,
      },
      policyFeature.entry,
      ...(policyFeature.routes ?? []),
      securityFeature.entry,
      ...(securityFeature.routes ?? []),
      operationsFeature.entry,
      ...(operationsFeature.routes ?? []),
      settingsFeature.entry,
      ...(settingsFeature.routes ?? []),
    ],
  })
  await router.push({
    name,
    params: { tenant: TENANT, ...params },
    query:
      name === 'device-detail' || name === 'device-view-detail'
        ? { tab: 'inventory', ...query }
        : query,
  })
  await router.isReady()
  const sessionState = shallowRef({
    status: 'authenticated',
    tenant: TENANT,
    identity: { principalId: ADMIN },
    session: { id: 'demo-session' },
  })
  const session = { state: sessionState } as unknown as IdentitySession
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
          security: createFormalSecurityClients(transport, TENANT),
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
      .findAll('button,a')
      .find((b) => b.isVisible() && b.text() === text)
    if (!result) throw new Error(`Missing button: ${text}`)
    return result
  }
  const click = async (text: string) => {
    await vi.waitFor(() => {
      button(text)
    })
    const target = button(text)
    const href = target.attributes('href')
    const before = router.currentRoute.value.fullPath
    const directoryPage =
      router.currentRoute.value.name === 'devices' && ['下一页', '上一页'].includes(text)
    await target.trigger(
      target.attributes('role') === 'tab' && !href && !target.classes().includes('v-tab')
        ? 'mousedown'
        : 'click',
      { button: 0, ctrlKey: false },
    )
    if (href?.startsWith('/'))
      await vi.waitFor(() =>
        expect(router.currentRoute.value.fullPath).toBe(router.resolve(href).fullPath),
      )
    if (directoryPage)
      await vi.waitFor(() => expect(router.currentRoute.value.fullPath).not.toBe(before))
    if (href?.startsWith('/') || directoryPage || text === '编辑人工资产信息') {
      await vi.waitFor(() =>
        expect(wrapper.find('section.console-page[aria-busy="true"]').exists()).toBe(false),
      )
    }
    await flushPromises()
    await flushPromises()
  }
  if (name === 'inventory-query') {
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('个人保存查询'))!
      .trigger('click')
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
    sessionState,
  }
}
async function confirmCredential() {
  const dialog = new DOMWrapper(document.body).get('[role=alertdialog]')
  await dialog
    .findAll('button')
    .find((button) => button.text() === '我已核对目标、当前注册和风险，确认操作')!
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
  await vi.waitFor(() => expect(wrapper.text()).toContain('当前没有结果'))
})
it('opens the existing registration owner from a software source-policy deep link', async () => {
  const { wrapper, requests, router } = await setup(
    'device-management',
    { device: 'device-01' },
    {},
  )
  expect(requests.some((r) => r.path === '/api/v1/devices/{device}/registrations')).toBe(true)
  expect(wrapper.text()).toContain('agent.builtin')
  await router.push({
    name: 'device-management',
    params: { tenant: TENANT, device: 'device-02' },
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
  await new DOMWrapper(document.body)
    .findAll('[role=dialog] button')
    .find((b) => b.text() === '取消')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('设备型号')
  await click('软件')
  await wrapper.get('[data-asset-field="device.software"] button').trigger('click')
  await flushPromises()
  await click('展开此来源')
  expect(wrapper.text()).toContain('旧分页失效')
  await click('重新读取')
  await click('软件')
  await wrapper.get('[data-asset-field="device.software"] button').trigger('click')
  await flushPromises()
  await click('展开此来源')
  expect(new DOMWrapper(document.body).text()).toContain('Enterprise Browser')
  await new DOMWrapper(document.body)
    .findAll('[role=dialog] button')
    .find((b) => b.text() === '关闭')!
    .trigger('click')
  await flushPromises()
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
  const { wrapper, click } = await setup('inventory-query')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  await click('读取任务状态')
  expect(wrapper.text()).toContain('运行中')
  await click('读取任务状态')
  await click('载入')
  expect(wrapper.text()).toContain('device-01')
  const facetSection = wrapper
    .findAll('section')
    .find((s) => s.find('h2').exists() && s.find('h2').text().includes('聚合'))
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
it('preserves secondary sort terms when renaming a saved query', async () => {
  const { wrapper, click, devices } = await setup('inventory-query')
  const sort = [
    { field: 'device.model', descending: true },
    { field: 'device.serial_number', descending: false },
  ]
  const saved = await devices.assets.save(crypto.randomUUID(), {
    operationId: crypto.randomUUID(),
    expectedRevision: 0,
    input: {
      action: 'put',
      definition: { name: 'Multi sort', query: encodeAssetQuery(null, [], sort) },
    },
  })
  await click('重新读取')
  await wrapper
    .findAll('button')
    .find((button) => button.text().includes('Multi sort'))!
    .trigger('click')
  await flushPromises()
  const form = wrapper.findAll('form').at(-1)!
  await form.find('input').setValue('Renamed')
  await form.trigger('submit')
  await flushPromises()
  expect((await devices.assets.readSaved(saved.id)).definition?.query.sort).toEqual(sort)
})
it('creates a group, edits its definition, previews and recomputes server membership', async () => {
  const { wrapper, click } = await setup('device-groups')
  const form = new DOMWrapper(document.body).get('[role=dialog] form')
  await form.get('[data-testid=group-name] input').setValue('New group')
  await form.trigger('submit')
  await flushPromises()
  await click('概览')
  expect(wrapper.text()).toContain('成员版本')
  expect(wrapper.findAll('[role=tab]').some((tab) => tab.text() === '规则')).toBe(false)
  await click('管理成员')
  await new DOMWrapper(document.body)
    .get('[role=dialog][data-state=open] .endpoint-picker .field-choice input')
    .setValue(true)
  await new DOMWrapper(document.body)
    .get('[role=dialog][data-state=open] .group-member-editor')
    .trigger('submit')
  await flushPromises()
  await click('成员')
  await click('读取任务状态')
  await click('读取任务状态')
  await click('载入')
  expect(wrapper.text()).toContain('device-01')
  await click('概览')
  await click('重读服务器值并比较')
  await click('成员')
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
  const { wrapper, click, devices } = await setup('inventory-query')
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
        query: encodeAssetQuery(
          {
            selector: { kind: 'device' },
            quantifier: 'one',
            criteria: {
              kind: 'predicate',
              field: 'device.model',
              op: 'eq',
              value: { kind: 'string', value: 'MacBook Pro' },
            },
          },
          ['device.model'],
          [{ field: 'device.model', descending: true }],
        ),
      },
    },
  })
  await form.find('input').setValue('My retained draft')
  await click('重读服务器值并比较')
  expect(form.find('input').element.value).toBe('My retained draft')
  const current = wrapper.find('[data-testid=server-definition]')
  expect(current.text()).toContain('Other operator')
  expect(current.text()).toContain('device.model')
  expect((current.findAll('input').at(-1)!.element as HTMLInputElement).value).toBe('MacBook Pro')
})
it('saves dynamic rules and renders unknown decisions, explanations and provenance', async () => {
  const { wrapper, click, devices, scenario } = await setup('device-groups')
  let form = new DOMWrapper(document.body).get('[role=dialog] form')
  await form.get('[data-testid=group-name] input').setValue('Dynamic')
  await setSelect(wrapperFor(form), form.get('[data-testid=group-kind]'), 'dynamic')
  await setSelect(wrapperFor(form), form.get('.group-criteria > .v-select'), 'predicate')
  const editor = form.find('.condition-editor')
  await setSelect(wrapper, editor.get('.v-select'), 'predicate')
  await setSelect(wrapper, editor.get('.v-autocomplete'), 'custom.is_loaner')
  await form.trigger('submit')
  await flushPromises()
  await click('读取任务状态')
  await click('读取任务状态')
  await click('读取任务状态')
  expect(
    wrapper
      .findAllComponents(VAlert)
      .filter((v) => v.props('type') === 'error')
      .map((v) => v.text()),
  ).toEqual([])
  await click('规则')
  await wrapper
    .findAll('button')
    .filter((b) => b.isVisible() && b.text() === '编辑')
    .at(-1)!
    .trigger('click')
  await flushPromises()
  form = new DOMWrapper(document.body).get('[role=dialog] form')
  await setSelect(wrapper, form.find('.condition-editor').findAll('.v-select').at(-1)!, true)
  await form.trigger('submit')
  await flushPromises()
  await click('读取任务状态')
  await click('读取任务状态')
  await click('读取任务状态')
  const group = (await devices.groups.list()).items.find((g) => g.presentation.name === 'Dynamic')!
  expect((await devices.groups.read(group.id)).criteria).toMatchObject({
    criteria: { value: { kind: 'boolean', value: true } },
  })
  await click('预览已保存版本')
  await click('成员解释')
  await click('读取任务状态')
  await click('读取任务状态')
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
    input: {
      action: 'edit',
      presentation: { name: 'Server changed name', description: 'Server description' },
    },
  })
  await click('概览')
  await click('编辑')
  form = new DOMWrapper(document.body).get('[role=dialog] form')
  await form.get('[data-testid=group-name] input').setValue('Retained group draft')
  await form
    .findAll('button')
    .find((b) => b.text() === '重读服务器值并比较')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.find('[data-testid=server-definition]').text()).toContain('Server changed name')
  expect(wrapper.find('[data-testid=server-definition]').text()).toContain('Server description')
  expect((form.get('[data-testid=group-name] input').element as HTMLInputElement).value).toBe(
    'Retained group draft',
  )
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
  const { wrapper, requests, click, loseReply } = await setup('inventory-query')
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

it('keeps the current group target when directory refresh fails', async () => {
  const { wrapper, click, scenario, devices } = await setup('device-groups')
  const other = crypto.randomUUID()
  await devices.groups.change(other, {
    operationId: crypto.randomUUID(),
    expectedRevision: 0,
    input: {
      action: 'create',
      assetContext: 'endpoint',
      presentation: { name: 'Other group', description: '' },
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
  await click('重新读取')
  expect(wrapper.get('[data-testid=server-definition]').text()).toContain('Pilot devices')
  scenario.set('normal')
  await click('删除')
  expect((await devices.groups.read(other)).group.deleted).toBe(false)
})
it('does not switch saved-query targets while the original write is unresolved', async () => {
  const { wrapper, click, devices, scenario } = await setup('inventory-query')
  const other = crypto.randomUUID()
  await devices.assets.save(other, {
    operationId: crypto.randomUUID(),
    expectedRevision: 0,
    input: {
      action: 'put',
      definition: { name: 'Other query', query: encodeAssetQuery(null, [], []) },
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
it('keeps an uncertain manual operation across rereads and tabs and replays the same request', async () => {
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
  await new DOMWrapper(document.body)
    .findAll('[role=dialog] button')
    .find((b) => b.text() === '取消')!
    .trigger('click')
  await flushPromises()
  await click('重新读取')
  await click('管理')
  await click('重启')
  await new DOMWrapper(document.body).get('[role=alertdialog] form').trigger('submit')
  await flushPromises()
  await click('资产信息')
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
it('selects static members from the authorized directory without identifier textareas', async () => {
  const { wrapper, click } = await setup('device-groups')
  await new DOMWrapper(document.body)
    .get('[role=dialog]')
    .findAll('button')
    .find((b) => b.text() === '取消')!
    .trigger('click')
  await flushPromises()
  await wrapper
    .findAll('button')
    .find((b) => b.text().includes('Pilot devices'))!
    .trigger('click')
  await flushPromises()
  expect(wrapper.find('.group-member-editor').exists()).toBe(false)
  await click('管理成员')
  const picker = new DOMWrapper(document.body).get('[role=dialog][data-state=open]')
  expect(picker.find('textarea').exists()).toBe(false)
  expect(picker.findAll('.endpoint-picker .field-choice').length).toBeGreaterThan(0)
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
  await new DOMWrapper(document.body)
    .findAll('[role=dialog] button')
    .find((b) => b.text() === '取消')!
    .trigger('click')
  await flushPromises()
  await click('管理')
  await click('重启')
  await new DOMWrapper(document.body).get('[role=alertdialog] form').trigger('submit')
  await flushPromises()
  expect(manual.get('fieldset').attributes('disabled')).toBeDefined()
  release()
  await flushPromises()
  devices.assets.assign = assign
  await click('资产信息')
  await click('编辑人工资产信息')
  expect(manual.text()).toContain('明确重放原操作')
  await click('明确重放原操作')
  const writes = requests.filter((r) => r.method === 'PUT')
  expect(writes).toHaveLength(2)
  expect(writes[1]!.body).toEqual(writes[0]!.body)
})
it('retains pending revoke confirmation across query updates and dismissal attempts until exact replay', async () => {
  const { wrapper, click, devices, router } = await setup('device-detail', { device: 'device-01' })
  await click('管理')
  wrapper
    .findAll('details')
    .find((d) => d.find('summary').text() === '注册凭据')!
    .element.setAttribute('open', '')
  await click('撤销凭据')
  const dialog = new DOMWrapper(document.body).get('[role=alertdialog]')
  expect(dialog.element.closest('.mdm-device-surface')).not.toBeNull()
  const revoke = devices.enrollment.revoke
  let release!: () => void
  const gate = new Promise<void>((done) => {
    release = done
  })
  const write = vi.spyOn(devices.enrollment, 'revoke').mockImplementation(async (...args) => {
    await revoke(...args)
    await gate
    throw networkErrorForTest()
  })
  await confirmCredential()
  const original = [...write.mock.calls[0]!]
  expect(dialog.get('button[aria-label=取消]').attributes('disabled')).toBeDefined()
  await dialog.trigger('keydown', { key: 'Escape' })
  await router.replace({ query: { operation: crypto.randomUUID(), operationDevice: 'device-01' } })
  await flushPromises()
  expect(document.querySelector('[role=alertdialog][data-state=open]')).not.toBeNull()
  expect(dialog.get('button[aria-label=取消]').attributes('disabled')).toBeDefined()
  release()
  await flushPromises()
  expect(dialog.text()).toContain('结果未知')
  await dialog.trigger('keydown', { key: 'Escape' })
  await dialog.get('button[aria-label=取消]').trigger('click')
  await flushPromises()
  expect(document.querySelector('[role=alertdialog][data-state=open]')).not.toBeNull()
  await router.replace({ query: {} })
  await flushPromises()
  expect(dialog.text()).toContain('结果未知')
  write.mockImplementation(revoke)
  await click('重读服务器值并比较')
  await click('明确重放原操作')
  expect(write.mock.calls).toEqual([original, original])
  expect(document.querySelector('[role=alertdialog][data-state=open]')).toBeNull()
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
  wrapper
    .findComponent(TenantUserSelect)
    .vm.$emit('update:modelValue', '33333333-3333-4333-8333-333333333333')
  await flushPromises()
  expect(wrapper.find('input[type=number]').exists()).toBe(true)
  await wrapper.find('input[type=number]').setValue('0')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(wrapper.find('tbody tr').findAll('td')[0]!.text()).toBe('0')
})
it('edits the canonical device owner in detail and locks an unknown write until explicit comparison and replay', async () => {
  const f = await setup('device-detail', { device: 'device-01' })
  await f.click('概览')
  const panel = () => f.wrapper.get('[data-personnel-device="device-01"]')
  await panel().get('[data-action=edit-owner]').trigger('click')
  await flushPromises()
  f.wrapper
    .findComponent(TenantUserSelect)
    .vm.$emit('update:modelValue', '33333333-3333-4333-8333-333333333333')
  f.loseReply.path = '/api/v1/devices/{device}/registration-user'
  await new DOMWrapper(document.body).get('[role=dialog] form').trigger('submit')
  await flushPromises()
  expect(
    new DOMWrapper(document.body).get('[role=dialog] fieldset').attributes('disabled'),
  ).toBeDefined()
  const writes = () =>
    f.requests.filter((r) => r.method === 'PUT' && r.path.endsWith('registration-user'))
  expect(writes()).toHaveLength(1)
  expect(panel().find('[data-action=replay-owner]').exists()).toBe(false)
  f.loseReply.path = ''
  await panel().get('[data-action=compare-owner]').trigger('click')
  await flushPromises()
  await panel().get('[data-action=replay-owner]').trigger('click')
  await flushPromises()
  expect(writes()).toHaveLength(2)
  expect(writes()[1]?.body).toEqual(writes()[0]?.body)
  expect(writes()[1]?.headers).toEqual(writes()[0]?.headers)
  expect((await f.devices.registration.responsibility('device-01')).user?.principalId).toBe(
    '33333333-3333-4333-8333-333333333333',
  )
  expect(panel().text()).toContain('Demo profile')
  expect(panel().text()).toContain('reviewer')
  await panel().get('[data-action=edit-owner]').trigger('click')
  await flushPromises()
  expect(panel().text()).toContain('Demo profile')
  f.wrapper.findComponent(TenantUserSelect).vm.$emit('update:modelValue', '')
  await new DOMWrapper(document.body).get('[role=dialog] form').trigger('submit')
  await flushPromises()
  expect((await f.devices.registration.responsibility('device-01')).user).toBeNull()
  expect(panel().text()).not.toContain('Demo profile')
  expect(f.requests.filter((r) => r.path.includes('user-profiles'))).toHaveLength(0)
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
it('clears an associated endpoint selection and rejects removed or invalid query targets', async () => {
  const h = await setup('device-detail', { device: 'device-01' })
  await chooseAssociation(h)
  await h.click('确认关联')
  await flushPromises()
  await h.click('历史')
  await h.click('性能数据')
  const selector = () =>
    h.wrapper
      .findAllComponents(VSelect)
      .find(
        (component) => component.props('label') === h.i18n.global.t('devices.originalEndpoint'),
      )!
  const target = selector()
    .props('items')!
    .find((item) => item.value)!.value as string
  const choose = async (value: string) => {
    selector().vm.$emit('update:modelValue', value)
    await vi.waitFor(() => expect(h.router.currentRoute.value.query['endpoint']).toBe(value))
    await flushPromises()
  }
  const performance = () => h.wrapper.findComponent({ name: 'DevicePerformance' })
  await choose(target)
  await flushPromises()
  expect(performance().props('device')).toBe(target)
  await choose('')
  await flushPromises()
  expect(performance().exists()).toBe(false)
  expect(h.router.currentRoute.value.query['endpoint']).toBe('')
  for (const endpoint of [undefined, 'unknown-endpoint']) {
    await h.router.replace({ query: { endpoint: target } })
    await flushPromises()
    expect(performance().exists()).toBe(true)
    await h.router.replace({ query: { endpoint } })
    await flushPromises()
    expect(performance().exists()).toBe(false)
    await h.click('重新读取')
    expect(performance().exists()).toBe(false)
  }
  await h.click('管理')
  await choose(target)
  await flushPromises()
  expect(h.wrapper.findComponent({ name: 'DeviceControlPanel' }).exists()).toBe(true)
  await choose('')
  await flushPromises()
  expect(h.wrapper.findComponent({ name: 'DeviceControlPanel' }).exists()).toBe(false)
})
it('restores an associated operation target while an explicit empty selection keeps its recovery identity', async () => {
  const h = await setup('device-detail', { device: 'device-01' })
  await chooseAssociation(h)
  await h.click('确认关联')
  await vi.waitFor(() => expect(h.router.currentRoute.value.name).toBe('device-view-detail'))
  await flushPromises()
  const params = { ...h.router.currentRoute.value.params },
    operation = crypto.randomUUID()
  await h.router.push({ name: 'devices', params: { tenant: TENANT } })
  await flushPromises()
  await h.router.push({
    name: 'device-view-management',
    params,
    query: { operation, operationDevice: 'device-01' },
  })
  await flushPromises()
  const panel = () => h.wrapper.findComponent({ name: 'DeviceControlPanel' })
  expect(panel().props('endpoint')).toMatchObject({ id: 'device-01' })
  h.wrapper
    .findAllComponents(VSelect)
    .find((component) => component.props('label') === h.i18n.global.t('devices.originalEndpoint'))!
    .vm.$emit('update:modelValue', '')
  await vi.waitFor(() => expect(h.router.currentRoute.value.query['endpoint']).toBe(''))
  await flushPromises()
  expect(panel().exists()).toBe(false)
  expect(h.router.currentRoute.value.query).toMatchObject({
    endpoint: '',
    operation,
    operationDevice: 'device-01',
  })
  await h.click('重新读取')
  expect(panel().exists()).toBe(false)
  for (const section of ['历史', '性能数据', '管理']) {
    await h.click(section)
    expect(
      h.wrapper
        .findAllComponents(VSelect)
        .find(
          (component) => component.props('label') === h.i18n.global.t('devices.originalEndpoint'),
        )!
        .props('modelValue'),
    ).toBe('')
    expect(panel().exists()).toBe(false)
    expect(h.wrapper.findComponent({ name: 'DeviceActivity' }).exists()).toBe(false)
    expect(h.wrapper.findComponent({ name: 'DevicePerformance' }).exists()).toBe(false)
    expect(h.router.currentRoute.value.query).toMatchObject({
      endpoint: '',
      operation,
      operationDevice: 'device-01',
    })
  }
})
it('locks an unknown association, survives navigation, and requires explicit exact POST replay', async () => {
  const h = await setup('device-detail', { device: 'device-01' })
  await chooseAssociation(h)
  h.loseReply.path = '/api/v1/device-associations'
  await h.click('确认关联')
  const original = h.requests.find((r) => r.method === 'POST')!.body
  await h.router.push({ name: 'devices', params: { tenant: TENANT } })
  await flushPromises()
  await h.router.push({
    name: 'device-detail',
    params: { tenant: TENANT, device: 'device-01' },
    query: { tab: 'inventory' },
  })
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
    await h.click('资产信息')
    await h.click('软件')
    await h.wrapper.get('[data-asset-field="device.software"] button').trigger('click')
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
    .mockRejectedValue(decodeMdmError(503, { code: 'service_unavailable' }))
  await h.router.push({ name: 'devices', params: { tenant: TENANT } })
  await flushPromises()
  await h.router.push({
    name: 'device-management',
    params: { tenant: TENANT, device: 'device-01' },
  })
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
        .findAllComponents(VSelect)
        .find((select) => select.attributes('data-testid') === 'directory-source')!
        .props('items')
        ?.map((item) => item.label),
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
  wrapper
    .findComponent(TenantUserSelect)
    .vm.$emit('update:modelValue', '33333333-3333-4333-8333-333333333333')
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
  await vi.waitFor(() =>
    expect(f.wrapper.findAll('a').some((a) => a.text() === '返回设备目录')).toBe(true),
  )
  await f.click('返回设备目录')
  await flushPromises()
  expect(f.router.currentRoute.value.query).toEqual(query)
  expect(f.wrapper.text()).toContain('device-21')
  await f.wrapper.findAll('tbody a').at(-1)!.trigger('click')
  await flushPromises()
  await vi.waitFor(() =>
    expect(f.wrapper.findAll('a').some((a) => a.text() === '返回设备目录')).toBe(true),
  )
  await f.click('返回设备目录')
  await flushPromises()
  expect(f.router.currentRoute.value.query).toEqual(query)
  await f.click('上一页')
  expect(f.wrapper.text()).toContain('device-01')
})
it('binds lock to the actual enrollment, clears its PIN, and queries an unknown operation across navigation', async () => {
  const f = await setup('device-management', { device: 'device-02' })
  await f.click('锁定')
  const dialog = new DOMWrapper(document.body).get('[role=alertdialog]')
  await dialog.get('input[type=password]').setValue('123456')
  f.loseReply.path = '/api/v1/devices/{device}/operations'
  await dialog.get('form').trigger('submit')
  await flushPromises()
  expect(dialog.find('input[type=password]').exists()).toBe(false)
  await vi.waitFor(() => expect(f.wrapper.text()).toContain('提交结果未知'))
  const op = f.router.currentRoute.value.query['operation']
  expect(op).toBeTruthy()
  expect(
    f.requests.filter((r) => r.method === 'POST' && r.path.endsWith('/operations')),
  ).toHaveLength(1)
  await f.router.push({ name: 'devices', params: { tenant: TENANT } })
  await flushPromises()
  f.loseReply.path = ''
  await f.router.push({
    name: 'device-management',
    params: { tenant: TENANT, device: 'device-02' },
    query: { operation: String(op), operationDevice: 'device-02' },
  })
  await flushPromises()
  await vi.waitFor(() => expect(f.router.currentRoute.value.query['operation']).toBeUndefined())
  await vi.waitFor(() => expect(f.wrapper.text()).toContain('unverified'))
  expect(
    f.requests.filter((r) => r.method === 'POST' && r.path.endsWith('/operations')),
  ).toHaveLength(1)
})
it('disables Windows lock and requires the displayed name before wipe', async () => {
  const f = await setup('device-management', { device: 'device-01' })
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
  await vi.waitFor(() => expect(f.wrapper.text()).toContain('unverified'))
})

it('rejects an invalid condition locally without entering unknown-write recovery', async () => {
  const { wrapper, requests } = await setup('device-groups')
  const form = new DOMWrapper(document.body).get('[role=dialog] form')
  await form.get('[data-testid=group-name] input').setValue('Invalid identity')
  await setSelect(wrapperFor(form), form.get('[data-testid=group-kind]'), 'dynamic')
  await setSelect(wrapper, form.get('.v-expansion-panel .v-select'), 'local_user')
  wrapper
    .findAllComponents(VTextField)
    .find((component) => component.props('label') === 'SID')!
    .vm.$emit('update:modelValue', 'invalid-sid')
  await flushPromises()
  await form.trigger('submit')
  await flushPromises()
  expect(requests.filter((r) => r.method === 'POST')).toHaveLength(0)
  expect(new DOMWrapper(document.body).text()).toContain('请求无效，请检查输入。')
  expect(wrapper.text()).not.toContain('明确重放原操作')
})

it('keeps Group save errors and exact unknown-write recovery inside its dialog', async () => {
  const { wrapper, requests, loseReply, scenario } = await setup('device-groups')
  const dialog = new DOMWrapper(document.body).get('[role=dialog][data-state=open]')
  await dialog.get('[data-testid=group-name] input').setValue('Recover in current drawer')
  scenario.set('denied')
  await dialog.get('form').trigger('submit')
  await flushPromises()
  expect(dialog.get('.v-alert[role=alert]').text()).toContain('权限')
  scenario.set('normal')
  loseReply.path = '/api/v1/groups/{id}'
  await dialog.get('form').trigger('submit')
  await flushPromises()
  expect(dialog.get('.v-alert[role=alert]').text()).toContain('提交结果未知')
  const original = requests.filter((r) => r.method === 'POST').at(-1)!.body
  expect(dialog.get('fieldset').attributes('disabled')).toBeDefined()
  loseReply.path = ''
  await dialog
    .findAll('button')
    .find((b) => b.text() === '重读服务器值并比较')!
    .trigger('click')
  await flushPromises()
  await dialog
    .findAll('button')
    .find((b) => b.text() === '明确重放原操作')!
    .trigger('click')
  await flushPromises()
  const writes = requests.filter((r) => r.method === 'POST')
  expect(writes).toHaveLength(3)
  expect(writes[2]!.body).toEqual(original)
  expect(new DOMWrapper(document.body).find('[role=dialog][data-state=open]').exists()).toBe(false)
  expect(wrapper.text()).toContain('Recover in current drawer')
})

it.each([
  [403, 'run'],
  [404, 'run'],
  [403, 'items'],
  [404, 'items'],
] as const)(
  'distinguishes scoped last-known facts and clears detail after %s on %s',
  async (status, request) => {
    const h = await setup('devices')
    const scope = { kind: 'macos_applications' as const, root: 'user' as const, uid: 501 }
    const id = '22222222-2222-4222-8222-222222222222'
    const evidence = {
      scope,
      source: 'agent.native' as const,
      registration: id,
      registrationGeneration: 1,
      dataset: 'memory',
      epoch: id,
      snapshotId: id,
      observedAt: 20,
      receivedAt: 21,
      actor: null,
    }
    const quality = {
      dataset: 'memory',
      templateVersion: '1',
      fingerprint: 'frozen',
      coverage: { id: 'memory', version: '1', definition: 'frozen', format: 'typed-fields-v1' },
      complete: false,
      source: 'agent.native' as const,
      channel: 'agent' as const,
      registration: id,
      registrationGeneration: 1,
      epoch: id,
      runId: id,
      sequence: 2,
      result: 'partial' as const,
      deliveryPending: false,
      fields: [
        {
          scope,
          field: 'device.memory.bytes',
          quality: 'unknown' as const,
          reason: 'incomplete',
          status: null,
          receivedAt: 21,
          itemCount: 1,
          invalidItems: 1,
        },
      ],
    }
    vi.spyOn(h.devices.assets, 'scopes').mockResolvedValue({
      device: 'device-01',
      items: [scope],
      nextCursor: null,
      watermark: 21,
    })
    vi.spyOn(h.devices.assets, 'inventory').mockResolvedValue({
      device: 'device-01',
      collectionScope: scope,
      channels: ['agent'],
      lists: {},
      revisions: {},
      quality: [quality],
      fields: {
        'device.memory.bytes': {
          field: 'device.memory.bytes',
          state: { kind: 'unknown', reason: 'incomplete' },
          sources: [
            {
              state: { kind: 'unknown', reason: 'incomplete' },
              evidence,
              lastKnown: {
                value: { kind: 'integer', value: 987654 },
                evidence: { ...evidence, observedAt: 10 },
              },
            },
          ],
        },
      },
    })
    const readRun = vi.spyOn(h.devices.assets, 'collectionRun').mockResolvedValue({
      id,
      quality,
      startedAt: 20,
      finishedAt: 21,
      reason: 'incomplete',
      delivery: { projection: 'pending', receipt: null },
    })
    const readItems = vi.spyOn(h.devices.assets, 'collectionItems').mockResolvedValue({
      items: [
        {
          index: 0,
          quality: 'success',
          value: {
            kind: 'object',
            value: {
              id: { kind: 'string', value: 'com.example.verified' },
              validated: { kind: 'boolean', value: true },
              versions: { kind: 'array', value: [{ kind: 'integer', value: 12 }] },
            },
          },
        },
        { index: 1, quality: 'invalid', value: null },
      ],
      nextCursor: null,
    })
    await h.router.push({
      name: 'device-detail',
      params: { tenant: TENANT, device: 'device-01' },
      query: { tab: 'inventory' },
    })
    await flushPromises()
    await h.click('用户与安装范围资产')
    const scoped = h.wrapper.get('[data-testid=scope-inventory]')
    await scoped.findAll('select')[1]!.setValue(JSON.stringify(scope))
    await flushPromises()
    const value = scoped.get('.asset-value')
    expect(value.get('strong').text()).toBe('结果不确定')
    expect(value.text()).toContain('采集不完整')
    const historical = value.findAll('dt').find((dt) => dt.text().includes('最后已知值'))!
    expect(historical.element.nextElementSibling?.textContent).toContain('987654')
    expect(historical.element.nextElementSibling?.textContent).toContain('10')
    const current = value.findAll('dt').find((dt) => dt.text() === '当前状态')!
    expect(current.element.nextElementSibling?.textContent).not.toContain('987654')
    await scoped
      .findAll('button')
      .find((b) => b.text() === '来源与历史证据')!
      .trigger('click')
    await flushPromises()
    const run = scoped.get('[data-collection-run]')
    expect(run.text()).toContain('部分结果')
    expect(run.text()).toContain('等待资产投影')
    if (request === 'items') {
      await run
        .findAll('button')
        .find((b) => b.text() === '逐条质量')!
        .trigger('click')
      await flushPromises()
      expect(run.find('ol li').exists()).toBe(true)
      expect(run.text()).toContain('com.example.verified')
      expect(run.text()).toContain('不完整清单不会替换最后可信资产')
      readItems.mockRejectedValueOnce(
        decodeMdmError(status, {
          code: status === 403 ? 'permission_denied' : 'inventory_not_found',
        }),
      )
      await run
        .findAll('button')
        .find((b) => b.text() === '逐条质量')!
        .trigger('click')
    } else {
      readRun.mockRejectedValueOnce(
        decodeMdmError(status, {
          code: status === 403 ? 'permission_denied' : 'inventory_not_found',
        }),
      )
      await run
        .findAll('button')
        .find((b) => b.text() === '重新读取')!
        .trigger('click')
    }
    await flushPromises()
    expect(h.wrapper.find('[data-testid=scope-inventory]').exists()).toBe(false)
    expect(h.wrapper.find('[data-collection-run]').exists()).toBe(false)
    expect(h.wrapper.text()).not.toContain('987654')
    expect(h.wrapper.text()).not.toContain('ThinkPad T14')
  },
)

it.each([
  [403, 'inventory'],
  [403, 'list'],
  [404, 'inventory'],
  [409, 'list'],
] as const)(
  'preserves scoped rejection and invalidates the parent after %s on %s',
  async (status, request) => {
    const h = await setup('devices')
    const scope = { kind: 'macos_applications' as const, root: 'user' as const, uid: 501 }
    const id = '22222222-2222-4222-8222-222222222222'
    const evidence = {
      scope,
      source: 'agent.native' as const,
      registration: id,
      registrationGeneration: 1,
      dataset: 'applications',
      epoch: id,
      snapshotId: id,
      observedAt: 20,
      receivedAt: 21,
      actor: null,
    }
    const state = { kind: 'known' as const, count: 2, digest: 'frozen' }
    vi.spyOn(h.devices.assets, 'scopes').mockResolvedValue({
      device: 'device-01',
      items: [scope],
      nextCursor: null,
      watermark: 21,
    })
    const inventory = vi.spyOn(h.devices.assets, 'inventory').mockResolvedValue({
      device: 'device-01',
      collectionScope: scope,
      channels: ['agent'],
      revisions: {},
      quality: [],
      fields: {
        'device.memory.bytes': {
          field: 'device.memory.bytes',
          state: { kind: 'known', value: { kind: 'integer', value: 987654 } },
          sources: [],
        },
      },
      lists: {
        'device.software.installations': {
          state,
          sources: [{ state, evidence, cursor: 'first' }],
          itemKey: null,
          cursor: 'first',
        },
      },
    })
    const items = vi.spyOn(h.devices.assets, 'listItems').mockResolvedValue({
      items: [{ kind: 'string', value: 'scope-private-item' }],
      total: 2,
      watermark: 21,
      nextCursor: 'next',
    })
    await h.router.push({
      name: 'device-detail',
      params: { tenant: TENANT, device: 'device-01' },
      query: { tab: 'inventory' },
    })
    await flushPromises()
    await h.click('用户与安装范围资产')
    const scoped = h.wrapper.get('[data-testid=scope-inventory]')
    await scoped.findAll('select')[1]!.setValue(JSON.stringify(scope))
    await flushPromises()
    await h.wrapper
      .findAll('button')
      .find((b) => b.text() === '硬件')!
      .trigger('click')
    expect(h.wrapper.text()).toContain('ThinkPad T14')
    expect(scoped.text()).toContain('987654')
    const rejection = decodeMdmError(status, {
      code:
        status === 403
          ? 'permission_denied'
          : status === 404
            ? 'inventory_not_found'
            : 'device_view_cursor_invalidated',
    })
    if (request === 'inventory') {
      inventory.mockRejectedValueOnce(rejection)
      await scoped
        .findAll('button')
        .find((b) => b.text() === '重新读取')!
        .trigger('click')
    } else {
      await scoped
        .findAll('button')
        .find((b) => b.text() === '展开此来源')!
        .trigger('click')
      await flushPromises()
      expect(scoped.text()).toContain('scope-private-item')
      items.mockRejectedValueOnce(rejection)
      await scoped
        .findAll('button')
        .find((b) => b.text() === '下一页')!
        .trigger('click')
    }
    await flushPromises()
    expect(h.wrapper.text()).not.toContain('987654')
    expect(h.wrapper.text()).not.toContain('scope-private-item')
    expect(h.wrapper.get('[role=alert]').text()).toContain(
      status === 403 ? '请求被拒绝' : status === 404 ? '对象或操作不存在' : '旧分页失效',
    )
    if (status === 409) {
      expect(h.wrapper.find('[data-testid=scope-inventory]').exists()).toBe(true)
      expect(h.wrapper.text()).toContain('ThinkPad T14')
      expect(scoped.findAll('select')[1]!.element.value).toBe('')
    } else {
      expect(h.wrapper.find('[data-testid=scope-inventory]').exists()).toBe(false)
      expect(h.wrapper.text()).not.toContain('ThinkPad T14')
    }
  },
)
it('renders shared fields in saved layout order after reloading the detail', async () => {
  const f = await setup('device-detail', { device: 'device-01' })
  await f.devices.assets.saveFieldLayout({
    operationId: crypto.randomUUID(),
    expectedRevision: 0,
    input: {
      groups: [
        {
          id: crypto.randomUUID(),
          name: 'Ordered assets',
          fields: ['custom.is_loaner', 'custom.asset_tag'],
        },
      ],
    },
  })
  await f.router.push({ name: 'devices', params: { tenant: TENANT } })
  await f.router.push({
    name: 'device-detail',
    params: { tenant: TENANT, device: 'device-01' },
    query: { tab: 'inventory' },
  })
  await flushPromises()
  await f.click('Ordered assets')
  const labels = f.wrapper
    .findAll('[data-asset-field] td:first-child strong')
    .map((label) => label.text())
  expect(labels).toEqual(['借用设备', '资产编号'])
})
it('compares a deleted group inside its unknown-result modal before replaying the original delete', async () => {
  const f = await setup('device-groups')
  await f.click('取消')
  await f.wrapper
    .findAll('button')
    .find((b) => b.text().includes('Pilot devices'))!
    .trigger('click')
  await flushPromises()
  await f.click('删除')
  f.loseReply.path = '/api/v1/groups/{id}'
  const dialog = new DOMWrapper(document.body).get('[role=alertdialog]')
  await dialog
    .findAll('button')
    .find((b) => b.text() === '删除')!
    .trigger('click')
  await flushPromises()
  f.loseReply.path = ''
  await dialog
    .findAll('button')
    .find((b) => b.text() === '重读服务器值并比较')!
    .trigger('click')
  await flushPromises()
  const replay = dialog.findAll('button').find((b) => b.text() === '明确重放原操作')!
  expect(replay.attributes('disabled')).toBeUndefined()
  await replay.trigger('click')
  await flushPromises()
  expect(new DOMWrapper(document.body).find('[role=alertdialog]').exists()).toBe(false)
})
it('edits shared groups in one drawer and recovers an unknown saved layout through comparison and exact replay', async () => {
  const f = await setup('device-detail', { device: 'device-01' })
  await f.click('管理扩展分组')
  const dialog = () => new DOMWrapper(document.body).get('[role=dialog][data-state=open]')
  await f.click('新增分组')
  await dialog().get('input[maxlength="40"]').setValue('Shared operations')
  const fields = dialog().findAll('.field-choice')
  await fields
    .find((row) => row.text().includes('资产编号'))!
    .get('input')
    .setValue(true)
  await fields
    .find((row) => row.text().includes('借用设备'))!
    .get('input')
    .setValue(true)
  await dialog().findAll('ol').at(-1)!.findAll('button').at(-2)!.trigger('click')
  f.loseReply.path = '/api/v1/asset-field-layout'
  await f.click('保存分组')
  expect(dialog().get('[role=alert]').text()).toContain('提交结果未知')
  const original = f.requests.find(
    (r) => r.method === 'PUT' && r.path === '/api/v1/asset-field-layout',
  )!.body
  f.loseReply.path = ''
  await f.click('重读服务器值并比较')
  await f.click('明确重放原操作')
  const writes = f.requests.filter(
    (r) => r.method === 'PUT' && r.path === '/api/v1/asset-field-layout',
  )
  expect(writes).toHaveLength(2)
  expect(writes[1]!.body).toEqual(original)
  expect((await f.devices.assets.fieldLayout()).groups[0]?.fields[0]).toBe('custom.is_loaner')
  expect(new DOMWrapper(document.body).find('[role=dialog][data-state=open]').exists()).toBe(false)
})
it('chooses an authorized referenced group in a popover without displaying identifier fields', async () => {
  const f = await setup('device-groups')
  const dialog = new DOMWrapper(document.body).get('[role=dialog][data-state=open]')
  await dialog.get('[data-testid=group-name] input').setValue('Nested managed devices')
  await setSelect(wrapperFor(dialog), dialog.get('[data-testid=group-kind]'), 'dynamic')
  await setSelect(wrapperFor(dialog), dialog.get('.group-criteria > .v-select'), 'group')
  await flushPromises()
  await dialog.get('.group-picker > button').trigger('click')
  await flushPromises()
  await new DOMWrapper(document.body)
    .get('.group-picker-content')
    .findAll('button')
    .find((b) => b.text() === 'Pilot devices')!
    .trigger('click')
  await flushPromises()
  expect(dialog.get('.group-picker').text()).toContain('Pilot devices')
  await dialog.get('form').trigger('submit')
  await flushPromises()
  expect(f.requests.filter((r) => r.method === 'POST').at(-1)?.body).toMatchObject({
    input: {
      criteria: {
        criteria: {
          kind: 'group',
          groupId: '33333333-3333-4333-8333-333333333333',
          op: 'member_of',
        },
      },
    },
  })
})

it('searches the complete authorized device set by personnel through the view API', async () => {
  const f = await setup('devices')
  const me = await f.devices.registration.me()
  await f.devices.registration.assign('device-02', crypto.randomUUID(), 0, {
    tenantId: TENANT,
    instanceId: me.instanceId,
    principalId: ADMIN,
  })
  const result = await f.devices.views.list({ limit: 1, filter: "search=icontains='Demo profile'" })
  expect(result.items).toHaveLength(1)
  expect(
    (await f.devices.views.statistics("search=icontains='Demo profile'")).statistics
      .deviceViewCount,
  ).toBe(1)
  expect(result.items[0]?.endpoints[0]?.id).toBe('device-02')
  const login = await f.devices.views.list({ limit: 1, filter: "search=icontains='demo'" })
  expect(login.items[0]?.endpoints[0]?.registrationUser?.display?.login).toBe('demo')
  const stale = await f.devices.views.list({ limit: 1 })
  await f.devices.registration.assign('device-02', crypto.randomUUID(), 1, null)
  await expect(f.devices.views.list({ limit: 1, cursor: stale.nextCursor! })).rejects.toMatchObject(
    { code: 'device_view_cursor_invalidated' },
  )
})

it('restarts an invalidated first page even when its route does not change', async () => {
  const f = await setup()
  const list = vi.spyOn(f.devices.views, 'list')
  list.mockRejectedValueOnce(decodeMdmError(409, { code: 'device_view_cursor_invalidated' }))
  await f.wrapper.get('form').trigger('submit')
  await flushPromises()
  await vi.waitFor(() =>
    expect(f.wrapper.text()).toContain(f.i18n.global.t('devices.restartDirectory')),
  )
  const before = f.router.currentRoute.value.fullPath
  expect(f.wrapper.find('tbody').exists()).toBe(false)
  const calls = list.mock.calls.length
  await f.wrapper.get('input[type=search]').setValue('unsubmitted draft')
  await f.wrapper.get('form + p button').trigger('click')
  await flushPromises()
  expect(f.router.currentRoute.value.fullPath).toBe(before)
  await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(calls + 1))
  expect(list.mock.lastCall![0]?.cursor).toBeUndefined()
  expect(list.mock.lastCall![0]?.filter).toBeUndefined()
  expect(f.wrapper.text()).toContain('device-01')
})

it('restarts an invalidated deep page with its applied filters and columns and one request', async () => {
  const f = await setup(
    'devices',
    {},
    { assetState: 'active', descending: 'true', columns: 'status' },
  )
  await f.click('下一页')
  const applied = { ...f.router.currentRoute.value.query }
  expect(applied['cursor']).toBeTruthy()
  const list = vi.spyOn(f.devices.views, 'list')
  list.mockRejectedValueOnce(decodeMdmError(409, { code: 'device_view_cursor_invalidated' }))
  await f.router.replace({ query: { ...applied, trail: ['', ''] } })
  await flushPromises()
  expect(f.wrapper.find('tbody').exists()).toBe(false)
  const calls = list.mock.calls.length
  await f.wrapper.get('input[type=search]').setValue('unsubmitted draft')
  await f.wrapper.get('form + p button').trigger('click')
  await flushPromises()
  await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(calls + 1))
  expect(f.router.currentRoute.value.query).toEqual({
    assetState: 'active',
    descending: 'true',
    columns: 'status',
  })
  expect(list.mock.lastCall![0]).toMatchObject({
    filter: "(assetState=='active')",
    sort: ['-key'],
    limit: 20,
  })
  expect(list.mock.lastCall![0]?.cursor).toBeUndefined()
  expect(f.wrapper.findAll('thead th')).toHaveLength(2)
  // A regular query submission also starts a fresh window, even with unchanged filters.
  await f.click('下一页')
  const before = list.mock.calls.length
  await f.wrapper.get('form').trigger('submit')
  await flushPromises()
  await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(before + 1))
  expect(f.router.currentRoute.value.query['cursor']).toBeUndefined()
  expect(f.router.currentRoute.value.query['trail']).toBeUndefined()
})

it('preserves hidden Group deletion blockers and withdraws the decision on a failed next page', async () => {
  const f = await setup()
  const references = vi
    .spyOn(f.devices.groups, 'references')
    .mockResolvedValueOnce({ items: [], nextCursor: 'opaque', deletionBlocked: true })
    .mockRejectedValueOnce(decodeMdmError(409, { code: 'operation_conflict' }))
    .mockResolvedValueOnce({ items: [], nextCursor: null, deletionBlocked: false })
  const wrapper = mount(GroupDependencies, {
    props: { group: '11111111-1111-4111-8111-111111111111' },
    global: {
      plugins: [f.router, f.i18n],
      provide: { [mdmKey as symbol]: { tenant: TENANT, session: f.session, devices: f.devices } },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  expect(wrapper.emitted('loaded')?.at(-1)).toEqual([true])
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '下一页')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.emitted('loaded')?.at(-1)).toEqual([undefined])
  expect(wrapper.findAll('button').some((b) => b.text() === '下一页')).toBe(false)
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '重新读取')!
    .trigger('click')
  await flushPromises()
  expect(references.mock.lastCall![1]?.cursor).toBeUndefined()
  expect(wrapper.emitted('loaded')?.at(-1)).toEqual([false])
})

it('clears directory statistics when the principal changes on a continuation page', async () => {
  const f = await setup()
  await f.click('下一页')
  expect(f.router.currentRoute.value.query['cursor']).toBeTruthy()
  expect(f.wrapper.find('.device-statistics').exists()).toBe(true)
  const stats = vi
    .spyOn(f.devices.views, 'statistics')
    .mockRejectedValueOnce(decodeMdmError(403, { code: 'permission_denied' }))
  vi.spyOn(f.devices.views, 'list').mockRejectedValueOnce(
    decodeMdmError(403, { code: 'permission_denied' }),
  )
  f.sessionState.value = {
    ...f.sessionState.value,
    identity: { principalId: '44444444-4444-4444-8444-444444444444' },
  }
  await flushPromises()
  expect(stats).toHaveBeenCalledTimes(1)
  expect(f.wrapper.find('.device-statistics').exists()).toBe(false)
  expect(f.wrapper.find('tbody').exists()).toBe(false)
})

it('withdraws cached directory counts when a continuation loses its authority', async () => {
  const f = await setup()
  expect(f.wrapper.find('.device-statistics').exists()).toBe(true)
  vi.spyOn(f.devices.views, 'list').mockRejectedValueOnce(
    decodeMdmError(403, { code: 'permission_denied' }),
  )
  await f.click('下一页')
  expect(f.wrapper.find('.device-statistics').exists()).toBe(false)
  expect(f.wrapper.find('tbody').exists()).toBe(false)
})

it('keeps inventory filters in all fields and opens category facts in a detail dialog', async () => {
  const f = await setup('device-detail', { device: 'device-01' })
  expect(f.wrapper.find('input[aria-label="筛选字段、值或来源"]').exists()).toBe(false)
  await f.click('硬件')
  const row = f.wrapper.get('[data-asset-field="device.model"]')
  await row.get('button').trigger('click')
  await flushPromises()
  const dialog = new DOMWrapper(document.body).get('[role=dialog][data-state=open]')
  expect(dialog.text()).toContain('ThinkPad T14')
  await dialog
    .findAll('button')
    .find((b) => b.text() === '关闭')!
    .trigger('click')
  await f.click('全部字段与映射')
  await f.wrapper.get('input[type=search]').setValue('nothing-matches')
  expect(f.wrapper.findAll('[data-asset-field]')).toHaveLength(0)
  await f.click('硬件')
  expect(f.wrapper.get('[data-asset-field="device.model"]').text()).toContain('ThinkPad T14')
  await f.click('全部字段与映射')
  expect(f.wrapper.findAll('[data-asset-field]')).toHaveLength(0)
  await f.wrapper.get('input[type=search]').setValue('device.model')
  await f.click('映射与来源')
  await f.click('读取映射引用')
  expect(f.requests.some((r) => r.path === '/api/v1/asset-fields/{field}/references')).toBe(true)
  expect(f.wrapper.text()).toContain('当前没有映射引用')
  await f.click('原始数据')
  expect(f.wrapper.get('.device-json').text()).toContain('ThinkPad T14')
})

it('does not apply a late manual inventory read after switching the selected associated endpoint', async () => {
  const f = await setup('device-detail', { device: 'device-01' })
  await chooseAssociation(f)
  await f.click('确认关联')
  await vi.waitFor(() => expect(f.router.currentRoute.value.name).toBe('device-view-detail'))
  await f.click('资产信息')
  const reference = {
    kind: 'association' as const,
    id: String(f.router.currentRoute.value.params['view']),
  }
  const value = await f.devices.views.detail(reference)
  const [a, b] = value.endpoints.map((e) => e.id)
  const inventoryA = await f.devices.assets.inventory(a!)
  let finish!: (value: typeof inventoryA) => void
  vi.spyOn(f.devices.assets, 'inventory').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const select = f.wrapper
    .findAllComponents(VSelect)
    .find((component) => component.props('label') === f.i18n.global.t('devices.originalEndpoint'))!
  select.vm.$emit('update:modelValue', a)
  await vi.waitFor(() => expect(f.router.currentRoute.value.query['endpoint']).toBe(a))
  await flushPromises()
  await f.button('编辑人工资产信息').trigger('click')
  await flushPromises()
  await vi.waitFor(() => expect(typeof finish).toBe('function'))
  select.vm.$emit('update:modelValue', b)
  await vi.waitFor(() => expect(f.router.currentRoute.value.query['endpoint']).toBe(b))
  await flushPromises()
  finish(inventoryA)
  await flushPromises()
  expect(f.wrapper.findComponent({ name: 'ManualPanel' }).exists()).toBe(false)
  await f.click('编辑人工资产信息')
  const manual = f.wrapper.getComponent({ name: 'ManualPanel' })
  expect(manual.props('device')).toBe(b)
  expect(manual.props('inventory').device).toBe(b)
})

it('keeps both original endpoint identities in the associated scalar field detail', async () => {
  const f = await setup('device-detail', { device: 'device-01' })
  await chooseAssociation(f)
  const candidate = f.wrapper.get('[data-testid=association-panel] input[type=radio]:checked')
    .element as HTMLInputElement
  for (const device of ['device-01', candidate.value]) {
    const inventory = await f.devices.assets.inventory(device)
    await f.devices.assets.assign(device, 'custom.asset_tag', {
      operationId: crypto.randomUUID(),
      expectedRevision: inventory.revisions['custom.asset_tag'] ?? 0,
      input: { action: 'set', value: { kind: 'string', value: 'TAG-' + device } },
    })
  }
  await f.click('确认关联')
  await vi.waitFor(() => expect(f.router.currentRoute.value.name).toBe('device-view-detail'))
  await f.click('资产信息')
  await f.click('未分组扩展字段')
  await f.wrapper.get('[data-asset-field="custom.asset_tag"] button').trigger('click')
  await flushPromises()
  const dialog = new DOMWrapper(document.body).get('[role=dialog][data-state=open]')
  const evidence = dialog.findAll('[data-source-endpoint]')
  expect(new Set(evidence.map((section) => section.attributes('data-source-endpoint'))).size).toBe(
    2,
  )
})

it('automatically observes a definition task before reading the separately published member set and stops on unmount', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    const h = await setup('device-groups')
    const form = new DOMWrapper(document.body).get('[role=dialog] form')
    await form.get('[data-testid=group-name] input').setValue('Async group')
    await setSelect(wrapperFor(form), form.get('[data-testid=group-kind]'), 'dynamic')
    await form.trigger('submit')
    await flushPromises()
    const write = h.requests
      .filter((r) => r.method === 'POST' && r.path === '/api/v1/groups/{id}')
      .at(-1)!
    const group = String(write.pathParams!['id']!),
      definition = (write.body as { operationId: string }).operationId
    expect(
      h.requests.some(
        (r) =>
          r.method === 'GET' && r.path === '/api/v1/groups/{id}' && r.pathParams?.['id'] === group,
      ),
    ).toBe(false)
    await vi.advanceTimersByTimeAsync(2000)
    await flushPromises()
    expect(h.wrapper.find('[data-testid=server-definition]').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(4000)
    await flushPromises()
    const read = await h.devices.groups.read(group)
    expect(read.memberSet).toBeTruthy()
    expect(read.memberSet).not.toBe(definition)
    expect(h.wrapper.find('[data-testid=server-definition]').text()).toContain('Async group')
    expect(
      h.requests
        .filter((r) => r.path.includes('/results/'))
        .every((r) => r.pathParams?.['result'] !== definition),
    ).toBe(true)
    h.wrapper.unmount()
    const count = h.requests.length
    await vi.advanceTimersByTimeAsync(6000)
    expect(h.requests).toHaveLength(count)
  } finally {
    vi.useRealTimers()
  }
})

it('stops automatic observation after a member task fails and permits preview after a completed definition', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    const h = await setup('device-groups')
    const form = new DOMWrapper(document.body).get('[role=dialog] form')
    await form.get('[data-testid=group-name] input').setValue('Observe then preview')
    await setSelect(wrapperFor(form), form.get('[data-testid=group-kind]'), 'dynamic')
    await form.trigger('submit')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(6000)
    await flushPromises()
    await h.click('预览已保存版本')
    await vi.advanceTimersByTimeAsync(4000)
    await flushPromises()
    await h.click('载入')
    expect(h.wrapper.text()).toContain('当前已发布成员集: 否')
    h.scenario.set('partial')
    await h.click('重算并发布成员')
    await vi.advanceTimersByTimeAsync(4000)
    await flushPromises()
    const count = h.requests.length
    await vi.advanceTimersByTimeAsync(10000)
    await flushPromises()
    expect(h.requests).toHaveLength(count)
  } finally {
    vi.useRealTimers()
  }
})

it('retains the running rule definition when its drawer is closed and preview is attempted', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    const h = await setup('device-groups')
    let dialog = new DOMWrapper(document.body).get('[role=dialog][data-state=open]')
    await dialog.get('[data-testid=group-name] input').setValue('Pending rule owner')
    await setSelect(wrapperFor(dialog), dialog.get('[data-testid=group-kind]'), 'dynamic')
    await dialog.get('form').trigger('submit')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(6000)
    await flushPromises()
    await h.click('规则')
    await h.wrapper
      .findAll('button')
      .filter((b) => b.isVisible() && b.text() === '编辑')
      .at(-1)!
      .trigger('click')
    await flushPromises()
    dialog = new DOMWrapper(document.body).get('[role=dialog][data-state=open]')
    await dialog.get('form').trigger('submit')
    await flushPromises()
    const definition = (
      h.requests.filter((r) => r.method === 'POST' && r.path === '/api/v1/groups/{id}').at(-1)!
        .body as { operationId: string }
    ).operationId
    await dialog.get('button[aria-label="关闭"]').trigger('click')
    await flushPromises()
    const preview = h.wrapper.findAll('button').find((b) => b.text() === '预览已保存版本')!
    expect(preview.attributes('disabled')).toBeDefined()
    await preview.trigger('click')
    expect(h.requests.some((r) => r.method === 'POST' && r.path.endsWith('/previews'))).toBe(false)
    expect(h.wrapper.get('[data-testid=group-definition-task]').text()).toContain(definition)
    await vi.advanceTimersByTimeAsync(4000)
    await flushPromises()
    expect(
      h.requests.some((r) => r.path.includes('/tasks/') && r.pathParams?.['task'] === definition),
    ).toBe(true)
    expect(
      h.wrapper
        .findAll('button')
        .find((b) => b.text() === '预览已保存版本')!
        .attributes('disabled'),
    ).toBeUndefined()
    h.wrapper.unmount()
  } finally {
    vi.useRealTimers()
  }
})

it('shows a network-source failure and retries rather than reporting missing IP data', async () => {
  const f = await setup('device-detail', { device: 'device-01' })
  const view = await f.devices.views.detail({ kind: 'endpoint', id: 'device-01' })
  const channel = view.endpoints[0]!.channels.find((c) => c.channel === 'agent')!
  const evidence = {
    ...Object.values(view.fields)[0]!.sources[0]!.fact.evidence,
    source: 'agent.builtin' as const,
    registration: channel.registrationId,
    registrationGeneration: channel.generation,
  }
  const source = {
    endpoint: 'device-01',
    evidence,
    state: { kind: 'known' as const, count: 1, digest: 'network' },
    lastKnown: null,
    cursor: 'network-cursor',
  }
  view.lists['device.network.interfaces'] = {
    state: source.state,
    sources: [source],
    itemKey: 'id',
  }
  vi.spyOn(f.devices.views, 'detail').mockResolvedValue(view)
  const items = vi
    .spyOn(f.devices.views, 'items')
    .mockRejectedValueOnce(decodeMdmError(503, { code: 'service_unavailable' }))
  await f.click('重新读取')
  const summary = f.wrapper.getComponent({ name: 'DeviceSummary' })
  expect(summary.text()).toContain(f.i18n.global.t('devices.unavailable'))
  expect(summary.text()).not.toContain('未上报')
  await f.click('资产信息')
  expect(summary.text()).toContain(f.i18n.global.t('devices.unavailable'))
  expect(summary.text()).not.toContain('未上报')
  let finish!: (value: Awaited<ReturnType<typeof f.devices.views.items>>) => void
  items.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await summary.get('button').trigger('click')
  await flushPromises()
  await f.click('概览')
  expect(summary.text()).toContain(f.i18n.global.t('devices.loading'))
  finish({
    reference: view.reference,
    field: 'device.network.interfaces',
    source: evidence,
    endpoint: 'device-01',
    total: 1,
    nextCursor: null,
    items: [
      {
        kind: 'object',
        value: { addresses: { kind: 'array', value: [{ kind: 'string', value: '10.0.0.8' }] } },
      },
    ],
  })
  await flushPromises()
  expect(summary.text()).toContain('10.0.0.8')
  expect(summary.find('[role=alert]').exists()).toBe(false)
})

it('does not restore manual inventory when detail authority is withdrawn during the read', async () => {
  const f = await setup('device-detail', { device: 'device-01' })
  await f.click('资产信息')
  const inventory = await f.devices.assets.inventory('device-01')
  let finish!: (value: typeof inventory) => void
  vi.spyOn(f.devices.assets, 'inventory').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await f.button('编辑人工资产信息').trigger('click')
  await flushPromises()
  expect(typeof finish).toBe('function')
  f.wrapper.getComponent({ name: 'DeviceSummary' }).vm.$emit('invalidated', 'denied')
  await flushPromises()
  finish(inventory)
  await flushPromises()
  expect(f.wrapper.text()).toContain(f.i18n.global.t('devices.denied'))
  expect(f.wrapper.findComponent({ name: 'ManualPanel' }).exists()).toBe(false)
  expect(document.querySelector('[role=dialog][data-state=open]')).toBeNull()
})

function wrapperFor(target: { element: Element }) {
  const wrapper = wrappers.find((wrapper) =>
    wrapper.findAllComponents(VSelect).some((select) => target.element.contains(select.element)),
  )
  if (!wrapper) throw new Error('Select owner is not mounted')
  return wrapper
}
async function setSelect(root: VueWrapper, target: { element: Element }, value: unknown) {
  const component = [
    ...root.findAllComponents(VSelect),
    ...root.findAllComponents(VAutocomplete),
  ].find(
    (component) =>
      component.element === target.element || target.element.contains(component.element),
  )
  if (!component) throw new Error('Select is not mounted')
  component.vm.$emit('update:modelValue', value)
  await flushPromises()
}

it('keeps device group categories separate and exposes formal static user group writes with exact recovery', async () => {
  const h = await setup('groups-hub', {}, { category: 'device-dynamic' })
  expect(h.requests.filter((r) => r.path === '/api/v1/groups').at(-1)?.query).toMatchObject({
    filter: "(kind=='dynamic')",
  })
  expect(h.button('设备静态组').attributes('disabled')).toBeUndefined()
  await h.click('设备静态组')
  await vi.waitFor(() =>
    expect(h.router.currentRoute.value.query['category']).toBe('device-static'),
  )
  expect(h.requests.filter((r) => r.path === '/api/v1/groups').at(-1)?.query).toMatchObject({
    filter: "(kind=='static')",
  })
  await h.click('用户静态组')
  await vi.waitFor(() => expect(h.router.currentRoute.value.query['category']).toBe('user-static'))
  expect(h.requests.some((r) => r.path === '/api/v1/authorization/user-groups')).toBe(true)
  await h.click('新建用户组')
  const dialog = new DOMWrapper(document.body).get('[role=dialog]')
  await dialog.get('[data-testid=group-name] input').setValue('Self service operators')
  const selector = h.wrapper.findComponent(TenantUserSelect).findComponent(VAutocomplete)
  selector.vm.$emit('update:modelValue', '33333333-3333-4333-8333-333333333333')
  await flushPromises()
  await h.click('添加成员')
  h.scenario.set('unknown')
  await dialog.get('form').trigger('submit')
  await flushPromises()
  const original = h.requests
    .filter((r) => r.method === 'PUT' && r.path === '/api/v1/authorization/user-groups/{id}')
    .at(-1)!.body
  expect(original).toMatchObject({
    expectedRevision: 0,
    value: {
      name: 'Self service operators',
      enabled: true,
      members: [{ tenantId: TENANT, principalId: '33333333-3333-4333-8333-333333333333' }],
    },
  })
  expect(h.button('设备动态组').attributes('disabled')).toBeDefined()
  h.scenario.set('normal')
  await h.click('重放同一操作')
  const writes = h.requests.filter(
    (r) => r.method === 'PUT' && r.path === '/api/v1/authorization/user-groups/{id}',
  )
  expect(writes).toHaveLength(2)
  expect(writes[1]!.body).toEqual(original)
  expect(
    (await h.operations.authorization.groups()).items.some(
      (item) => item.value?.name === 'Self service operators',
    ),
  ).toBe(true)
})

it('applies raw directory RSQL with basic filters and uses the same filter for counts and results', async () => {
  const h = await setup('devices')
  await h.wrapper.get('[data-testid=directory-rsql] input').setValue("platform=='windows'")
  await h.wrapper.get('input[type=search]').setValue('device')
  await h.wrapper.find('form').trigger('submit')
  await flushPromises()
  await vi.waitFor(() =>
    expect(h.router.currentRoute.value.query['filter']).toBe("platform=='windows'"),
  )
  const filter = "(platform=='windows');(search=icontains='device')"
  expect(
    h.requests.filter((r) => r.path === '/api/v1/device-views').at(-1)?.query?.['filter'],
  ).toBe(filter)
  expect(
    h.requests.filter((r) => r.path === '/api/v1/device-views/statistics').at(-1)?.query?.[
      'filter'
    ],
  ).toBe(filter)
})
