import { mount, flushPromises } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMdmTransport } from '@rss/api/mdm'
import { mdmI18n } from '../src/i18n'
import DemoControls from './DemoControls.vue'
vi.mock('@rss/api/mdm', () => ({
  createMdmTransport: () => ({
    request: async () => ({
      scenario: 'normal',
      sources: { devices: 'mock', policies: 'mock', security: 'mock', operations: 'mock' },
    }),
  }),
}))
it('translates all option labels while retaining their protocol values', async () => {
  const i18n = mdmI18n()
  i18n.global.locale.value = 'zh-CN'
  const wrapper = mount(DemoControls, {
    props: { transport: createMdmTransport() },
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
