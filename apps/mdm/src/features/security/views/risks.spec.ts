import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import RisksView from './RisksView.vue'
const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222',
  risk = {
    id,
    revision: 1,
    code: 'DEMO-RISK-1',
    title: 'Synthetic risk',
    severity: 'high',
    priority: 'high',
    provider: 'Synthetic feed',
    publishedAt: 100,
    software: { id: 'browser', name: 'Browser', affectedVersion: '128.0', fixedVersion: '129.0' },
  },
  assessment = {
    id: other,
    version: 1,
    risk: id,
    riskRevision: 1,
    device: 'device-01',
    provider: 'Synthetic feed',
    evaluatedAt: 100,
    state: 'affected',
    reason: 'matched',
    software: { id: 'browser', version: '128.0' },
    patch: { state: 'available', targetVersion: '129.0' },
    evidence: null,
  }
async function setup(risks: object, requests: object = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: RisksView }],
  })
  await router.push({ path: '/', query: { id, device: 'device-01' } })
  const wrapper = mount(RisksView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: id,
          demo: true,
          security: { risks: { read: async () => ({ risk, asOf: 100 }), ...risks }, requests },
        },
      },
    },
  })
  await flushPromises()
  return { wrapper, router }
}
it('freezes an unknown remediation request across reads and never substitutes a newer assessment on replay', async () => {
  const current = vi.fn().mockResolvedValue({ assessment, asOf: 100 }),
    create = vi
      .fn()
      .mockRejectedValueOnce(new Error('lost'))
      .mockResolvedValue({ request: { id: other } })
  const { wrapper } = await setup({ current }, { create })
  await wrapper.get('[data-testid="request-remediation"]').trigger('click')
  await wrapper.get('[data-testid="remediation-form"] textarea').setValue('Please patch')
  await wrapper.get('[data-testid="remediation-form"]').trigger('submit')
  await flushPromises()
  const frozen = structuredClone(create.mock.calls[0]![0])
  expect(frozen.input.target).toMatchObject({
    assessment: other,
    assessmentVersion: 1,
    device: 'device-01',
  })
  current.mockResolvedValue({
    assessment: { ...assessment, id, version: 2, state: 'unknown', reason: 'feed_unavailable' },
    asOf: 101,
  })
  await wrapper.get('[data-testid="refresh-risk"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('[data-testid="reassess-risk"]').attributes('disabled')).toBeDefined()
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '重放同一操作')!
    .trigger('click')
  await flushPromises()
  expect(create.mock.calls[1]![0]).toEqual(frozen)
  expect(wrapper.get('[data-testid="risk-state"]').text()).toContain('未知')
  wrapper.unmount()
})
it('clears device evidence on query navigation and rejects a late reply from the previous device', async () => {
  const current = vi.fn(async (_id: string, device: string) => ({
    assessment: { ...assessment, device },
    asOf: 100,
  }))
  const { wrapper, router } = await setup({ current })
  let finish!: (v: Awaited<ReturnType<typeof current>>) => void
  current.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
  await router.push({ path: '/', query: { id, device: 'device-02' } })
  await flushPromises()
  expect(wrapper.find('[data-testid="current-risk"]').exists()).toBe(false)
  await router.push({ path: '/', query: { id, device: 'device-03' } })
  await flushPromises()
  finish({ assessment: { ...assessment, device: 'device-02' }, asOf: 100 })
  await flushPromises()
  expect(wrapper.get('[data-testid="current-risk"] h2').text()).toBe('device-03')
  wrapper.unmount()
})
