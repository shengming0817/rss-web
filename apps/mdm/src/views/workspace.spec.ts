import { flushPromises, mount } from '@vue/test-utils'
import { shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeMdmError } from '@rss/api/mdm'
import { mdmKey } from '../context'
import { mdmI18n } from '../i18n'
import WorkspaceView from './WorkspaceView.vue'
vi.mock('../features', () => ({ features: { devices: { entry: { name: 'devices' } } } }))
const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))
async function setup(
  read = vi.fn(async () => ({
    modules: [
      { id: 'devices', source: 'mock', available: true },
      { id: 'policies', source: 'mock', available: false },
      { id: 'security', source: 'mock', available: null },
      { id: 'operations', source: 'mock', available: true },
    ],
  })),
  directory = vi.fn(async () => ({ statistics: { deviceViewCount: 42, endpointCount: 50 } })),
) {
  const state = shallowRef({
    status: 'authenticated',
    tenant: 'tenant',
    identity: { principalId: 'principal' },
    session: { id: 'session' },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: WorkspaceView }],
  })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(WorkspaceView, {
    global: {
      plugins: [mdmI18n(), router],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          demo: true,
          session: { state },
          workspace: { read },
          devices: { views: { list: directory } },
          policies: { catalog: { approvals: async () => ({ items: [] }) } },
          software: { assignments: { list: async () => ({ items: [] }) } },
          operations: { audit: { list: async () => ({ items: [] }) } },
        },
      },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper, state, read, directory }
}
describe('workspace authorized facts', () => {
  it('keeps navigation hints separate from authorized metrics and page counts', async () => {
    const { wrapper, read, directory } = await setup()
    expect(wrapper.text()).toContain('导航未知')
    expect(wrapper.text()).toContain('无访问入口')
    expect(wrapper.text()).toContain('业务模块尚未交付')
    expect(wrapper.text()).toContain('42')
    expect(wrapper.text()).toContain('50')
    expect(wrapper.text()).toContain('仅展示当前返回页')
    expect(wrapper.text()).toContain('Mock')
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(read).toHaveBeenCalledTimes(2)
    expect(directory).toHaveBeenCalledTimes(2)
  })
  it('isolates a denied navigation endpoint from successful domain reads', async () => {
    const read = vi.fn(() => Promise.reject(decodeMdmError(403, { code: 'permission_denied' })))
    const { wrapper } = await setup(read)
    expect(wrapper.text()).toContain('工作区查询被拒绝')
    expect(wrapper.text()).toContain('来源未知')
    expect(wrapper.text()).toContain('42')
    expect(wrapper.text()).not.toContain('真实接口')
  })
  it('clears authorized facts on session loss and rejects late results', async () => {
    let resolve!: (value: {
      statistics: { deviceViewCount: number; endpointCount: number }
    }) => void
    const directory = vi.fn(
      () =>
        new Promise<{ statistics: { deviceViewCount: number; endpointCount: number } }>((done) => {
          resolve = done
        }),
    )
    const { wrapper, state } = await setup(undefined, directory)
    state.value = { ...state.value, status: 'anonymous', session: { id: '' } }
    resolve({ statistics: { deviceViewCount: 9876, endpointCount: 9877 } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('9876')
    expect(wrapper.text()).not.toContain('9877')
    expect(directory).toHaveBeenCalledTimes(1)
  })
})
