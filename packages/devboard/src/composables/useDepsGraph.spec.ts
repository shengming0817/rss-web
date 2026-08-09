import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  buildDependencyEdges,
  buildDependencyForest,
  buildDependsOnIndex,
  useDepsGraph,
} from './useDepsGraph'
import type { CellEntry } from '../manifest/types'

const makeCell = (overrides: Partial<CellEntry>): CellEntry => ({
  id: 'testcore',
  name: 'TestCore',
  domain: 'Test',
  type: 'core',
  consistencyLevel: 'L2',
  lifecycle: 'asset',
  durabilityMode: 'durable',
  owner: { team: 'platform', role: 'cell-owner' },
  goStructName: 'TestCore',
  schemaPrimary: null,
  requires: [],
  l0Dependencies: [],
  smokeTests: [],
  slices: [],
  produces: [],
  consumes: [],
  dependsOnCells: [],
  requiredByCells: [],
  ...overrides,
})

// configcore (root: nothing depends on it being a leaf) <- accesscore <- auditcore
const FIXTURE: CellEntry[] = [
  makeCell({ id: 'accesscore', dependsOnCells: ['configcore'], requiredByCells: ['auditcore'] }),
  makeCell({
    id: 'auditcore',
    dependsOnCells: ['accesscore', 'configcore'],
    requiredByCells: [],
  }),
  makeCell({ id: 'configcore', dependsOnCells: [], requiredByCells: ['accesscore', 'auditcore'] }),
]

describe('buildDependencyEdges', () => {
  it('flattens dependsOnCells into a sorted edge list', () => {
    expect(buildDependencyEdges(FIXTURE)).toEqual([
      { from: 'accesscore', to: 'configcore' },
      { from: 'auditcore', to: 'accesscore' },
      { from: 'auditcore', to: 'configcore' },
    ])
  })

  it('returns no edges when no cell has dependencies', () => {
    expect(buildDependencyEdges([makeCell({ id: 'solo' })])).toEqual([])
  })
})

describe('buildDependencyForest', () => {
  it('roots the forest at cells nothing depends on', () => {
    const forest = buildDependencyForest(FIXTURE)
    expect(forest).toHaveLength(1)
    expect(forest[0]!.id).toBe('auditcore')
  })

  it('nests dependsOnCells as children', () => {
    const forest = buildDependencyForest(FIXTURE)
    const audit = forest[0]!
    expect(audit.children.map((c) => c.id)).toEqual(['accesscore', 'configcore'])
    const access = audit.children.find((c) => c.id === 'accesscore')!
    expect(access.children.map((c) => c.id)).toEqual(['configcore'])
  })

  it('guards against cycles', () => {
    const cyclic: CellEntry[] = [
      makeCell({ id: 'a', dependsOnCells: ['b'], requiredByCells: ['b'] }),
      makeCell({ id: 'b', dependsOnCells: ['a'], requiredByCells: ['a'] }),
    ]
    // No cell has empty requiredByCells → fallback roots = all; must terminate.
    const forest = buildDependencyForest(cyclic)
    expect(forest.length).toBeGreaterThan(0)
    // Depth is bounded — a path never repeats an id, so depth ≤ cells + 1.
    const depth = (n: { children: readonly { children: readonly unknown[] }[] }): number =>
      1 + Math.max(0, ...n.children.map((c) => depth(c as never)))
    expect(depth(forest[0]! as never)).toBeLessThanOrEqual(cyclic.length + 1)
  })
})

describe('buildDependsOnIndex', () => {
  it('answers dependency membership in O(1)', () => {
    const dependsOn = buildDependsOnIndex(FIXTURE)
    expect(dependsOn('auditcore', 'accesscore')).toBe(true)
    expect(dependsOn('auditcore', 'configcore')).toBe(true)
    expect(dependsOn('configcore', 'auditcore')).toBe(false)
    expect(dependsOn('accesscore', 'auditcore')).toBe(false)
  })

  it('returns false for unknown cells', () => {
    const dependsOn = buildDependsOnIndex(FIXTURE)
    expect(dependsOn('ghost', 'configcore')).toBe(false)
  })
})

describe('useDepsGraph', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('exposes edges derived from the real manifest', () => {
    const { edges } = useDepsGraph()
    // Real manifest: accesscore→configcore, auditcore→accesscore, auditcore→configcore
    expect(edges.value).toContainEqual({ from: 'accesscore', to: 'configcore' })
    expect(edges.value).toContainEqual({ from: 'auditcore', to: 'configcore' })
  })

  it('exposes a non-empty cell list', () => {
    const { cells } = useDepsGraph()
    expect(cells.value.length).toBeGreaterThanOrEqual(3)
  })

  it('selects and resolves a cell', () => {
    const { select, selectedCell, selectedCellId } = useDepsGraph()
    expect(selectedCell.value).toBeNull()
    select('configcore')
    expect(selectedCellId.value).toBe('configcore')
    expect(selectedCell.value?.id).toBe('configcore')
    select(null)
    expect(selectedCell.value).toBeNull()
  })
})
