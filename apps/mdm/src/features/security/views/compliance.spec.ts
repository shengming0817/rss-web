import { ref } from 'vue'
import { VSwitch } from 'vuetify/components'
import ConditionEditor from '../../devices/components/ConditionEditor.vue'
import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import ComplianceRulesView from './ComplianceRulesView.vue'
import ComplianceView from './ComplianceView.vue'
const id = '11111111-1111-4111-8111-111111111111',
  nextId = '22222222-2222-4222-8222-222222222222'
const definition = {
  presentation: { name: 'Office baseline' },
  enabled: true,
  severity: 'medium',
  platform: 'all',
  target: { kind: 'all' },
  criteria: {
    selector: { kind: 'device' },
    quantifier: 'one',
    criteria: { kind: 'and', children: [] },
  },
}
const assessment = {
  ruleId: id,
  ruleVersion: 1,
  dictionaryVersion: 'assets-v1',
  factWatermark: 4,
  evaluatedAt: 1780000000,
  groups: [],
  status: 'non_compliant',
  reason: 'rule_failed',
  condition: 'no_match',
  applicability: { platform: 'all', platformDecision: 'match', sources: [], groups: [] },
  explanations: [{ path: [], outcome: 'no_match' }],
  evidence: [],
}
const empty = { items: [], nextCursor: null }
async function setup(
  component: typeof ComplianceView | typeof ComplianceRulesView,
  compliance: object,
  query = {},
  directory: object = { list: async () => empty, groups: async () => empty },
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component },
      ...['security-rules', 'device-detail', 'policy-executions'].map((name) => ({
        path: '/target/' + name + '/:tenant/:device?',
        name,
        component: { template: '<p>Linked page</p>' },
      })),
    ],
  })
  await router.push({ path: '/', query })
  const wrapper = mount(component, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: id,
          session: { state: ref({ status: 'authenticated' }) },
          demo: true,
          security: { compliance },
          devices: {
            assets: { catalog: async () => ({ fields: [] }) },
            directory,
          },
        },
      },
    },
  })
  await flushPromises()
  return { router, wrapper }
}
it('locks rule edits after an unknown write and replays the original rule, revision and condition', async () => {
  const put = vi
      .fn()
      .mockRejectedValueOnce(new Error('reply lost'))
      .mockResolvedValue({ id, revision: 1, task: nextId }),
    read = vi.fn().mockResolvedValue({ id, revision: 1, definition })
  const { wrapper } = await setup(ComplianceRulesView, { list: async () => empty, put, read })
  const button = (text: string) => wrapper.findAll('button').find((v) => v.text() === text)!
  await wrapper.get('[data-testid="new-rule"]').trigger('click')
  expect(wrapper.get('[data-testid="save-rule"]').attributes('disabled')).toBeDefined()
  await wrapper.get('[data-testid="rule-name"] input').setValue('Office baseline')
  wrapper.getComponent(ConditionEditor).vm.$emit('update:modelValue', definition.criteria)
  await flushPromises()
  await wrapper.get('[data-testid="edit-rule"]').trigger('submit')
  await flushPromises()
  const frozen = structuredClone(put.mock.calls[0])
  expect(wrapper.get('[data-testid="new-rule"]').attributes('disabled')).toBeDefined()
  expect(wrapper.get('[data-testid="edit-rule"] > fieldset').attributes('disabled')).toBeDefined()
  await button('重新读取').trigger('click')
  await flushPromises()
  expect(wrapper.get('[data-testid="new-rule"]').attributes('disabled')).toBeDefined()
  await button('重放同一操作').trigger('click')
  await flushPromises()
  expect(put.mock.calls[1]).toEqual(frozen)
  expect(wrapper.get('[data-testid="open-rule"] input').element).toHaveProperty('value', id)
  wrapper.unmount()
})
it('clears a selected rule on query changes and fences late rule reads, including task links', async () => {
  const value = (rule: string) => ({
    id: rule,
    revision: 1,
    definition: { ...definition, presentation: { ...definition.presentation, name: rule } },
  })
  const read = vi.fn(async (rule: string) => value(rule)),
    task = vi.fn(async () => ({
      task: nextId,
      ruleId: id,
      ruleVersion: 1,
      factWatermark: 1,
      phase: 'published',
      processed: 1,
      failure: null,
      diagnostic: null,
      completed: true,
    }))
  const { wrapper, router } = await setup(
    ComplianceRulesView,
    { list: async () => empty, read, task },
    { rule: id },
  )
  expect(wrapper.get('[data-testid="rule-name"] input').element).toHaveProperty('value', id)
  let finish!: (v: ReturnType<typeof value>) => void
  read.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
  await router.push({ path: '/', query: { rule: nextId } })
  await flushPromises()
  expect(wrapper.find('[data-testid="rule-name"] input').exists()).toBe(false)
  await router.push({ path: '/', query: { rule: id, task: nextId } })
  await flushPromises()
  expect(task).toHaveBeenCalledWith(id, nextId)
  finish(value(nextId))
  await flushPromises()
  expect(wrapper.get('[data-testid="rule-name"] input').element).toHaveProperty('value', id)
  read.mockRejectedValueOnce(new Error('unavailable'))
  await router.push({ path: '/', query: { rule: nextId } })
  await flushPromises()
  expect(wrapper.find('[data-testid="rule-name"] input').exists()).toBe(false)
  wrapper.unmount()
})
it('labels previous evidence as historical and pins history pagination to the submitted window', async () => {
  const current = vi.fn(async () => ({
      device: 'device-01',
      status: 'pending',
      reason: null,
      rules: [
        { ruleId: id, ruleVersion: 2, status: 'pending', current: null, previous: assessment },
      ],
    })),
    history = vi
      .fn()
      .mockResolvedValueOnce({
        items: [{ ...assessment, task: nextId, disposition: 'published' }],
        nextCursor: 'opaque',
      })
      .mockResolvedValue(empty)
  const { wrapper } = await setup(ComplianceView, { current, history }, { device: 'device-01' })
  expect(wrapper.get('[data-testid="current-compliance"] > h2').text()).toContain('待评估')
  expect(wrapper.get('[data-testid="previous-assessment"] .v-expansion-panel-title').text()).toBe(
    '上一轮证据（非当前结论）',
  )
  wrapper.getComponent(VSwitch).vm.$emit('update:modelValue', true)
  await flushPromises()
  await wrapper.get('#compliance-from').setValue('2026-01-01T00:00:00')
  await wrapper.get('#compliance-until').setValue('2026-02-01T00:00:00')
  await wrapper.get('[data-testid="history-filter"]').trigger('submit')
  await flushPromises()
  const filter = structuredClone(history.mock.calls[0]![1])
  expect(filter).toMatchObject({ from: 1767225600, until: 1769904000, limit: 20 })
  await wrapper.get('#compliance-from').setValue('2026-01-10T00:00:00')
  await wrapper.get('[data-testid="next-history"]').trigger('click')
  await flushPromises()
  expect(history).toHaveBeenLastCalledWith('device-01', { ...filter, cursor: 'opaque' })
  wrapper.unmount()
})
it('clears device evidence immediately on navigation and never applies the old device reply', async () => {
  const value = (device: string) => ({ device, status: 'unknown', reason: 'no_rules', rules: [] })
  const current = vi.fn(async (device: string) => value(device))
  const { wrapper, router } = await setup(ComplianceView, { current }, { device: 'device-01' })
  let finish!: (v: ReturnType<typeof value>) => void
  current.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
  await router.push({ path: '/', query: { device: 'device-02' } })
  await flushPromises()
  expect(wrapper.find('[data-testid="current-compliance"]').exists()).toBe(false)
  await router.push({ path: '/', query: { device: 'device-03' } })
  await flushPromises()
  finish(value('device-02'))
  await flushPromises()
  expect(wrapper.get('[data-testid="current-compliance"] > h2').text()).toBe('device-03 · 未知')
  wrapper.unmount()
})

