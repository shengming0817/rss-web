import { describe, it, expect } from 'vitest'
import { NAV_GROUPS } from './navConfig'
import type { NavGroup } from './navConfig'

describe('navConfig', () => {
  it('exports exactly 6 groups (PRD §5.1.1)', () => {
    expect(NAV_GROUPS).toHaveLength(6)
  })

  it('group keys are unique', () => {
    const keys = NAV_GROUPS.map((g) => g.groupKey)
    const unique = new Set(keys)
    expect(unique.size).toBe(keys.length)
  })

  it('all group labelKeys follow nav.group.* pattern', () => {
    for (const group of NAV_GROUPS) {
      expect(group.labelKey).toMatch(/^nav\.group\.\w+$/)
    }
  })

  it('all item labelKeys follow nav.* pattern', () => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        expect(item.labelKey).toMatch(/^nav\.\w+$/)
      }
    }
  })

  it('all item keys are unique across all groups', () => {
    const keys = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.key))
    const unique = new Set(keys)
    expect(unique.size).toBe(keys.length)
  })

  it('all items have a non-empty to path starting with /', () => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        expect(item.to).toMatch(/^\//)
      }
    }
  })

  it('pill values are valid when present', () => {
    const validPills = new Set(['live', 'preview', 'new', 'reserved'])
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        if (item.pill !== undefined) {
          expect(validPills.has(item.pill)).toBe(true)
        }
      }
    }
  })

  describe('MVP routes are present with correct paths', () => {
    function findItem(groupKey: string, itemKey: string) {
      const group = NAV_GROUPS.find((g) => g.groupKey === groupKey)
      expect(group).toBeDefined()
      const item = group!.items.find((i) => i.key === itemKey)
      expect(item).toBeDefined()
      return item!
    }

    it('coverage → /coverage', () => {
      expect(findItem('meta', 'coverage').to).toBe('/coverage')
    })

    it('identities → /access/identities', () => {
      expect(findItem('access', 'identities').to).toBe('/access/identities')
    })

    it('policies → /access/policies', () => {
      expect(findItem('access', 'policies').to).toBe('/access/policies')
    })

    it('audit → /audit', () => {
      expect(findItem('operate', 'audit').to).toBe('/audit')
    })

    it('cells → /cells', () => {
      expect(findItem('operate', 'cells').to).toBe('/cells')
    })

    it('deps → /deps', () => {
      expect(findItem('build', 'deps').to).toBe('/deps')
    })

    it('contracts → /contracts', () => {
      expect(findItem('build', 'contracts').to).toBe('/contracts')
    })

    it('workflow → /workflow (not /workflows)', () => {
      expect(findItem('build', 'workflow').to).toBe('/workflow')
    })

    it('ai → /ai (not /ai-studio)', () => {
      expect(findItem('build', 'ai').to).toBe('/ai')
    })

    it('reserved group has 3 items (observe/billing/secrets)', () => {
      const group = NAV_GROUPS.find((g) => g.groupKey === 'reserved')
      expect(group).toBeDefined()
      expect(group!.items).toHaveLength(3)
    })
  })

  describe('group structure', () => {
    it('satisfies NavGroup type (structural check)', () => {
      for (const group of NAV_GROUPS) {
        const g: NavGroup = group
        expect(typeof g.groupKey).toBe('string')
        expect(typeof g.labelKey).toBe('string')
        expect(Array.isArray(g.items)).toBe(true)
        for (const item of g.items) {
          expect(typeof item.key).toBe('string')
          expect(typeof item.labelKey).toBe('string')
          expect(typeof item.to).toBe('string')
        }
      }
    })
  })
})
