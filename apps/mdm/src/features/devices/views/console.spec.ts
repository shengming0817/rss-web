import { shallowRef } from 'vue'
import { runtimeKey } from '@rss/auth'
import { afterEach, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { networkErrorForTest } from '@rss/api/testing'
import { decodeMdmError } from '@rss/api/mdm'
import { createScenario, TENANT } from '../../../../demo/scenario'
import { createDeviceDemo } from '../../../../demo/devices/state'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import { policyFeature } from '../../policies/routes'
import { securityFeature } from '../../security/routes'
import { operationsFeature } from '../../operations/routes'
import { deviceFeature } from '../routes'
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
    scenario = createScenario([domain.handle], domain.reset)
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
  const devices = createDeviceClients(transport, TENANT, true)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
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
  const wrapper = mount(RouterView, {
    attachTo: document.body,
    global: {
      plugins: [router, mdmI18n()],
      provide: {
        [mdmKey as symbol]: {
          devices,
          tenant: TENANT,
          demo: true,
          session: { state: shallowRef({ session: { id: 'demo-session' } }) },
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
  wrappers.push(wrapper)
  await flushPromises()
  const button = (text: string) => {
    const result = wrapper.findAll('button').find((b) => b.isVisible() && b.text() === text)
    if (!result) throw new Error(`Missing button: ${text}`)
    return result
  }
  const click = async (text: string) => {
    await button(text).trigger('click')
    await flushPromises()
  }
  return { wrapper, router, scenario, devices, requests, button, click, loseReply }
}
it('renders pending directory, pages, previews partial actions, cancels and submits with confirmation', async () => {
  const { wrapper, click, scenario } = await setup()
  expect(wrapper.text()).toContain('Windows 3')
  await click('下一页')
  expect(wrapper.text()).toContain('Windows 21')
  expect(wrapper.findAll('button').some((b) => b.text() === '下一页')).toBe(false)
  scenario.set('empty')
  await click('重新读取')
  expect(wrapper.text()).toContain('当前没有结果')
  scenario.set('normal')
  await click('重新读取')
  await wrapper.find('tbody input[type=checkbox]').setValue(true)
  await click('预览 (1)')
  expect(wrapper.text()).toContain('实际效果')
  await click('取消')
  expect(wrapper.text()).toContain('已取消')
  scenario.set('partial')
  await click('预览 (1)')
  expect(wrapper.text()).toContain('离线')
  await wrapper.findAll('input[type=checkbox]').at(-1)!.setValue(true)
  await click('确认并受理操作')
  expect(wrapper.text()).toContain('已受理')
  expect(wrapper.text()).not.toContain('擦除成功')
})
it('opens the existing registration owner from a software source-policy deep link', async () => {
  const { wrapper, requests, router } = await setup(
    'device-detail',
    { device: 'device-01' },
    { tab: 'credentials' },
  )
  expect(requests.some((r) => r.path === '/api/v1/devices/{device}/registrations')).toBe(true)
  expect(wrapper.text()).toContain('agent.builtin')
  await router.push({
    name: 'device-detail',
    params: { tenant: TENANT, device: 'device-02' },
    query: { tab: 'credentials' },
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
it('renders detail tabs, edits manual null/delete with conflict drafts, and edits ownership', async () => {
  const { wrapper, click, scenario } = await setup('device-detail', { device: 'device-01' })
  expect(wrapper.text()).toContain('ThinkPad T14')
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
  await click('硬件')
  expect(wrapper.text()).toContain('17179869184')
  await click('软件')
  expect(wrapper.text()).toContain('Enterprise Browser')
  await click('历史')
  expect(wrapper.text()).toContain('已绑定注册')
  await click('能力与通道')
  expect(wrapper.text()).toContain('MDM → Agent')
  await click('使用人与归属')
  const assignment = wrapper.findAll('form').find((f) => f.isVisible())!
  await assignment.find('input').setValue('new-owner')
  await assignment.trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('new-owner')
  await click('注册凭据')
  expect(wrapper.text()).toContain('撤销服务端凭据不会擦除设备')
  await wrapper.find('input[type=checkbox]').setValue(true)
  await click('撤销凭据')
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
  expect(form.find('button:not([type])').attributes('disabled')).toBeDefined()
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
  await click('保存动态条件')
  const group = (await devices.directory.groups()).items.find((g) => g.name === 'Dynamic')!
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
  expect(wrapper.find('details').text()).toContain('manual')
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
  const { wrapper, devices } = await setup('device-detail', { device: 'device-01' })
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
    input: { action: 'create', name: 'Other group', description: '', criteria: null },
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
  let manual = wrapper.findComponent({ name: 'ManualPanel' })
  await manual.find('select').setValue('custom.is_loaner')
  await manual.findAll('select')[1]!.setValue('delete')
  scenario.set('unknown')
  await manual.find('form').trigger('submit')
  await flushPromises()
  const original = requests.find((r) => r.method === 'PUT')!.body
  scenario.set('normal')
  await click('硬件')
  await click('资产字段')
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
  await click('注册凭据')
  const rows = (await devices.enrollment.registrations('device-01')).items
  for (let index = 0; index < rows.length; index++) {
    await wrapper.find('input[type=checkbox]').setValue(true)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '撤销凭据' && b.attributes('disabled') === undefined)!
      .trigger('click')
    await flushPromises()
  }
  const detail = await devices.directory.detail('device-01')
  expect(detail.device.channels).toEqual([])
  expect(detail.readiness).toBe('unknown')
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
  await click('硬件')
  release()
  await flushPromises()
  devices.assets.assign = assign
  await click('资产字段')
  expect(manual.text()).toContain('明确重放原操作')
  await click('明确重放原操作')
  const writes = requests.filter((r) => r.method === 'PUT')
  expect(writes).toHaveLength(2)
  expect(writes[1]!.body).toEqual(writes[0]!.body)
})
it('marks credential details stale after an acknowledged revoke with a failed refresh', async () => {
  const { wrapper, click, devices } = await setup('device-detail', { device: 'device-01' })
  await click('注册凭据')
  const read = devices.directory.detail
  devices.directory.detail = async () => {
    throw decodeMdmError(503, { code: 'service_unavailable' })
  }
  await wrapper.find('input[type=checkbox]').setValue(true)
  await click('撤销凭据')
  expect(wrapper.text()).toContain('凭据已撤销。详情尚未刷新')
  expect(wrapper.text()).not.toContain('mdm + agent')
  expect(wrapper.text()).not.toContain('明确重放原操作')
  await click('能力与通道')
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
  const password = wrapper.find('input[autocomplete=off]')
  expect((password.element as HTMLInputElement).value).toHaveLength(43)
  await wrapper.find('input[type=checkbox]').setValue(true)
  await wrapper.findAll('form')[0]!.trigger('submit')
  await flushPromises()
  expect((password.element as HTMLInputElement).value).toBe('')
  expect(wrapper.text()).toContain('self:')
  expect(wrapper.find('tbody').text()).toContain('1')
  await click('生成一次性交付口令')
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
