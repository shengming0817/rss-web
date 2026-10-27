import { ref } from 'vue'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { VSelect } from 'vuetify/components'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, expect, it, vi } from 'vitest'
import { mdmI18n } from '../../../src/i18n'
import { mdmKey } from '../../../src/context'
import { demoKey } from '../../context'
import { TENANT } from '../../scenario'
import GroupsView from './GroupsView.vue'
import { registerDemoGroupRoutes } from './routes'
import { setupGroups } from './test-support'
const disposers: (() => void)[] = []
afterEach(() => {
  disposers
    .splice(0)
    .reverse()
    .forEach((f) => f())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})
async function setup(category = 'user-dynamic', loginName: 'demo' | 'reviewer' = 'demo') {
  const f = await setupGroups(loginName),
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/tenants/:tenant/groups',
          name: 'device-groups',
          component: { template: '<p>production</p>' },
          meta: { protected: true },
        },
      ],
    })
  registerDemoGroupRoutes(router)
  await router.push({ name: 'device-groups', params: { tenant: TENANT }, query: { category } })
  const runtime = {
    tenant: TENANT,
    serviceId: '44444444-4444-4444-8444-444444444444',
    session: {
      state: ref({
        status: 'authenticated',
        tenant: TENANT,
        identity: {
          principalId:
            loginName === 'reviewer'
              ? '33333333-3333-4333-8333-333333333333'
              : '22222222-2222-4222-8222-222222222222',
        },
        session: { id: 'demo-session' },
      }),
    },
    transport: f.transport,
  }
  const wrapper = mount(GroupsView, {
    attachTo: document.body,
    global: {
      plugins: [router, mdmI18n()],
      provide: { [mdmKey as symbol]: runtime, [demoKey as symbol]: runtime },
    },
  })
  disposers.push(() => wrapper.unmount())
  await flushPromises()
  const click = async (label: string) => {
    const button = wrapper.findAll('button').find((b) => b.text() === label)
    expect(button, `missing ${label}`).toBeDefined()
    await button!.trigger('click')
    await flushPromises()
  }
  return { ...f, router, wrapper, click }
}
it('registers only the explicit Demo route and creates typed zero rules with visible Unknown results', async () => {
  const f = await setup()
  expect(
    f.router.resolve({ name: 'device-groups', params: { tenant: TENANT } }).meta,
  ).toMatchObject({ protected: true, demo: true })
  expect(f.wrapper.text()).toContain('暂无正式接口')
  await f.click('新建组')
  const dialog = new DOMWrapper(document.body).get('[role=dialog]')
  await dialog.get('[data-testid=mock-group-name] input').setValue('Zero allocation')
  const attribute = f.wrapper.findAllComponents(VSelect).find((s) => s.props('label') === '属性')!
  attribute.vm.$emit('update:modelValue', 'allocation')
  await flushPromises()
  expect(dialog.get<HTMLInputElement>('input[type=number]').element.value).toBe('0')
  await dialog.get('[data-testid=mock-group-save]').trigger('click')
  await flushPromises()
  await vi.waitFor(() =>
    expect(f.wrapper.get('[data-testid=mock-group-detail]').text()).toContain('Zero allocation'),
  )
  await vi.waitFor(
    () => expect(f.wrapper.get('[data-testid=mock-group-detail]').text()).toContain('计算完成'),
    { timeout: 3000 },
  )
  const write = f.requests.find((r) => r.method === 'PUT')!
  expect(write.path).toBe('/api/v1/mdm-candidate/groups/{id}')
  expect(write.body).toMatchObject({
    input: {
      groupType: 'user-dynamic',
      rule: { mode: 'match', attribute: 'allocation', operand: 0 },
    },
  })
  const decision = f.wrapper.findAllComponents(VSelect).find((s) => s.props('label') === '决策')!
  decision.vm.$emit('update:modelValue', 'decisions')
  await flushPromises()
  expect(f.wrapper.get('[data-testid=mock-group-detail]').text()).toContain('属性未观察到')
  expect(f.wrapper.get('[data-testid=mock-group-detail]').text()).toContain('未知')
  await f.router.push({ query: { category: 'user-static' } })
  await flushPromises()
  expect(
    f.requests.filter((r) => r.path === '/api/v1/mdm-candidate/groups').at(-1)?.query?.['filter'],
  ).toContain('user-static')
  expect(f.wrapper.find('[data-testid=mock-group-detail]').exists()).toBe(false)
})
it('generates the selected current-user relationship through candidate HTTP and opens its device result', async () => {
  const f = await setup()
  await f.click('Mock user-dynamic')
  await f.click('从用户范围生成设备组')
  const dialog = new DOMWrapper(document.body).get('[role=dialog]')
  const relationship = f.wrapper
    .findAllComponents(VSelect)
    .find((s) => s.props('label') === '设备关联关系')!
  relationship.vm.$emit('update:modelValue', 'current_user')
  await flushPromises()
  await dialog.get('form').trigger('submit')
  await flushPromises()
  await vi.waitFor(() =>
    expect(f.router.currentRoute.value.query['category']).toBe('device-dynamic'),
  )
  await vi.waitFor(
    () => expect(f.wrapper.get('[data-testid=mock-group-detail]').text()).toContain('计算完成'),
    { timeout: 3000 },
  )
  expect(f.wrapper.get('[data-testid=mock-group-detail]').text()).toContain('Mock Mac B')
  const write = f.requests.find((r) => r.path.endsWith('/generate-device-group'))!
  expect(write.body).toMatchObject({ input: { relation: 'current_user' } })
  expect(
    f.requests
      .filter((r) => r.method !== 'GET')
      .every((r) => r.path.startsWith('/api/v1/mdm-candidate/groups')),
  ).toBe(true)
})

