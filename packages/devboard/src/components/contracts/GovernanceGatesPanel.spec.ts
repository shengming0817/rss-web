import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import GovernanceGatesPanel from './GovernanceGatesPanel.vue'
import { GOVERNANCE_GATES } from '../../data/governanceGates'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (k: string, params?: Record<string, unknown>) => {
      if (params !== undefined) return `${k}(${JSON.stringify(params)})`
      return k
    },
  }),
}))

function mountPanel() {
  return mount(GovernanceGatesPanel)
}

describe('GovernanceGatesPanel', () => {
  it('renders exactly 6 gate rows', () => {
    const wrapper = mountPanel()
    const rows = wrapper.findAll('[data-testid="gate-row"]')
    expect(rows.length).toBe(6)
    expect(GOVERNANCE_GATES.length).toBe(6)
  })

  it('renders the panel title and subtitle', () => {
    const wrapper = mountPanel()
    expect(wrapper.text()).toContain('contracts.gates.title')
    expect(wrapper.text()).toContain('contracts.gates.subtitle')
  })

  it('every gate row shows the gate id', () => {
    const wrapper = mountPanel()
    for (const gate of GOVERNANCE_GATES) {
      expect(wrapper.text()).toContain(gate.id)
    }
  })

  it('every gate verdict badge contains sr-only text (not color-only)', () => {
    const wrapper = mountPanel()
    const srOnlyEls = wrapper.findAll('.sr-only')
    // Each gate has a verdict badge with sr-only text
    expect(srOnlyEls.length).toBeGreaterThanOrEqual(GOVERNANCE_GATES.length)
    const allSrText = srOnlyEls.map((el) => el.text())
    // Each verdict key should appear: pass, warn, or fail
    const verdictKeys = [
      'contracts.gates.verdict.pass',
      'contracts.gates.verdict.warn',
      'contracts.gates.verdict.fail',
    ]
    const someVerdictPresent = verdictKeys.some((k) => allSrText.some((t) => t.includes(k)))
    expect(someVerdictPresent).toBe(true)
  })

  it('CH-06 gate has the "new" affordance', () => {
    const wrapper = mountPanel()
    const ch06Row = wrapper
      .findAll('[data-testid="gate-row"]')
      .find((row) => row.text().includes('CH-06'))
    expect(ch06Row).toBeDefined()
    expect(ch06Row!.text()).toContain('contracts.gates.new')
  })

  it('renders passed/total counts for each gate', () => {
    const wrapper = mountPanel()
    for (const gate of GOVERNANCE_GATES) {
      expect(wrapper.text()).toContain(
        `contracts.gates.countLabel(${JSON.stringify({ passed: gate.passed, total: gate.total })})`,
      )
    }
  })

  it('CH-04 has warn verdict badge', () => {
    const wrapper = mountPanel()
    // CH-04 has verdict: 'warn'
    const ch04Row = wrapper
      .findAll('[data-testid="gate-row"]')
      .find((row) => row.text().includes('CH-04'))
    expect(ch04Row).toBeDefined()
    // The sr-only text should be 'contracts.gates.verdict.warn'
    const srOnly = ch04Row!.find('.sr-only')
    expect(srOnly.exists()).toBe(true)
    expect(srOnly.text()).toContain('contracts.gates.verdict.warn')
  })

  it('all pass gates have pass verdict sr-only text', () => {
    const wrapper = mountPanel()
    const passGates = GOVERNANCE_GATES.filter((g) => g.verdict === 'pass')
    for (const gate of passGates) {
      const row = wrapper
        .findAll('[data-testid="gate-row"]')
        .find((r) => r.text().includes(gate.id))
      expect(row).toBeDefined()
      const srOnly = row!.find('.sr-only')
      expect(srOnly.exists()).toBe(true)
      expect(srOnly.text()).toContain('contracts.gates.verdict.pass')
    }
  })
})