it('keeps unedited presentation keys on a rule edit without merging them into core fields', async () => {
  const presentation = { ...definition.presentation, vendor: { label: 'extra' }, enabled: false }
  const rule = { id, revision: 4, definition: { ...definition, presentation } }
  const put = vi.fn().mockResolvedValue({ id, revision: 5, task: nextId })
  const { wrapper } = await setup(
    ComplianceRulesView,
    { list: async () => empty, read: async () => rule, put },
    { rule: id },
  )
  await wrapper.get('[data-testid="rule-name"] input').setValue('Edited')
  await wrapper.get('[data-testid="edit-rule"]').trigger('submit')
  await flushPromises()
  expect(put).toHaveBeenCalledWith(
    id,
    expect.objectContaining({
      expectedRevision: 4,
      input: { ...definition, presentation: { ...presentation, name: 'Edited' } },
    }),
  )
  wrapper.unmount()
})

it('counts only the current directory page and exposes failed device assessments without inferring a conclusion', async () => {
  const list = vi.fn(async ({ cursor }: { cursor?: string } = {}) => ({
    items: cursor ? [{ id: 'device-03' }] : [{ id: 'device-01' }, { id: 'device-02' }],
    nextCursor: cursor ? null : 'page-2',
  }))
  const current = vi.fn(async (device: string) => {
    if (device === 'device-02') throw new Error('unavailable')
    const compliant = device === 'device-01'
    const value = {
      ...assessment,
      status: compliant ? 'compliant' : 'non_compliant',
      reason: compliant ? 'rule_satisfied' : 'rule_failed',
      condition: compliant ? 'match' : 'no_match',
    }
    return {
      device,
      status: value.status,
      reason: null,
      rules: [{ ruleId: id, ruleVersion: 1, status: value.status, current: value, previous: null }],
    }
  })
  const { wrapper } = await setup(ComplianceView, { current }, {}, { list })
  expect(wrapper.text()).toContain('不代表全租户统计')
  expect(wrapper.findAll('.text-h4').map((item) => item.text())).toEqual(['1', '0', '0', '0', '0'])
  expect(wrapper.text()).toContain('评估读取失败')
  await wrapper
    .findAll('button')
    .find((item) => item.text() === '下一页')!
    .trigger('click')
  await flushPromises()
  expect(list).toHaveBeenLastCalledWith({ cursor: 'page-2' })
  expect(wrapper.findAll('.text-h4').map((item) => item.text())).toEqual(['0', '1', '0', '0', '0'])
  expect(wrapper.text()).not.toContain('device-01')
  wrapper.unmount()
})
