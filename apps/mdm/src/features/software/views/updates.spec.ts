import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import UpdatesView from './UpdatesView.vue'
it('fences an unknown deployment write until the exact ring operation is observed', async () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const ring = {
    id,
    revision: 1,
    operation: id,
    definition: {
      title: 'Pilot',
      scope: id,
      platform: 'windows',
      enabled: true,
      target: { kind: 'os', release: 'demo-windows-quality-1' },
      deferDays: 0,
      deadline: 2000000000,
      notifyMinutes: 15,
      reboot: 'user',
      window: null,
    },
    scopeRevision: 1,
    devices: [],
    policy: null,
  }
  const change = vi.fn().mockRejectedValue(new Error('response lost'))
  let observed = false
  const read = vi.fn(async () => ({
    ...ring,
    operation: observed ? change.mock.calls[0]?.[1].operationId : id,
  }))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: UpdatesView }],
  })
  await router.push('/')
  const wrapper = mount(UpdatesView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: id,
          demo: true,
          software: {
            updates: {
              list: vi.fn().mockResolvedValue({ items: [ring], nextCursor: null }),
              releases: vi.fn().mockResolvedValue([]),
              read,
              change,
            },
          },
        },
      },
    },
  })
  await flushPromises()
  await wrapper.get('[data-action="open-ring"]').trigger('click')
  await flushPromises()
  await wrapper.get('[data-action="update-install"]').trigger('click')
  await flushPromises()
  expect(change).toHaveBeenCalledTimes(1)
  expect(wrapper.text()).toContain('提交结果未知')
  await wrapper.get('[data-action="read-ring"]').trigger('click')
  await flushPromises()
  expect(
    (wrapper.get('[data-action="update-install"]').element as HTMLButtonElement).disabled,
  ).toBe(true)
  observed = true
  await wrapper.get('[data-action="read-ring"]').trigger('click')
  await flushPromises()
  expect(
    (wrapper.get('[data-action="update-install"]').element as HTMLButtonElement).disabled,
  ).toBe(false)
  expect(change).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})
