import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import {
  createMdmTransport,
  type HttpTransport,
  type RequestOptions,
  type NoContentRequest,
} from '@rss/api/mdm'
import { mdmI18n } from '../src/i18n'
import DemoControls from './DemoControls.vue'
vi.mock('@rss/api/mdm', () => ({
  createMdmTransport: () => ({
    request: async () => ({
      scenario: 'normal',
      asOf: 1780000000,
      sources: {
        devices: 'mock',
        policies: 'mock',
        software: 'mock',
        security: 'mock',
        operations: 'mock',
      },
    }),
  }),
}))
it('translates all option labels while retaining their protocol values', async () => {
  const i18n = mdmI18n()
  i18n.global.locale.value = 'zh-CN'
  const wrapper = mount(DemoControls, {
    props: { transport: createMdmTransport(), authenticated: ref(true) },
    global: { plugins: [i18n] },
  })
  await flushPromises()
  expect(wrapper.get('#demo-scenario option[value="normal"]').text()).toBe('正常')
  expect(wrapper.get('#demo-module option[value="devices"]').text()).toBe('设备与资产')
  expect(wrapper.get('#demo-source option[value="real"]').text()).toBe('真实接口')
  await wrapper.get('#demo-scenario').setValue('conflict')
  i18n.global.locale.value = 'en-US'
  await flushPromises()
  expect(wrapper.get('#demo-scenario option[value="normal"]').text()).toBe('Normal')
  expect((wrapper.get('#demo-scenario').element as HTMLSelectElement).value).toBe('conflict')
  wrapper.unmount()
})
it('labels consent targets as request IDs, refreshes automatic time on submit and reports rejected events', async () => {
  let asOf = 1780000000
  const request = vi.fn(async (options: RequestOptions<unknown> | NoContentRequest) => {
    if (options.method === 'POST') throw new Error('operation_conflict')
    const body = {
      asOf,
      scenario: 'normal',
      sources: {
        devices: 'mock',
        policies: 'mock',
        software: 'mock',
        security: 'mock',
        operations: 'mock',
      },
    }
    return 'decode' in options ? options.decode(body) : undefined
  })
  const i18n = mdmI18n()
  i18n.global.locale.value = 'zh-CN'
  const wrapper = mount(DemoControls, {
    props: { transport: { request } as HttpTransport, authenticated: ref(true) },
    global: { plugins: [i18n] },
  })
  await flushPromises()
  await wrapper.get('#demo-event-kind').setValue('remote_consent')
  expect(wrapper.get('label[for="demo-event-task"]').text()).toBe('申请 ID（远程支持申请）')
  await wrapper.get('#demo-event-task').setValue('33333333-3333-4333-8333-333333333333')
  asOf += 3600
  await wrapper.get('details button').trigger('click')
  await flushPromises()
  expect(request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      body: {
        event: {
          kind: 'remote_consent',
          task: '33333333-3333-4333-8333-333333333333',
          device: 'device-01',
          at: asOf + 1,
          active: true,
        },
      },
    }),
  )
  expect(wrapper.get('[role="alert"]').text()).toContain('未确认')
  await wrapper.get('#demo-event-kind').setValue('remote_revoke')
  expect(wrapper.get('label[for="demo-event-task"]').text()).toBe('申请 ID（远程支持申请）')
  await wrapper.get('#demo-event-at').setValue(1780000001)
  await wrapper.get('details button').trigger('click')
  await flushPromises()
  expect(request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      body: {
        event: {
          kind: 'remote_revoke',
          task: '33333333-3333-4333-8333-333333333333',
          device: 'device-01',
          at: 1780000001,
        },
      },
    }),
  )
  await wrapper.get('#demo-event-kind').setValue('remote_ended')
  expect(wrapper.get('label[for="demo-event-task"]').text()).toBe('原任务 ID（运行详情）')
  wrapper.unmount()
})
