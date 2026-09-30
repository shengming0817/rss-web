import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import AlertsView from './AlertsView.vue'
const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222'
const initial = {
  id,
  revision: 1,
  code: 'compliance_noncompliant',
  severity: 'high',
  target: { kind: 'compliance_rule', id: other, revision: 1, device: 'device-01' },
  state: 'open',
  openedAt: 100,
  updatedAt: 100,
  resolvedAt: null,
  evidence: { id: other, version: 1, at: 99, state: 'active' },
  acknowledgment: null,
  operation: null,
}
it('keeps unknown acknowledgment locked across GET and reads current state after exact replay', async () => {
  const confirmed = {
      ...initial,
      revision: 2,
      acknowledgment: { actor: other, at: 101 },
      operation: other,
    },
    latest = {
      ...confirmed,
      revision: 3,
      state: 'resolved',
      resolvedAt: 102,
      updatedAt: 102,
      evidence: { id: other, version: 2, at: 102, state: 'cleared' },
    }
  const acknowledge = vi
      .fn()
      .mockRejectedValueOnce(new Error('lost response'))
      .mockResolvedValue(confirmed),
    read = vi.fn().mockResolvedValue(initial)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: AlertsView }],
  })
  await router.push({ path: '/', query: { id } })
  const wrapper = mount(AlertsView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: id,
          demo: true,
          operations: { alerts: { read, acknowledge, closure: async () => null } },
        },
      },
    },
  })
  await flushPromises()
  await wrapper.get('[data-testid="acknowledge-alert"]').trigger('click')
  await flushPromises()
  const body = structuredClone(acknowledge.mock.calls[0]![1])
  await wrapper.get('[data-testid="refresh-alert"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('[data-testid="acknowledge-alert"]').attributes('disabled')).toBeDefined()
  read.mockResolvedValue(latest)
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '重放同一操作')!
    .trigger('click')
  await flushPromises()
  expect(acknowledge).toHaveBeenLastCalledWith(id, body)
  expect(wrapper.get('[data-testid="alert-state"]').text()).toBe('已解除')
  expect(wrapper.findAll('button').some((b) => b.text() === '重放同一操作')).toBe(false)
  wrapper.unmount()
})
