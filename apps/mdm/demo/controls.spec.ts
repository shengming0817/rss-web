import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { VSelect, VTextField } from 'vuetify/components'
import type { DOMWrapper, VueWrapper } from '@vue/test-utils'
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
function select(wrapper: VueWrapper, id: string) {
  const control = wrapper.findAllComponents(VSelect).find((control) => control.props('id') === id)
  if (!control) throw new Error(`Missing demo select: ${id}`)
  return control
}
async function choose(wrapper: VueWrapper, id: string, value: string) {
  select(wrapper, id).vm.$emit('update:modelValue', value)
  await flushPromises()
}
function itemTitle(wrapper: VueWrapper, id: string, value: string) {
  const items = select(wrapper, id).props('items') as { value: string; title: string }[]
  return items.find((item) => item.value === value)?.title
}
async function openEvents(wrapper: VueWrapper) {
  await wrapper
    .findAll('button')
    .find((button) => button.text().includes('模拟自动化触发事件'))!
    .trigger('click')
  await flushPromises()
}
function taskLabel(wrapper: VueWrapper) {
  return wrapper
    .findAllComponents(VTextField)
    .find((control) => control.props('id') === 'demo-event-task')!
    .props('label')
}
it('translates all option labels while retaining their protocol values', async () => {
  const i18n = mdmI18n()
  i18n.global.locale.value = 'zh-CN'
  const wrapper = mount(DemoControls, {
    props: { transport: createMdmTransport(), authenticated: ref(true) },
    global: { plugins: [i18n] },
  })
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(itemTitle(wrapper, 'demo-scenario', 'normal')).toBe('正常')
  expect(itemTitle(wrapper, 'demo-module', 'devices')).toBe('设备与资产')
  expect(itemTitle(wrapper, 'demo-source', 'real')).toBe('真实接口')
  await choose(wrapper, 'demo-scenario', 'conflict')
  i18n.global.locale.value = 'en-US'
  await flushPromises()
  expect(itemTitle(wrapper, 'demo-scenario', 'normal')).toBe('Normal')
  expect(select(wrapper, 'demo-scenario').props('modelValue')).toBe('conflict')
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
  await wrapper.get('button').trigger('click')
  await flushPromises()
  await openEvents(wrapper)
  await choose(wrapper, 'demo-event-kind', 'remote_consent')
  expect(taskLabel(wrapper)).toBe('申请 ID（远程支持申请）')
  await wrapper.get('#demo-event-task').setValue('33333333-3333-4333-8333-333333333333')
  asOf += 3600
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '注入模拟事件')!
    .trigger('click')
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
  expect(wrapper.get('.v-alert[role="alert"]').text()).toContain('未确认')
  await choose(wrapper, 'demo-event-kind', 'remote_revoke')
  expect(taskLabel(wrapper)).toBe('申请 ID（远程支持申请）')
  await wrapper.get('#demo-event-at').setValue(1780000001)
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '注入模拟事件')!
    .trigger('click')
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
  await choose(wrapper, 'demo-event-kind', 'remote_ended')
  expect(taskLabel(wrapper)).toBe('原任务 ID（运行详情）')
  wrapper.unmount()
})

async function pointerClick(target: Pick<DOMWrapper<Element>, 'trigger' | 'isVisible'>) {
  await target.trigger('mousedown', { button: 0 })
  expect(target.isVisible()).toBe(true)
  await target.trigger('mouseup', { button: 0 })
  await target.trigger('click', { button: 0 })
  await flushPromises()
}

it('selects scenario, module and source with pointer events and submits their exact values', async () => {
  const request = vi.fn(async (options: RequestOptions<unknown> | NoContentRequest) => {
    if (options.method === 'POST') throw new Error('operation_conflict')
    const body = {
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
  i18n.global.locale.value = 'en-US'
  const host = document.createElement('div')
  document.body.append(host)
  const wrapper = mount(DemoControls, {
    attachTo: host,
    props: { transport: { request } as HttpTransport, authenticated: ref(true) },
    global: { plugins: [i18n] },
  })
  try {
    await pointerClick(wrapper.get('button'))
    const surface = wrapper.get('.mdm-device-surface')
    expect(surface.find('.v-dialog').exists()).toBe(true)
    const pointerChoose = async (id: string, value: string) => {
      await pointerClick(select(wrapper, id).get('.v-field'))
      const menu = surface.findAll('[role="listbox"]').find((menu) => menu.isVisible())!
      expect(menu).toBeDefined()
      const option = menu
        .findAll('[role="option"]')
        .find((option) => option.text() === itemTitle(wrapper, id, value))!
      expect(option).toBeDefined()
      expect(option.element.closest('.mdm-device-surface')).toBe(surface.element)
      await pointerClick(option)
      expect(select(wrapper, id).props('modelValue')).toBe(value)
      expect(select(wrapper, id).text()).toContain(itemTitle(wrapper, id, value))
    }
    await pointerChoose('demo-scenario', 'conflict')
    await pointerChoose('demo-module', 'software')
    await pointerChoose('demo-source', 'real')
    await pointerClick(wrapper.findAll('button').find((button) => button.text() === 'Apply')!)
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/api/v1/mdm-candidate/workspace/scenario',
        body: { reset: false, scenario: 'conflict', module: 'software', source: 'real' },
        successStatus: 204,
      }),
    )
  } finally {
    wrapper.unmount()
    host.remove()
  }
})
