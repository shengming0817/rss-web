import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCellsStore } from './useCellsStore'
import { CELL_MANIFEST } from '../manifest/cells.generated'

describe('useCellsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('initial selectedId is null', () => {
    const store = useCellsStore()
    expect(store.selectedId).toBeNull()
  })

  it('cells returns all manifest cells (length 4)', () => {
    const store = useCellsStore()
    expect(store.cells).toBe(CELL_MANIFEST.cells)
    expect(store.cells.length).toBe(4)
  })

  it('byId returns a known cell entry', () => {
    const store = useCellsStore()
    const cell = store.byId('accesscore')
    expect(cell).not.toBeNull()
    expect(cell?.id).toBe('accesscore')
    expect(cell?.domain).toBe('Access')
  })

  it('byId returns null for unknown id', () => {
    const store = useCellsStore()
    expect(store.byId('does-not-exist')).toBeNull()
  })

  it('selectCell sets selectedId and selectedCell', () => {
    const store = useCellsStore()
    store.selectCell('auditcore')
    expect(store.selectedId).toBe('auditcore')
    expect(store.selectedCell?.id).toBe('auditcore')
    expect(store.selectedCell?.domain).toBe('Audit')
  })

  it('selectCell(null) clears selectedCell', () => {
    const store = useCellsStore()
    store.selectCell('configcore')
    store.selectCell(null)
    expect(store.selectedId).toBeNull()
    expect(store.selectedCell).toBeNull()
  })

  it('selectedCell is null when selectedId not in manifest', () => {
    const store = useCellsStore()
    // Bypass action and set a nonexistent id directly to test guard
    store.selectCell('ghost-cell')
    expect(store.selectedCell).toBeNull()
  })
})
