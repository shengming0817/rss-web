import { describe, expect, it } from 'vitest'
import { NAV_GROUPS, type NavGroup } from './navConfig'

describe('navConfig', () => {
  it('contains only the implemented access and operate groups', () => {
    expect(NAV_GROUPS.map((group) => group.groupKey)).toEqual(['access', 'operate'])
  })

  it('contains the exact retained routes', () => {
    expect(NAV_GROUPS.flatMap((group) => group.items.map((item) => item.to))).toEqual([
      '/access/identities',
      '/access/policies',
      '/audit',
      '/config',
    ])
  })

  it('has unique machine keys and valid translation keys', () => {
    const items = NAV_GROUPS.flatMap((group) => group.items)
    expect(new Set(NAV_GROUPS.map((group) => group.groupKey)).size).toBe(NAV_GROUPS.length)
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length)
    for (const group of NAV_GROUPS) {
      expect(group.labelKey).toMatch(/^nav\.group\.\w+$/)
      const typed: NavGroup = group
      expect(typed.items.length).toBeGreaterThan(0)
      for (const item of group.items) expect(item.labelKey).toMatch(/^nav\.\w+$/)
    }
  })
})
