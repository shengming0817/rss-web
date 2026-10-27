import { createFeatureRouter as createRouter } from '../../../../tests/feature-router'
import { ref } from 'vue'
import { flushPromises, mount, DOMWrapper } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import ScopesView from '../components/PolicyScopeEditor.vue'
it('locks the original Scope after an unknown write and replays its exact frozen operation', async () => {
  const change = vi
    .fn()
    .mockRejectedValueOnce(new Error('lost reply'))
    .mockResolvedValue({ id: 'id', revision: 1, task: null })
  const read = vi.fn().mockResolvedValue({
    id: 'id',
    revision: 1,
    definition: {
      targets: [{ kind: 'device', id: 'server-only' }],
      limitations: null,
      exclusions: [],
    },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: ScopesView }],
  })
  await router.push('/')
  const wrapper = mount(ScopesView, {
    attachTo: document.body,
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          session: { state: ref({ status: 'authenticated' }) },
          demo: true,
          policies: {
            scopes: { change, read, list: async () => ({ items: [], nextCursor: null }) },
          },
          devices: {
            groups: { list: async () => ({ items: [], nextCursor: null }) },
            directory: {
              list: async () => ({ items: [], nextCursor: null }),
            },
          },
        },
      },
    },
  })
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '配置设备组与目标范围')!
    .trigger('click')
  await flushPromises()
  const button = (text: string) => wrapper.findAll('button').find((b) => b.text() === text)!
  await button('新建').trigger('click')
  const dialog = new DOMWrapper(document.body).get('[role=dialog]')
  await dialog.get('form').trigger('submit')
  await flushPromises()
  expect(button('新建').attributes('disabled')).toBeDefined()
  expect(dialog.get('[role=alert]').text()).toContain('提交结果未知')
  const body = change.mock.calls[0]![1]
  expect(
    dialog
      .findAll('button')
      .find((b) => b.text() === '重放同一操作')!
      .attributes('disabled'),
  ).toBeDefined()
  await dialog
    .findAll('button')
    .find((b) => b.text() === '重读服务器值并比较')!
    .trigger('click')
  await flushPromises()
  expect(dialog.get('[data-testid=scope-comparison]').text()).toContain('server-only')
  await dialog
    .findAll('button')
    .find((b) => b.text() === '重放同一操作')!
    .trigger('click')
  await flushPromises()
  expect(change.mock.calls[1]![1]).toEqual(body)
  wrapper.unmount()
})

it.each([
  { calculationRevision: 3, resolutionRevision: 2 },
  { calculationRevision: 2, resolutionRevision: 2 },
])(
  'shows saved result existence without inferring freshness from counters, and isolates directory permissions (%j)',
  async (coordinates) => {
    const id = '11111111-1111-4111-8111-111111111111'
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          { id, revision: 3, ...coordinates, resolution: id },
          {
            id: '22222222-2222-4222-8222-222222222222',
            revision: 1,
            calculationRevision: 0,
            resolutionRevision: null,
            resolution: null,
          },
        ],
        nextCursor: id,
      })
      .mockResolvedValueOnce({ items: [], nextCursor: null })
    const read = vi.fn().mockResolvedValue({
      id,
      revision: 3,
      definition: {
        targets: [{ kind: 'group', id: 'preserved' }],
        limitations: null,
        exclusions: [],
      },
      resolution: id,
    })
    const denied = vi.fn().mockRejectedValue(new Error('directory denied'))
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: ScopesView }],
    })
    await router.push('/')
    const wrapper = mount(ScopesView, {
      attachTo: document.body,
      global: {
        plugins: [router, mdmI18n()],
        stubs: { RouterLink: true },
        provide: {
          [mdmKey as symbol]: {
            tenant: 'tenant',
            session: { state: ref({ status: 'authenticated' }) },
            policies: { scopes: { list, read } },
            devices: { directory: { list: denied }, groups: { list: denied } },
          },
        },
      },
    })
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '配置设备组与目标范围')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('已有保存结果')
    expect(wrapper.text()).toContain('暂无保存结果')
    expect(denied).not.toHaveBeenCalled()
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes(id.slice(0, 8)))!
      .trigger('click')
    await flushPromises()
    expect(read).toHaveBeenCalledWith(id)
    expect(wrapper.text()).toContain('preserved')
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('返回范围目录'))!
      .trigger('click')
    await flushPromises()
    expect(list.mock.calls[1]?.[0]).toEqual({ after: undefined })
    expect(wrapper.text()).toContain('当前没有结果')
    wrapper.unmount()
  },
)

it('adopts the current calculated scope only after its completed task is read back', async () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const scope = {
    id,
    revision: 2,
    definition: { targets: [{ kind: 'group', id }], limitations: null, exclusions: [] },
    resolution: id,
    resolutionRevision: 1,
  }
  const read = vi
    .fn()
    .mockResolvedValueOnce(scope)
    .mockResolvedValueOnce({ ...scope, resolutionRevision: 2 })
  const status = vi.fn().mockResolvedValue({ status: 'completed' })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: ScopesView }],
  })
  await router.push('/')
  const wrapper = mount(ScopesView, {
    attachTo: document.body,
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          session: { state: ref({ status: 'authenticated' }) },
          policies: {
            scopes: {
              list: async () => ({
                items: [{ id, revision: 2, resolution: id }],
                nextCursor: null,
              }),
              read,
              status,
            },
          },
        },
      },
    },
  })
  const button = (label: string) =>
    wrapper.findAll('button').find((button) => button.text() === label)!
  await button('配置设备组与目标范围').trigger('click')
  await flushPromises()
  await wrapper.get('tbody button').trigger('click')
  await flushPromises()
  expect(button('使用此范围').attributes('disabled')).toBeDefined()
  await button('读取任务状态').trigger('click')
  await flushPromises()
  expect(read).toHaveBeenCalledTimes(2)
  expect(button('使用此范围').attributes('disabled')).toBeUndefined()
  await button('使用此范围').trigger('click')
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([id])
  wrapper.unmount()
})
