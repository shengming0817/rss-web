import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import MaterialsView from './MaterialsView.vue'
const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222'
async function setup(lost: boolean, multipleVolumes = false) {
  const now = Math.floor(Date.now() / 1000),
    target = {
      kind: 'material_access',
      device: 'device-01',
      material: 'bitlocker',
      materialRevision: 1,
      volume: 'os',
      action: 'reveal',
    },
    material = {
      device: 'device-01',
      kind: 'bitlocker',
      revision: 1,
      platform: 'windows',
      state: 'observed',
      evaluatedAt: now,
      source: { registrationId: id, generation: 1, source: 'mdm.windows' },
      prerequisites: { status: 'eligible', reasons: [] },
      actions: ['reveal', 'rotate'],
      details: {
        tpm: 'ready',
        volumes: [
          ...(multipleVolumes
            ? [{ id: 'missing', role: 'data', encryption: 'on', escrow: 'missing', keyId: null }]
            : []),
          { id: 'os', role: 'os', encryption: 'on', escrow: 'available', keyId: id },
        ],
      },
    },
    request = {
      id,
      revision: 2,
      operation: other,
      requester: id,
      createdAt: now,
      state: 'approved',
      target,
      reason: 'Test recovery',
      validFrom: now,
      validUntil: now + 120,
      decision: { by: other, at: now, value: 'approved' },
      revocation: null,
      consumption: null,
    },
    read = vi.fn().mockResolvedValueOnce({ request, asOf: now }),
    reveal = vi.fn(),
    session = shallowRef({
      status: 'authenticated',
      tenant: id,
      identity: { principalId: id },
      session: { id: other },
    })
  if (lost) {
    reveal.mockRejectedValue(new Error('lost secret response'))
    read.mockRejectedValue(new Error('status unavailable'))
  } else {
    reveal.mockResolvedValue({
      disclosureId: other,
      issuedAt: now,
      expiresAt: now + 30,
      secret: 'SYNTHETIC material shown',
    })
    read.mockResolvedValue({
      request: {
        ...request,
        state: 'consumed',
        revision: 3,
        consumption: { disclosure: other, at: now },
      },
      asOf: now,
    })
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: MaterialsView }],
  })
  await router.push({ path: '/', query: { device: 'device-01', kind: 'bitlocker', request: id } })
  const wrapper = mount(MaterialsView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: id,
          demo: true,
          session: { state: session },
          security: {
            materials: { read: async () => ({ material, asOf: now }), reveal },
            requests: { read },
          },
        },
      },
    },
  })
  await flushPromises()
  return { wrapper, reveal, session }
}
it('shows the one-time value only locally and clears it on hide without replay controls', async () => {
  const { wrapper, reveal } = await setup(false)
  await wrapper.get('[data-testid="reveal-material"]').trigger('click')
  await flushPromises()
  expect(reveal).toHaveBeenCalledTimes(1)
  expect(wrapper.get('[data-testid="disclosed-secret"]').text()).toContain('SYNTHETIC')
  expect(wrapper.get('[data-testid="request-state"]').text()).toBe('已消费')
  expect(wrapper.get('[data-testid="reveal-material"]').attributes('disabled')).toBeDefined()
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '隐藏并立即清除')!
    .trigger('click')
  expect(wrapper.find('[data-testid="disclosed-secret"]').exists()).toBe(false)
  expect(wrapper.findAll('button').some((b) => b.text() === '重放同一操作')).toBe(false)
  wrapper.unmount()
})
it('keeps a lost disclosure disabled even if the nonsecret status read also fails', async () => {
  const { wrapper, reveal } = await setup(true)
  await wrapper.get('[data-testid="reveal-material"]').trigger('click')
  await flushPromises()
  expect(reveal).toHaveBeenCalledTimes(1)
  expect(wrapper.find('[data-testid="disclosed-secret"]').exists()).toBe(false)
  expect(wrapper.get('[data-testid="reveal-material"]').attributes('disabled')).toBeDefined()
  expect(wrapper.text()).toContain('查阅结果未知，不可重放')
  expect(wrapper.findAll('button').some((b) => b.text() === '重放同一操作')).toBe(false)
  wrapper.unmount()
})

it("disables another principal's approved disclosure before sending a request", async () => {
  const { wrapper, reveal, session } = await setup(false)
  session.value = { ...session.value, identity: { principalId: other } }
  await flushPromises()
  expect(wrapper.get('[data-testid="reveal-material"]').attributes('disabled')).toBeDefined()
  await wrapper.get('[data-testid="reveal-material"]').trigger('click')
  expect(reveal).not.toHaveBeenCalled()
  session.value = { ...session.value, identity: { principalId: id } }
  await flushPromises()
  expect(wrapper.get('[data-testid="reveal-material"]').attributes('disabled')).toBeUndefined()
  session.value = { ...session.value, status: 'anonymous' }
  await flushPromises()
  expect(wrapper.get('[data-testid="reveal-material"]').attributes('disabled')).toBeDefined()
  wrapper.unmount()
})
it('selects only escrowed BitLocker volumes for disclosure while retaining rotation choices', async () => {
  const { wrapper } = await setup(false, true)
  const button = (label: string) => wrapper.findAll('button').find((b) => b.text() === label)!
  await button('申请一次性查阅').trigger('click')
  const volumes = () => wrapper.get('[data-testid="material-request"] select')
  expect(
    volumes()
      .findAll('option')
      .map((v) => v.attributes('value')),
  ).toEqual(['os'])
  expect(volumes().element).toHaveProperty('value', 'os')
  await button('申请轮换').trigger('click')
  expect(
    volumes()
      .findAll('option')
      .map((v) => v.attributes('value')),
  ).toEqual(['missing', 'os'])
  wrapper.unmount()
})
