import { selectControl } from '../vuetify-test-controls'
import { createFeatureRouter as createRouter } from '../../../../tests/feature-router'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { expect, it, vi } from 'vitest'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import ExecutionsView from './ExecutionsView.vue'
import ExecutionDetailView from './ExecutionDetailView.vue'
import DeviceControlPanel from '../../devices/components/DeviceControlPanel.vue'

it('keeps applied filters on opaque pagination and clears continuation after a failed new query', async () => {
  const directory = vi
    .fn()
    .mockResolvedValueOnce({
      items: [],
      nextCursor: 'YWJj',
    })
    .mockResolvedValue({ items: [], nextCursor: null })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: ExecutionsView }],
  })
  await router.push('/?device=endpoint&policy=policy&batch=retired')
  const wrapper = mount(ExecutionsView, {
    attachTo: document.body,
    global: {
      plugins: [router, mdmI18n()],
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          session: { state: ref({ status: 'authenticated' }) },
          policies: {
            executions: {
              directory,
              statistics: async () => ({
                statistics: { total: 0, commands: 0, actionRuns: 0, unknown: 0 },
                asOf: 1,
              }),
            },
          },
          devices: {
            directory: {
              detail: async () => {
                throw new Error('unavailable')
              },
            },
          },
        },
      },
    },
  })
  await flushPromises()
  const form = wrapper.get('form')
  await selectControl(form, 'select').setValue('command')
  await form.findAll('input:not([type=hidden]):not([role=combobox])')[2]!.setValue('unknown')
  directory.mockResolvedValueOnce({ items: [], nextCursor: 'ZA' })
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '下一页')!
    .trigger('click')
  await flushPromises()
  expect(directory.mock.calls[1]?.[0]).toMatchObject({
    filter: "((device=='endpoint');(policy=='policy'))",
    cursor: 'YWJj',
  })
  directory.mockRejectedValueOnce(new Error('unavailable'))
  await form.trigger('submit')
  await flushPromises()
  expect(directory.mock.calls[2]?.[0]).toMatchObject({
    filter: "((device=='endpoint');(policy=='policy');(kind=='command');(status=='unknown'))",
    cursor: undefined,
  })
  wrapper.unmount()
})

it('rejects missing or ambiguous formal detail coordinates without guessing or reading a candidate API', async () => {
  const read = vi.fn()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/:execution', component: ExecutionDetailView },
      { path: '/operations/:tenant', name: 'policy-executions', component: ExecutionsView },
    ],
  })
  await router.push('/11111111-1111-4111-8111-111111111111')
  const wrapper = mount(ExecutionDetailView, {
    attachTo: document.body,
    global: {
      plugins: [router, mdmI18n()],
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          session: { state: ref({ status: 'authenticated' }) },
          policies: { native: { read }, runs: { read } },
        },
      },
    },
  })
  await flushPromises()
  expect(read).not.toHaveBeenCalled()
  await router.push(
    '/11111111-1111-4111-8111-111111111111?device=endpoint&policy=11111111-1111-4111-8111-111111111111',
  )
  await flushPromises()
  expect(read).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('queries an unknown cancellation, displays the observed revision, and explicitly replays the same request', async () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const value = {
    operationId: id,
    revision: 1,
    target: { kind: 'device' },
    task: {
      platform: 'windows',
      kind: 'sync_ml',
      name: 'SyncML',
      objects: ['./Device/Vendor/MSFT/Reboot/RebootNow'],
    },
    authorization: { state: 'authorized' },
    reauthorization: { state: 'unavailable', reason: 'already_received' },
    commandStatus: 'queued',
    observation: { protocol: 'syncml', progress: 'unknown', effect: 'unverified' },
  }
  const read = vi
    .fn()
    .mockResolvedValueOnce(value)
    .mockResolvedValue({ ...value, revision: 2, commandStatus: 'cancelled' })
  const cancel = vi
    .fn()
    .mockRejectedValueOnce(new Error('lost reply'))
    .mockResolvedValue({ operationId: id, revision: 2 })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/:execution', component: ExecutionDetailView },
      { path: '/operations/:tenant', name: 'policy-executions', component: ExecutionsView },
    ],
  })
  await router.push(`/${id}?device=endpoint`)
  const wrapper = mount(ExecutionDetailView, {
    attachTo: document.body,
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          session: { state: ref({ status: 'authenticated' }) },
          policies: { native: { read, cancel } },
        },
      },
    },
  })
  await flushPromises()
  const button = (label: string) => wrapper.findAll('button').find((b) => b.text() === label)!
  await button('请求取消').trigger('click')
  await flushPromises()
  const body = cancel.mock.calls[0]?.[2]
  expect(button('重放同一操作').attributes('disabled')).toBeDefined()
  await button('核实状态').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('cancelled')
  await button('重放同一操作').trigger('click')
  await flushPromises()
  expect(cancel.mock.calls[1]?.[2]).toEqual(body)
  expect(cancel.mock.calls[1]?.[2].expectedRevision).toBe(1)
  wrapper.unmount()
})

