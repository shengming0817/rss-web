import { describe, it, expect } from 'vitest'
import {
  COVERAGE_MATRIX,
  COVERAGE_STATUSES,
  coverageCounts,
  type CoverageSection,
} from './coverageMatrix'

describe('COVERAGE_MATRIX', () => {
  it('has at least one section with rows', () => {
    expect(COVERAGE_MATRIX.length).toBeGreaterThan(0)
    expect(COVERAGE_MATRIX.every((s) => s.rows.length > 0)).toBe(true)
  })

  it('uses only known statuses', () => {
    for (const section of COVERAGE_MATRIX) {
      for (const row of section.rows) {
        expect(COVERAGE_STATUSES).toContain(row.status)
      }
    }
  })

  it('uses unique route paths', () => {
    const routes = COVERAGE_MATRIX.flatMap((s) => s.rows.map((r) => r.route))
    expect(new Set(routes).size).toBe(routes.length)
  })

  it('matched rows have a shipped web ref', () => {
    for (const section of COVERAGE_MATRIX) {
      for (const row of section.rows) {
        if (row.status === 'matched') expect(row.web).not.toBeNull()
      }
    }
  })

  it('design-only rows have no web ref', () => {
    for (const section of COVERAGE_MATRIX) {
      for (const row of section.rows) {
        if (row.status === 'design-only') expect(row.web).toBeNull()
      }
    }
  })

  it('references an i18n capabilityKey + section titleKey', () => {
    for (const section of COVERAGE_MATRIX) {
      expect(section.titleKey).toMatch(/^coverage\.section\./)
      for (const row of section.rows) {
        expect(row.capabilityKey).toMatch(/^coverage\.cap\./)
      }
    }
  })
})

describe('coverageCounts', () => {
  it('totals all rows across sections', () => {
    const counts = coverageCounts()
    const expectedTotal = COVERAGE_MATRIX.reduce((sum, s) => sum + s.rows.length, 0)
    expect(counts.total).toBe(expectedTotal)
  })

  it('per-status counts sum to the total', () => {
    const counts = coverageCounts()
    const sum =
      counts.matched +
      counts.partial +
      counts['design-only'] +
      counts['backend-only'] +
      counts['out-of-scope']
    expect(sum).toBe(counts.total)
  })

  it('handles an empty matrix', () => {
    const empty: CoverageSection[] = []
    const counts = coverageCounts(empty)
    expect(counts.total).toBe(0)
    expect(counts.matched).toBe(0)
  })
})
