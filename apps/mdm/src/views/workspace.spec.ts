import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { mdmKey } from '../context'
import { mdmI18n } from '../i18n'
import WorkspaceView from './WorkspaceView.vue'
vi.mock('../features', () => ({
  features: { devices: { entry: { name: 'devices', path: '/devices', component: {} } } },
}))
describe('workspace navigation facts', () => {
  it('renders known, unknown and denied navigation without inferring authority', async () => {
    const read = vi.fn(async () => ({
      modules: [
        { id: 'devices', source: 'mock', available: true },
        { id: 'policies', source: 'mock', available: false },
        { id: 'security', source: 'mock', available: null },
        { id: 'operations', source: 'mock', available: true },
      ],
    }))
    const wrapper = mount(WorkspaceView, {
      global: {
        plugins: [mdmI18n()],
        provide: { [mdmKey as symbol]: { workspace: { read }, tenant: 'tenant', demo: true } },
        stubs: { RouterLink: { template: '<a><slot /></a>' } },
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('导航未知')
    expect(wrapper.text()).toContain('无访问入口')
    expect(wrapper.text()).toContain('业务模块尚未交付')
    expect(wrapper.find('a').text()).toBe('打开')
    expect(wrapper.text()).toContain('Mock · 仅模拟')
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(read).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
})

it('shows unknown source and a distinct query denial without asserting live data', async () => {
  const { decodeMdmError } = await import('@rss/api/mdm')
  const wrapper = mount(WorkspaceView, {
    global: {
      plugins: [mdmI18n()],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
      provide: {
        [mdmKey as symbol]: {
          workspace: {
            read: () => Promise.reject(decodeMdmError(403, { code: 'permission_denied' })),
          },
          demo: true,
          tenant: 'tenant',
        },
      },
    },
  })
  await flushPromises()
  expect(wrapper.text()).toContain('工作区查询被拒绝')
  expect(wrapper.text()).toContain('来源未知')
  expect(wrapper.text()).not.toContain('真实接口')
  wrapper.unmount()
})
