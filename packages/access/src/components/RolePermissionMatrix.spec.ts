import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Role } from '../api/roles'
import RolePermissionMatrix from './RolePermissionMatrix.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const roleA: Role = {
  id: 'r-admin',
  name: 'Admin',
  permissions: [
    { resource: 'cell', action: 'read' },
    { resource: 'cell', action: 'write' },
    { resource: 'user', action: 'read' },
  ],
}

const roleB: Role = {
  id: 'r-viewer',
  name: 'Viewer',
  permissions: [{ resource: 'cell', action: 'read' }],
}

const roleEmpty: Role = {
  id: 'r-empty',
  name: 'Empty Role',
  permissions: [],
}

function mountMatrix(roles: Role[]) {
  return mount(RolePermissionMatrix, {
    props: { roles },
  })
}

describe('RolePermissionMatrix', () => {
  describe('empty state', () => {
    it('renders a status paragraph when roles is empty, no table', () => {
      const w = mountMatrix([])
      expect(w.find('table').exists()).toBe(false)
      const status = w.find('[role="status"]')
      expect(status.exists()).toBe(true)
      expect(status.text()).toBe('access.policies.matrix.empty')
    })
  })

  describe('rows', () => {
    it('renders one row per role', () => {
      const w = mountMatrix([roleA, roleB])
      const rows = w.findAll('tbody tr')
      expect(rows).toHaveLength(2)
    })

    it('shows role name in the first column as a th[scope=row]', () => {
      const w = mountMatrix([roleA])
      const rowHeader = w.find('tbody tr th[scope="row"]')
      expect(rowHeader.exists()).toBe(true)
      expect(rowHeader.text()).toContain('Admin')
    })

    it('uses role.id as the row key (renders both roles)', () => {
      const w = mountMatrix([roleA, roleB])
      const rows = w.findAll('tbody tr')
      expect(rows).toHaveLength(2)
      const texts = rows.map((r) => r.find('th[scope="row"]').text())
      expect(texts).toContain('Admin')
      expect(texts).toContain('Viewer')
    })
  })

  describe('columns', () => {
    it('computes the de-duplicated union of all permissions as columns', () => {
      const w = mountMatrix([roleA, roleB])
      // roleA has cell:read, cell:write, user:read; roleB has cell:read
      // union = cell:read, cell:write, user:read (3 unique perm cols)
      // thead has 1 role-name col + 3 perm cols = 4 total
      const allHeaderCols = w.findAll('thead tr th[scope="col"]')
      // First is role name, rest are permission cols
      const permHeaderCols = allHeaderCols.slice(1)
      expect(permHeaderCols).toHaveLength(3)
    })

    it('sorts columns stably by resource then action', () => {
      const w = mountMatrix([roleA])
      const allCols = w.findAll('thead tr th[scope="col"]')
      // Skip the role name col (index 0); permission cols start at index 1
      const permCols = allCols.slice(1)
      // cell:read, cell:write, user:read
      const texts = permCols.map((c) => c.text())
      expect(texts[0]).toContain('cell')
      expect(texts[1]).toContain('cell')
      expect(texts[2]).toContain('user')
    })
  })

  describe('granted / denied cells', () => {
    it('marks cell as granted when role has the permission', () => {
      const w = mountMatrix([roleA, roleB])
      // Find Admin row cells; cell:write is held by Admin but not Viewer
      const rows = w.findAll('tbody tr')
      const adminRow = rows.find((r) => r.find('th[scope="row"]').text() === 'Admin')!
      const grantedCells = adminRow.findAll('td[data-granted="true"]')
      expect(grantedCells).toHaveLength(3) // Admin has all 3 permissions
    })

    it('marks cell as denied when role does not have the permission', () => {
      const w = mountMatrix([roleA, roleB])
      // Viewer only has cell:read; cell:write and user:read should be denied
      const rows = w.findAll('tbody tr')
      const viewerRow = rows.find((r) => r.find('th[scope="row"]').text() === 'Viewer')!
      const deniedCells = viewerRow.findAll('td[data-granted="false"]')
      expect(deniedCells).toHaveLength(2)
    })

    it('a permission held by roleA but not roleB → B cell denied, A cell granted', () => {
      const w = mountMatrix([roleA, roleB])
      const rows = w.findAll('tbody tr')
      const adminRow = rows.find((r) => r.find('th[scope="row"]').text() === 'Admin')!
      const viewerRow = rows.find((r) => r.find('th[scope="row"]').text() === 'Viewer')!

      // cell:write exists only in Admin (column index 1 = cell:write after sort)
      // Verify admin has it granted and viewer has it denied
      const adminCells = adminRow.findAll('td')
      const viewerCells = viewerRow.findAll('td')

      const adminGrantedCount = adminCells.filter(
        (c) => c.attributes('data-granted') === 'true',
      ).length
      const viewerGrantedCount = viewerCells.filter(
        (c) => c.attributes('data-granted') === 'true',
      ).length

      expect(adminGrantedCount).toBe(3) // all 3 permissions
      expect(viewerGrantedCount).toBe(1) // only cell:read
    })
  })

  describe('a role with no permissions', () => {
    it('renders the row with all cells denied', () => {
      const w = mountMatrix([roleA, roleEmpty])
      const rows = w.findAll('tbody tr')
      const emptyRow = rows.find((r) => r.find('th[scope="row"]').text() === 'Empty Role')!
      expect(emptyRow).toBeDefined()
      const cells = emptyRow.findAll('td')
      const deniedCells = cells.filter((c) => c.attributes('data-granted') === 'false')
      expect(deniedCells).toHaveLength(cells.length)
    })
  })

  describe('a11y', () => {
    it('renders the scroll region with an aria-label on the wrapper (not the table)', () => {
      const w = mountMatrix([roleA])
      // A-F1: aria-label belongs on the role="region" wrapper, not duplicated on <table>
      const region = w.find('[role="region"]')
      expect(region.attributes('aria-label')).toBe('access.policies.matrix.label')
      const table = w.find('table')
      expect(table.attributes('aria-label')).toBeUndefined()
    })

    it('provides sr-only text for granted cells via aria-label', () => {
      const w = mountMatrix([roleA])
      const grantedCells = w.findAll('td[data-granted="true"]')
      expect(grantedCells.length).toBeGreaterThan(0)
      grantedCells.forEach((c) => {
        expect(c.attributes('aria-label')).toBe('access.policies.matrix.granted')
      })
    })

    it('provides sr-only text for denied cells via aria-label', () => {
      const w = mountMatrix([roleA, roleB])
      const deniedCells = w.findAll('td[data-granted="false"]')
      expect(deniedCells.length).toBeGreaterThan(0)
      deniedCells.forEach((c) => {
        expect(c.attributes('aria-label')).toBe('access.policies.matrix.denied')
      })
    })

    it('has a th[scope=col] for the role name header column', () => {
      const w = mountMatrix([roleA])
      const roleNameHeader = w.find('thead tr th[scope="col"]:first-child')
      expect(roleNameHeader.exists()).toBe(true)
    })
  })
})
