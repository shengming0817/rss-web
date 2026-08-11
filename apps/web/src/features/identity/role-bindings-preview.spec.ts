import { describe, expect, it } from 'vitest'
import { MOCK_SOURCE } from '@rss/shared'
import {
  groupRoleBindingsPreview,
  isRoleBindingsPreviewEnabled,
  ROLE_BINDINGS_PREVIEW_ROWS,
} from './role-bindings-preview'

describe('Role Bindings Preview source', () => {
  it.each(['development', 'test', 'demo'])('requires an exact true flag in %s mode', (mode) => {
    expect(isRoleBindingsPreviewEnabled(mode, 'true')).toBe(true)
    for (const value of [undefined, '', 'false', '1', 'yes', 'TRUE', true]) {
      expect(isRoleBindingsPreviewEnabled(mode, value)).toBe(false)
    }
  })

  it.each(['production', 'staging', '', 'DEMO'])('stays disabled in closed mode %j', (mode) => {
    expect(isRoleBindingsPreviewEnabled(mode, 'true')).toBe(false)
  })

  it('owns one deeply frozen synthetic fixture with sealed Mock provenance', () => {
    expect(Object.isFrozen(ROLE_BINDINGS_PREVIEW_ROWS)).toBe(true)
    expect(ROLE_BINDINGS_PREVIEW_ROWS).not.toHaveLength(0)
    for (const row of ROLE_BINDINGS_PREVIEW_ROWS) {
      expect(Object.isFrozen(row)).toBe(true)
      expect(row.source).toBe(MOCK_SOURCE)
      expect(row.subject).toMatch(/^preview-subject-/)
      expect(row.roleId).toMatch(/^preview:/)
      expect(row).not.toHaveProperty('tenantId')
      expect(row).not.toHaveProperty('permissions')
      expect(row).not.toHaveProperty('assigned')
      expect(row).not.toHaveProperty('revoked')
      expect(row).not.toHaveProperty('receipt')
    }
  })

  it('derives subject and role projections from the same immutable fixture', () => {
    const bySubject = groupRoleBindingsPreview('subject')
    const byRole = groupRoleBindingsPreview('roleId')
    expect(bySubject.flatMap((group) => group.rows)).toHaveLength(ROLE_BINDINGS_PREVIEW_ROWS.length)
    expect(byRole.flatMap((group) => group.rows)).toHaveLength(ROLE_BINDINGS_PREVIEW_ROWS.length)
    expect(new Set(bySubject.flatMap((group) => group.rows))).toEqual(
      new Set(ROLE_BINDINGS_PREVIEW_ROWS),
    )
    expect(new Set(byRole.flatMap((group) => group.rows))).toEqual(
      new Set(ROLE_BINDINGS_PREVIEW_ROWS),
    )
  })
})
