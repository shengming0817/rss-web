import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import ScopesView from './ScopesView.vue'
it('locks the original Scope after an unknown write and replays its exact frozen operation', async () => {
  const change = vi
    .fn()
    .mockRejectedValueOnce(new Error('lost reply'))
    .mockResolvedValue({ id: 'id', revision: 1, task: null })
  const read = vi.fn().mockResolvedValue({
    id: 'id',
    revision: 1,
    definition: { targets: [], limitations: null, exclusions: [] },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: ScopesView }],
  })
  await router.push('/')
  const wrapper = mount(ScopesView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          demo: true,
          policies: {
            scopes: { change, read },
            catalog: { list: async () => ({ items: [], nextCursor: null }) },
          },
          devices: {
            directory: {
              list: async () => ({ items: [], nextCursor: null }),
              groups: async () => ({ items: [], nextCursor: null }),
            },
          },
        },
      },
    },
  })
  await flushPromises()
  const button = (text: string) => wrapper.findAll('button').find((b) => b.text() === text)!
  await button('新建').trigger('click')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(button('新建').attributes('disabled')).toBeDefined()
  const body = change.mock.calls[0]![1]
  await button('重放同一操作').trigger('click')
  await flushPromises()
  expect(change.mock.calls[1]![1]).toEqual(body)
  wrapper.unmount()
})
