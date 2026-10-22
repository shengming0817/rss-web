import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { expect, it, vi } from 'vitest'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import ExecutionsView from './ExecutionsView.vue'
import ExecutionDetailView from './ExecutionDetailView.vue'
import DeviceControlPanel from '../../devices/components/DeviceControlPanel.vue'

it('keeps formal filters attached to compound pagination and does not enter a candidate batch path', async () => {
  const directory = vi
    .fn()
    .mockResolvedValueOnce({
      items: [],
      statistics: { total: 0 },
      asOf: 1,
      nextCursor: { id: 'cursor', kind: 'command' },
    })
    .mockResolvedValue({ items: [], statistics: { total: 0 }, asOf: 1, nextCursor: null })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: ExecutionsView }],
  })
  await router.push('/?device=endpoint&policy=policy&batch=retired')
  const wrapper = mount(ExecutionsView, {
    global: {
      plugins: [router, mdmI18n()],
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          session: { state: ref({ status: 'authenticated' }) },
          policies: { executions: { directory } },
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
  await form.get('select').setValue('command')
  await form.findAll('input')[2]!.setValue('unknown')
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '下一页')!
    .trigger('click')
  await flushPromises()
  expect(directory.mock.calls[1]?.[0]).toEqual({
    device: 'endpoint',
    policy: 'policy',
    kind: undefined,
    status: undefined,
    after: 'cursor',
    afterKind: 'command',
  })
  await form.trigger('submit')
  await flushPromises()
  expect(directory.mock.calls[2]?.[0]).toMatchObject({
    kind: 'command',
    status: 'unknown',
    after: undefined,
    afterKind: undefined,
  })
  expect(wrapper.text()).toContain('当前没有结果')
  expect(wrapper.find('#execution-batch').exists()).toBe(false)
  wrapper.unmount()
})

it('rejects missing or ambiguous formal detail coordinates without guessing or reading a candidate API', async () => {
  const read = vi.fn()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:execution', component: ExecutionDetailView }],
  })
  await router.push('/11111111-1111-4111-8111-111111111111')
  const wrapper = mount(ExecutionDetailView, {
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
    authorization: 'authorized',
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
    routes: [{ path: '/:execution', component: ExecutionDetailView }],
  })
  await router.push(`/${id}?device=endpoint`)
  const wrapper = mount(ExecutionDetailView, {
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
            directory: { list: async () => ({ items: [{ id: 'endpoint' }] }), detail },
            views: { detail: view },
          },
        },
      },
    },
  })
  await flushPromises()
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '从授权目录选择')!
    .trigger('click')
  await flushPromises()
  const select = wrapper.findAll('select')[1]!
  await select.setValue('endpoint')
  await flushPromises()
  expect(wrapper.findComponent(DeviceControlPanel).exists()).toBe(true)
  await select.setValue('')
  await flushPromises()
  expect(wrapper.findComponent(DeviceControlPanel).exists()).toBe(false)
  expect(detail.mock.calls).toEqual([['endpoint']])
  expect(view).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})