it('locks an ambiguous write until comparison and explicitly replays the original request', async () => {
  const f = await setup('user-static')
  await f.click('新建组')
  const body = new DOMWrapper(document.body)
  const dialog = body.get('[role=dialog]')
  await dialog.get('[data-testid=mock-group-name] input').setValue('Unknown request')
  await f.control('unknown')
  await dialog.get('[data-testid=mock-group-save]').trigger('click')
  await flushPromises()
  expect(dialog.text()).toContain('提交结果未知')
  const original = f.requests.filter((r) => r.method === 'PUT').at(-1)!
  expect(f.requests.filter((r) => r.method === 'PUT')).toHaveLength(1)
  await f.control('normal')
  await dialog
    .findAll('button')
    .find((b) => b.text() === '读取远端定义')!
    .trigger('click')
  await flushPromises()
  await dialog
    .findAll('button')
    .find((b) => b.text() === '重放同一 Mock 操作')!
    .trigger('click')
  await flushPromises()
  const writes = f.requests.filter((r) => r.method === 'PUT')
  expect(writes).toHaveLength(2)
  expect(writes[1]?.body).toEqual(original.body)
  expect(writes[1]?.pathParams).toEqual(original.pathParams)
  await vi.waitFor(
    () => expect(f.wrapper.get('[data-testid=mock-group-detail]').text()).toContain('计算完成'),
    { timeout: 3000 },
  )
  expect((await f.client.read(String(original.pathParams!['id']))).revision).toBe(1)
})

it('replaces a deep link that resolved before Demo registration without changing another route', async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/groups',
        name: 'device-groups',
        component: { template: '<p>original</p>' },
        meta: { protected: true },
      },
      { path: '/elsewhere', name: 'elsewhere', component: { template: '<p>elsewhere</p>' } },
    ],
  })
  await router.push('/groups')
  registerDemoGroupRoutes(router)
  await vi.waitFor(() => expect(router.currentRoute.value.meta['demo']).toBe(true))
  await router.push('/elsewhere')
  expect(router.currentRoute.value.name).toBe('elsewhere')
})

it('keeps the reviewer read only in both Vuetify controls and the Mock HTTP handler', async () => {
  const f = await setup('user-dynamic', 'reviewer')
  expect(f.wrapper.text()).toContain('当前演示账户只读')
  expect(
    f.wrapper
      .findAll('button')
      .find((b) => b.text() === '新建组')!
      .attributes(),
  ).toHaveProperty('disabled')
  await f.click('Mock user-dynamic')
  expect(
    f.wrapper
      .findAll('button')
      .find((b) => b.text() === '从用户范围生成设备组')!
      .attributes(),
  ).toHaveProperty('disabled')
  await expect(
    f.client.save(crypto.randomUUID(), {
      operationId: crypto.randomUUID(),
      expectedRevision: 0,
      input: {
        name: 'Denied',
        description: '',
        groupType: 'user-static',
        enabled: true,
        assignments: [],
        rule: null,
      },
    }),
  ).rejects.toMatchObject({ status: 403 })
})
