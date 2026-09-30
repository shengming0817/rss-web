import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { decodeMdmError } from '@rss/api/mdm'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import BaselinesView from './BaselinesView.vue'
import RequestsView from './RequestsView.vue'
const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222'
async function setup(component: typeof BaselinesView | typeof RequestsView, security: object) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component }],
  })
  await router.push({ path: '/', query: { id } })
  const wrapper = mount(component, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: { [mdmKey as symbol]: { tenant: id, demo: true, security } },
    },
  })
  await flushPromises()
  const button = (label: string) => wrapper.findAll('button').find((b) => b.text() === label)!
  return { wrapper, router, button }
}
it('preserves the baseline draft on conflict and only replaces it after explicit adoption', async () => {
  const initial = {
      asOf: 100,
      baseline: {
        id,
        revision: 1,
        scopeRevision: 1,
        definition: {
          name: 'Original',
          enabled: true,
          scope: other,
          rules: [{ id: other, revision: 1 }],
          graceUntil: null,
        },
      },
    },
    latest = {
      ...initial,
      baseline: {
        ...initial.baseline,
        revision: 2,
        definition: { ...initial.baseline.definition, name: 'Server edit' },
      },
    },
    read = vi.fn().mockResolvedValueOnce(initial).mockResolvedValue(latest),
    put = vi.fn().mockRejectedValue(decodeMdmError(409, { code: 'operation_conflict' }))
  const { wrapper, button } = await setup(BaselinesView, { governance: { read, put } })
  await wrapper.get('[data-testid="baseline-name"]').setValue('My draft')
  await wrapper.get('[data-testid="baseline-form"]').trigger('submit')
  await flushPromises()
  expect(put.mock.calls[0]![1]).toMatchObject({ expectedRevision: 1, input: { name: 'My draft' } })
  expect(wrapper.get('[data-testid="baseline-name"]').element).toHaveProperty('value', 'My draft')
  await button('读取服务器版本供比较').trigger('click')
  await flushPromises()
  expect(wrapper.get('[data-testid="baseline-comparison"]').text()).toContain('Server edit')
  expect(wrapper.get('[data-testid="baseline-name"]').element).toHaveProperty('value', 'My draft')
  await button('采用服务器版本并替换草稿').trigger('click')
  expect(wrapper.get('[data-testid="baseline-name"]').element).toHaveProperty(
    'value',
    'Server edit',
  )
  wrapper.unmount()
})
it('keeps an unknown decision locked across reads and loads expiry after replaying the original approval', async () => {
  const request = {
      id,
      revision: 1,
      operation: id,
      requester: other,
      createdAt: 100,
      state: 'pending',
      target: {
        kind: 'compliance_exception',
        baseline: id,
        baselineRevision: 1,
        rule: other,
        ruleVersion: 1,
        device: 'device-01',
      },
      reason: 'Temporary',
      validFrom: 100,
      validUntil: 200,
      decision: null,
      revocation: null,
    },
    initial = { request, asOf: 101 },
    approved = {
      request: {
        ...request,
        revision: 2,
        state: 'approved',
        decision: { by: id, at: 102, value: 'approved' },
      },
      asOf: 102,
    },
    expired = { request: { ...approved.request, revision: 3, state: 'expired' }, asOf: 201 },
    read = vi.fn().mockResolvedValue(initial),
    decide = vi.fn().mockRejectedValueOnce(new Error('lost')).mockResolvedValue(approved)
  const { wrapper, button } = await setup(RequestsView, { requests: { read, decide } })
  await wrapper.get('[data-testid="approve-request"]').trigger('click')
  await flushPromises()
  const frozen = structuredClone(decide.mock.calls[0])
  await wrapper.get('[data-testid="refresh-request"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('[data-testid="approve-request"]').attributes('disabled')).toBeDefined()
  read.mockResolvedValue(expired)
  await button('重放同一操作').trigger('click')
  await flushPromises()
  expect(decide.mock.calls[1]).toEqual(frozen)
  expect(wrapper.get('[data-testid="request-state"]').text()).toBe('已过期')
  expect(wrapper.find('[data-testid="approve-request"]').exists()).toBe(false)
  wrapper.unmount()
})
