import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import SupportView from './SupportView.vue'
const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222',
  source = { registrationId: other, generation: 1, source: 'agent.builtin' },
  target = { kind: 'remote_support', device: 'device-01', contextRevision: 1, mode: 'view' },
  request = {
    id,
    revision: 2,
    operation: other,
    requester: other,
    createdAt: 90,
    state: 'approved',
    target,
    reason: 'Synthetic support',
    validFrom: 90,
    validUntil: 200,
    decision: { by: id, at: 95, value: 'approved' },
    revocation: null,
    consumption: null,
  },
  support = {
    request: id,
    requester: other,
    target,
    source,
    action: null,
    details: {
      kind: 'remote_support',
      attempt: id,
      helper: other,
      mode: 'view',
      consent: { state: 'pending', at: null, validUntil: null },
      session: { state: 'not_started', startedAt: null, endedAt: null },
    },
  }
async function setup(
  supportClient: object,
  requests: object,
  actions: object = {},
  query: Record<string, string> = { id },
) {
  const session = shallowRef({
    status: 'authenticated',
    tenant: id,
    identity: { principalId: other },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: SupportView }],
  })
  await router.push({ path: '/', query })
  const wrapper = mount(SupportView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: id,
          demo: true,
          session: { state: session },
          security: { support: supportClient, requests, actions },
        },
      },
    },
  })
  await flushPromises()
  return { wrapper, router, session }
}
it('requires separate user consent and preserves an unknown dispatch across metadata refreshes', async () => {
  const read = vi.fn().mockResolvedValue({ support, asOf: 100 }),
    requests = { read: vi.fn().mockResolvedValue({ request, asOf: 100 }) },
    dispatch = vi
      .fn()
      .mockRejectedValueOnce(new Error('lost'))
      .mockResolvedValue({ action: { id: other } }),
    { wrapper } = await setup({ read }, requests, { dispatch })
  expect(wrapper.get('[data-testid="dispatch-support"]').attributes('disabled')).toBeDefined()
  expect(wrapper.get('[data-testid="consent-state"]').text()).toContain('等待')
  read.mockResolvedValue({
    support: {
      ...support,
      details: { ...support.details, consent: { state: 'granted', at: 99, validUntil: 200 } },
    },
    asOf: 100,
  })
  await wrapper.get('[data-testid="refresh-support"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('[data-testid="dispatch-support"]').attributes('disabled')).toBeUndefined()
  await wrapper.get('[data-testid="dispatch-support"]').trigger('click')
  await flushPromises()
  const frozen = structuredClone(dispatch.mock.calls[0]![1])
  await wrapper.get('[data-testid="refresh-support"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('[data-testid="dispatch-support"]').attributes('disabled')).toBeDefined()
  read.mockResolvedValue({ support: { ...support, action: other }, asOf: 100 })
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '重放同一操作')!
    .trigger('click')
  await flushPromises()
  expect(dispatch.mock.calls[1]![1]).toEqual(frozen)
  expect(wrapper.get('[data-testid="remote-session"]').text()).toContain('尚无连接')
  wrapper.unmount()
})
it('fences late support evidence after navigating to a different request', async () => {
  const read = vi.fn().mockResolvedValue({ support, asOf: 100 }),
    readRequest = vi.fn().mockResolvedValue({ request, asOf: 100 }),
    { wrapper, router } = await setup({ read }, { read: readRequest })
  let finish!: (v: unknown) => void
  read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await wrapper.get('[data-testid="refresh-support"]').trigger('click')
  await flushPromises()
  readRequest.mockResolvedValue({
    request: { ...request, id: other, target: { ...target, device: 'device-02' } },
    asOf: 100,
  })
  read.mockResolvedValue({
    support: { ...support, request: other, target: { ...target, device: 'device-02' } },
    asOf: 100,
  })
  await router.push({ path: '/', query: { id: other } })
  await flushPromises()
  finish({ support, asOf: 100 })
  await flushPromises()
  expect(wrapper.get('[data-testid="support-detail"] h2').text()).toContain('device-02')
  wrapper.unmount()
})

it('only offers a consented dispatch to its authenticated requester', async () => {
  const granted = {
    ...support,
    details: { ...support.details, consent: { state: 'granted', at: 99, validUntil: 200 } },
  }
  const dispatch = vi.fn(),
    { wrapper, session } = await setup(
      { read: async () => ({ support: granted, asOf: 100 }) },
      { read: async () => ({ request, asOf: 100 }) },
      { dispatch },
    )
  expect(wrapper.get('[data-testid="dispatch-support"]').attributes('disabled')).toBeUndefined()
  session.value = { ...session.value, identity: { principalId: id } }
  await flushPromises()
  expect(wrapper.get('[data-testid="dispatch-support"]').attributes('disabled')).toBeDefined()
  await wrapper.get('[data-testid="dispatch-support"]').trigger('click')
  expect(dispatch).not.toHaveBeenCalled()
  session.value = { ...session.value, status: 'anonymous', identity: { principalId: other } }
  await flushPromises()
  expect(wrapper.get('[data-testid="dispatch-support"]').attributes('disabled')).toBeDefined()
  wrapper.unmount()
})