it('removes the old control target when the device selection is cleared without reading an empty id', async () => {
  const detail = vi.fn().mockResolvedValue({ id: 'endpoint', primaryMdmRegistration: null })
  const view = vi.fn().mockResolvedValue({ endpoints: [] })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: ExecutionsView }],
  })
  await router.push('/')
  const wrapper = mount(ExecutionsView, {
    attachTo: document.body,
    global: {
      plugins: [router, mdmI18n()],
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          session: { state: ref({ status: 'authenticated' }) },
          policies: {
            executions: {
              directory: async () => ({ items: [], statistics: { total: 0 }, asOf: 1 }),
            },
          },
          devices: {
            directory: {
              list: async () => ({ items: [{ id: 'endpoint' }], nextCursor: null }),
              detail,
            },
            views: { detail: view },
          },
        },
      },
    },
  })
  await flushPromises()
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '新建远程操作')!
    .trigger('click')
  await flushPromises()
  const select = selectControl(wrapper.findComponent({ name: 'PolicyDialog' }), 'select')
  await select.setValue('endpoint')
  await flushPromises()
  expect(wrapper.findComponent(DeviceControlPanel).exists()).toBe(true)
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '新建远程操作')!
    .trigger('click')
  await flushPromises()
  await selectControl(wrapper.findComponent({ name: 'PolicyDialog' }), 'select').setValue('')
  await flushPromises()
  expect(wrapper.findComponent(DeviceControlPanel).exists()).toBe(false)
  expect(detail.mock.calls).toEqual([['endpoint']])
  expect(view).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})

it('uses the same server queue predicate for the directory and statistics without deriving blocked from queued', async () => {
  const directory = vi.fn().mockResolvedValue({ items: [], nextCursor: 'YWJj' })
  const statistics = vi.fn().mockResolvedValue({
    statistics: { total: 21, commands: 21, actionRuns: 0, unknown: 0 },
    asOf: 1,
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: ExecutionsView }],
  })
  await router.push('/')
  const wrapper = mount(ExecutionsView, {
    attachTo: document.body,
    global: {
      plugins: [router, mdmI18n()],
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          session: { state: ref({ status: 'authenticated' }) },
          policies: { executions: { directory, statistics } },
        },
      },
    },
  })
  try {
    await flushPromises()
    for (const [label, field] of [
      ['等待设备', "kind=='command'"],
      ['待重新授权', "authorization.state=='blocked'"],
      ['未知结果', "status=='unknown'"],
    ]) {
      await wrapper
        .findAll('button')
        .find((b) => b.text() === label)!
        .trigger('click')
      await flushPromises()
      const filter = directory.mock.lastCall?.[0].filter
      expect(filter).toContain(field)
      expect(statistics.mock.lastCall?.[0]).toBe(filter)
      if (label === '待重新授权') expect(filter).not.toContain('reauthorization.state')
    }
    const filter = directory.mock.lastCall?.[0].filter
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '下一页')!
      .trigger('click')
    await flushPromises()
    expect(directory.mock.lastCall?.[0]).toMatchObject({ filter, cursor: 'YWJj', limit: 50 })
    directory.mockRejectedValueOnce(new Error('invalidated cursor'))
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '下一页')!
      .trigger('click')
    await flushPromises()
    expect(directory.mock.lastCall?.[0].cursor).toBe('YWJj')
    expect(directory.mock.lastCall?.[0].filter).toBe(filter)
  } finally {
    wrapper.unmount()
  }
})

