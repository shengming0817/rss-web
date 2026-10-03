import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import ArchiveView from './ArchiveView.vue'
const tenant = '11111111-1111-4111-8111-111111111111'
async function setup(overrides: object = {}) {
  const client = {
    state: vi.fn().mockResolvedValue({ initialized: false, generation: 0, unlockedUntil: null }),
    list: vi.fn().mockResolvedValue({
      tenantId: tenant,
      items: [],
      nextAfter: null,
      asOf: 100,
      reminderDays: 30,
      alerts: { expired: 0, expiring: 0, notYetValid: 0 },
    }),
    settings: vi
      .fn()
      .mockResolvedValue({ revision: 0, value: { reminderDays: 30, categories: ['custom'] } }),
    initialize: vi.fn().mockResolvedValue({}),
    unlock: vi.fn().mockResolvedValue({
      initialized: true,
      generation: 1,
      unlockedUntil: Math.floor(Date.now() / 1000) + 900,
    }),
    lock: vi.fn().mockResolvedValue(true),
    operation: vi.fn().mockResolvedValue({}),
    ...overrides,
  }
  const session = {
    state: ref({
      status: 'authenticated',
      tenant,
      identity: { principalId: tenant },
      session: { id: tenant },
    }),
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: ArchiveView },
      { path: '/elsewhere', component: { template: '<p>Elsewhere</p>' } },
    ],
  })
  await router.push('/')
  const wrapper = mount(ArchiveView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant,
          demo: false,
          session,
          security: { certificateArchive: client },
        },
      },
    },
  })
  await flushPromises()
  return { wrapper, router, client, session }
}
it('clears the submitted password and queries uncertain operations without replay', async () => {
  const initialize = vi.fn().mockRejectedValue(new Error('lost response')),
    { wrapper, client } = await setup({ initialize })
  await wrapper.get('#archive-password').setValue('first archive password')
  await wrapper
    .get('#archive-password')
    .element.closest('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flushPromises()
  expect((wrapper.get('#archive-password').element as HTMLInputElement).value).toBe('')
  expect(initialize).toHaveBeenCalledTimes(1)
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '查询操作结果')!
    .trigger('click')
  await flushPromises()
  expect(client.operation).toHaveBeenCalledWith(initialize.mock.calls[0]![0])
  expect(initialize).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})
it('clears unlock and password state on session change and fences pending responses', async () => {
  let complete: (value: unknown) => void = () => {}
  const unlock = vi.fn(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    ),
    { wrapper, session } = await setup({
      state: vi.fn().mockResolvedValue({ initialized: true, generation: 1, unlockedUntil: null }),
      unlock,
    })
  await wrapper.get('#archive-password').setValue('first archive password')
  await wrapper
    .get('#archive-password')
    .element.closest('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flushPromises()
  session.state.value = { ...session.state.value, status: 'anonymous' }
  complete({ initialized: true, generation: 1, unlockedUntil: Math.floor(Date.now() / 1000) + 900 })
  await flushPromises()
  expect(wrapper.text()).not.toContain('当前会话已解锁')
  wrapper.unmount()
})
