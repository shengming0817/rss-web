import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import PoliciesView from './PoliciesView.vue'
it('saves an empty assignment directly, preserves draft during progress reads and replays unknown writes exactly', async () => {
  const definition = {
    source: 'resource',
    parameters: {},
    resource: 'script',
    resourceVersion: '1',
    scope: 'scope',
    enabled: true,
    exitBehavior: 'cancel',
    trigger: { kind: 'on_change' },
    validity: null,
  }
  const policy = {
    id: 'policy',
    revision: 1,
    archived: false,
    definition,
    computation: { sequence: 1, status: 'waiting', at: 1 },
    members: [],
  }
  const read = vi.fn().mockResolvedValue(policy),
    change = vi.fn().mockRejectedValueOnce(new Error('lost response')).mockResolvedValue(policy),
    preview = vi.fn().mockResolvedValue([])
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: PoliciesView }],
  })
  await router.push('/?id=policy')
  const wrapper = mount(PoliciesView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          demo: true,
          policies: {
            policies: { read, change, preview },
            catalog: { list: async () => ({ items: [], nextCursor: null }) },
          },
        },
      },
    },
  })
  await flushPromises()
  const button = (text: string) => wrapper.findAll('button').find((b) => b.text() === text)!
  expect(wrapper.text()).toContain('等待 Scope 成员')
  expect(wrapper.text()).not.toContain('保存冻结计划')
  await wrapper.get('#policy-resource').setValue('draft')
  await button('刷新进度（保留编辑）').trigger('click')
  await flushPromises()
  expect((wrapper.get('#policy-resource').element as HTMLInputElement).value).toBe('draft')
  await button('预览').trigger('click')
  await flushPromises()
  expect(change).not.toHaveBeenCalled()
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(change.mock.calls[0]?.[1]).toMatchObject({
    expectedRevision: 1,
    input: { action: 'put', definition: { resource: 'draft' } },
  })
  expect(button('新建').attributes('disabled')).toBeDefined()
  await button('重放同一操作').trigger('click')
  await flushPromises()
  expect(change.mock.calls[1]).toEqual(change.mock.calls[0])
  await button('新建').trigger('click')
  expect((wrapper.get('#policy-resource').element as HTMLInputElement).value).toBe('')
  expect((wrapper.get('#policy-scope').element as HTMLInputElement).value).toBe('')
  wrapper.unmount()
})