it('uses current reauthorization eligibility and replays a lost response with the original CAS and body', async () => {
  const id = '11111111-1111-4111-8111-111111111111'
  let value = {
    operationId: id,
    revision: 1,
    target: { kind: 'device' },
    task: {
      platform: 'windows',
      kind: 'sync_ml',
      name: 'SyncML',
      objects: ['./Device/Vendor/MSFT/Reboot/RebootNow'],
    },
    authorization: { state: 'blocked', reason: 'source_invalid' } as Record<string, unknown>,
    reauthorization: { state: 'unavailable', reason: 'permission_denied' } as Record<
      string,
      unknown
    >,
    commandStatus: 'queued',
    observation: { protocol: 'syncml', progress: 'unknown', effect: 'unverified' },
  }
  const read = vi.fn(async () => value)
  const reauthorize = vi
    .fn()
    .mockRejectedValueOnce(new Error('lost'))
    .mockResolvedValue({ operationId: id, revision: 2 })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:execution', component: ExecutionDetailView }],
  })
  await router.push(`/${id}?device=endpoint`)
  const wrapper = mount(ExecutionDetailView, {
    attachTo: document.body,
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          session: { state: ref({ status: 'authenticated' }) },
          policies: { native: { read, reauthorize } },
        },
      },
    },
  })
  const button = (label: string) => wrapper.findAll('button').find((b) => b.text() === label)!
  try {
    await flushPromises()
    expect(button('重新授权')).toBeUndefined()
    expect(wrapper.text()).toContain('当前操作者无动作权限')
    value = {
      ...value,
      authorization: { state: 'authorized' },
      reauthorization: { state: 'available', confirmationRequired: false },
    }
    await button('核实状态').trigger('click')
    await flushPromises()
    expect(wrapper.find('input[type=checkbox]').exists()).toBe(false)
    await button('重新授权').trigger('click')
    await flushPromises()
    const original = reauthorize.mock.calls[0]?.[2]
    expect(original).not.toHaveProperty('confirmation')
    read.mockRejectedValueOnce(new Error('permission revoked'))
    await button('核实状态').trigger('click')
    await flushPromises()
    expect(wrapper.find('.authorization-facts').exists()).toBe(false)
    expect(button('重放同一操作').attributes('disabled')).toBeDefined()
    value = { ...value, revision: 2 }
    await button('核实状态').trigger('click')
    await flushPromises()
    await button('重放同一操作').trigger('click')
    await flushPromises()
    expect(reauthorize.mock.calls[1]?.[2]).toEqual(original)
    expect(original.expectedRevision).toBe(1)
  } finally {
    wrapper.unmount()
  }
})

it('shows invalid query drafts without dispatching either execution rows or statistics', async () => {
  const directory = vi.fn().mockResolvedValue({ items: [], nextCursor: 'YQ' })
  const statistics = vi.fn().mockResolvedValue({
    statistics: { total: 0, commands: 0, actionRuns: 0, unknown: 0 },
    asOf: 1,
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: ExecutionsView }],
  })
  await router.push('/')
  const wrapper = mount(ExecutionsView, {
    global: {
      plugins: [router, mdmI18n()],
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          session: { state: ref({ status: 'authenticated' }) },
          policies: { executions: { directory, statistics } },
        },
      },
    },
  })
  try {
    await flushPromises()
    const q = wrapper.findAll('.directory-query')[0]!
    await q.findAll('input')[1]!.setValue('id,')
    await q
      .findAll('button')
      .find((b) => b.text() === '应用查询')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('输入')
    expect(directory).toHaveBeenCalledTimes(1)
    expect(statistics).toHaveBeenCalledTimes(1)
    expect(
      q
        .findAll('button')
        .find((b) => b.text() === '下一页')!
        .attributes('disabled'),
    ).toBeUndefined()
  } finally {
    wrapper.unmount()
  }
})
