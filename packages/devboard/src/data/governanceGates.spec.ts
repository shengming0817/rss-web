import { describe, it, expect } from 'vitest'
import { GOVERNANCE_GATES } from './governanceGates'

describe('GOVERNANCE_GATES snapshot', () => {
  it('covers CH-01 through CH-06', () => {
    expect(GOVERNANCE_GATES.map((g) => g.id)).toEqual([
      'CH-01',
      'CH-02',
      'CH-03',
      'CH-04',
      'CH-05',
      'CH-06',
    ])
  })

  it('has unique gate ids', () => {
    const ids = GOVERNANCE_GATES.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('uses only valid verdicts and passed ≤ total', () => {
    for (const gate of GOVERNANCE_GATES) {
      expect(['pass', 'warn', 'fail']).toContain(gate.verdict)
      expect(gate.passed).toBeLessThanOrEqual(gate.total)
      expect(gate.passed).toBeGreaterThanOrEqual(0)
    }
  })

  it('marks only CH-06 as new', () => {
    const newOnes = GOVERNANCE_GATES.filter((g) => g.isNew).map((g) => g.id)
    expect(newOnes).toEqual(['CH-06'])
  })

  it('references an i18n descKey for every gate', () => {
    for (const gate of GOVERNANCE_GATES) {
      expect(gate.descKey).toMatch(/^contracts\.gates\./)
    }
  })
})
