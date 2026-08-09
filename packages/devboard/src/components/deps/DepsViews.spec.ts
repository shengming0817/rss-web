import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DepsListView from './DepsListView.vue'
import DepsGraphView from './DepsGraphView.vue'
import DepsTreeView from './DepsTreeView.vue'
import DepsMatrixView from './DepsMatrixView.vue'
import type { CellEntry } from '../../manifest/types'
import type { DependencyEdge, DependencyTreeNode } from '../../composables/useDepsGraph'
import {
  buildDependencyEdges,
  buildDependencyForest,
  buildDependsOnIndex,
} from '../../composables/useDepsGraph'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (k: string, params?: Record<string, unknown>) => {
      if (params !== undefined) return `${k}(${JSON.stringify(params)})`
      return k
    },
  }),
}))

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

// 3 cells that mirror the real manifest topology:
// configcore (root) → accesscore → auditcore
const CELLS: readonly CellEntry[] = [
  makeCell({ id: 'configcore', dependsOnCells: [], requiredByCells: ['accesscore', 'auditcore'] }),
  makeCell({ id: 'accesscore', dependsOnCells: ['configcore'], requiredByCells: ['auditcore'] }),
  makeCell({
    id: 'auditcore',
    dependsOnCells: ['accesscore', 'configcore'],
    requiredByCells: [],
  }),
]

const EDGES: readonly DependencyEdge[] = buildDependencyEdges(CELLS)
const FOREST: readonly DependencyTreeNode[] = buildDependencyForest(CELLS)
const DEPENDS_ON = buildDependsOnIndex(CELLS)

// ─── DepsListView ──────────────────────────────────────────────────────────

describe('DepsListView', () => {
  it('renders one table row per cell', () => {
    const wrapper = mount(DepsListView, { props: { cells: CELLS } })
    const rows = wrapper.findAll('tbody tr')
    expect(rows.length).toBe(3)
  })

  it('all th elements have scope=col', () => {
    const wrapper = mount(DepsListView, { props: { cells: CELLS } })
    const headers = wrapper.findAll('th')
    expect(headers.length).toBeGreaterThan(0)
    for (const th of headers) {
      expect(th.attributes('scope')).toBe('col')
    }
  })

  it('cell ids appear in mono spans', () => {
    const wrapper = mount(DepsListView, { props: { cells: CELLS } })
    expect(wrapper.text()).toContain('configcore')
    expect(wrapper.text()).toContain('accesscore')
    expect(wrapper.text()).toContain('auditcore')
  })

  it('shows deps.list.none for cells with no dependsOnCells', () => {
    const wrapper = mount(DepsListView, { props: { cells: CELLS } })
    // configcore has no dependsOnCells
    expect(wrapper.text()).toContain('deps.list.none')
  })

  it('emits select when cell id button clicked', async () => {
    const wrapper = mount(DepsListView, { props: { cells: CELLS } })
    const firstBtn = wrapper.find('button')
    await firstBtn.trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(typeof wrapper.emitted('select')?.[0]?.[0]).toBe('string')
  })

  it('table has aria-label from i18n key', () => {
    const wrapper = mount(DepsListView, { props: { cells: CELLS } })
    const table = wrapper.find('table')
    expect(table.attributes('aria-label')).toBe('deps.list.tableLabel')
  })
})

// ─── DepsGraphView ─────────────────────────────────────────────────────────

describe('DepsGraphView', () => {
  it('renders an svg element with role=img', () => {
    const wrapper = mount(DepsGraphView, {
      props: { cells: CELLS, edges: EDGES, selectedCellId: null },
    })
    const svg = wrapper.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.attributes('role')).toBe('img')
  })

  it('renders at least 3 rect elements (one per cell)', () => {
    const wrapper = mount(DepsGraphView, {
      props: { cells: CELLS, edges: EDGES, selectedCellId: null },
    })
    const rects = wrapper.findAll('rect')
    expect(rects.length).toBeGreaterThanOrEqual(3)
  })

  it('renders exactly as many line elements as there are edges', () => {
    const wrapper = mount(DepsGraphView, {
      props: { cells: CELLS, edges: EDGES, selectedCellId: null },
    })
    const lines = wrapper.findAll('line')
    expect(lines.length).toBe(EDGES.length)
  })

  it('renders 3 node groups (one per cell) with role=button', () => {
    const wrapper = mount(DepsGraphView, {
      props: { cells: CELLS, edges: EDGES, selectedCellId: null },
    })
    const nodes = wrapper.findAll('[role="button"]')
    expect(nodes.length).toBe(3)
  })

  it('emits select when a node is clicked', async () => {
    const wrapper = mount(DepsGraphView, {
      props: { cells: CELLS, edges: EDGES, selectedCellId: null },
    })
    const firstNode = wrapper.find('[role="button"]')
    await firstNode.trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
  })

  it('shows empty message when cells array is empty', () => {
    const wrapper = mount(DepsGraphView, {
      props: { cells: [], edges: [], selectedCellId: null },
    })
    expect(wrapper.find('svg').exists()).toBe(false)
    expect(wrapper.text()).toContain('deps.graph.empty')
  })

  it('svg has a title element for accessibility', () => {
    const wrapper = mount(DepsGraphView, {
      props: { cells: CELLS, edges: EDGES, selectedCellId: null },
    })
    const title = wrapper.find('title')
    expect(title.exists()).toBe(true)
    expect(title.text()).toBe('deps.graph.label')
  })

  it('selected node has aria-pressed=true', () => {
    const wrapper = mount(DepsGraphView, {
      props: { cells: CELLS, edges: EDGES, selectedCellId: 'accesscore' },
    })
    const pressed = wrapper.find('[aria-pressed="true"]')
    expect(pressed.exists()).toBe(true)
    expect(pressed.attributes('aria-label')).toBe('accesscore')
  })
})

// ─── DepsTreeView ──────────────────────────────────────────────────────────

describe('DepsTreeView', () => {
  it('renders details elements for nodes with children', () => {
    const wrapper = mount(DepsTreeView, { props: { forest: FOREST } })
    const details = wrapper.findAll('details')
    expect(details.length).toBeGreaterThan(0)
  })

  it('details elements are open by default', () => {
    const wrapper = mount(DepsTreeView, { props: { forest: FOREST } })
    const details = wrapper.findAll('details')
    for (const d of details) {
      expect(d.attributes('open')).toBeDefined()
    }
  })

  it('renders cell ids in the tree', () => {
    const wrapper = mount(DepsTreeView, { props: { forest: FOREST } })
    expect(wrapper.text()).toContain('auditcore')
    expect(wrapper.text()).toContain('accesscore')
    expect(wrapper.text()).toContain('configcore')
  })

  it('emits select when a node button is clicked', async () => {
    const wrapper = mount(DepsTreeView, { props: { forest: FOREST } })
    const btn = wrapper.find('button')
    await btn.trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
  })

  it('renders caption text from i18n', () => {
    const wrapper = mount(DepsTreeView, { props: { forest: FOREST } })
    expect(wrapper.text()).toContain('deps.tree.caption')
  })

  it('leaf nodes have sr-only text', () => {
    // configcore is a leaf (its only appearance as a child has no further children in the forest)
    const singleLeafCells: readonly CellEntry[] = [
      makeCell({ id: 'configcore', dependsOnCells: [], requiredByCells: [] }),
    ]
    const singleForest = buildDependencyForest(singleLeafCells)
    const wrapper = mount(DepsTreeView, { props: { forest: singleForest } })
    expect(wrapper.find('.sr-only').exists()).toBe(true)
    expect(wrapper.find('.sr-only').text()).toBe('deps.tree.leaf')
  })

  it('leaf nodes inside subtrees also have sr-only text', () => {
    // auditcore is root; accesscore is its child; configcore is leaf inside subtree
    const wrapper = mount(DepsTreeView, { props: { forest: FOREST } })
    const srOnlyNodes = wrapper.findAll('.sr-only').filter((el) => el.text() === 'deps.tree.leaf')
    // There must be at least one sr-only leaf inside a subtree
    expect(srOnlyNodes.length).toBeGreaterThan(0)
  })

  it('outer wrapper is a section with aria-labelledby pointing to caption', () => {
    const wrapper = mount(DepsTreeView, { props: { forest: FOREST } })
    const section = wrapper.find('section.deps-tree')
    expect(section.exists()).toBe(true)
    const captionId = section.attributes('aria-labelledby')
    expect(captionId).toBeTruthy()
    const caption = wrapper.find(`#${captionId}`)
    expect(caption.exists()).toBe(true)
    expect(caption.text()).toBe('deps.tree.caption')
  })
})

// ─── DepsMatrixView ────────────────────────────────────────────────────────

describe('DepsMatrixView', () => {
  it('renders a table with a caption', () => {
    const wrapper = mount(DepsMatrixView, {
      props: { cells: CELLS, dependsOn: DEPENDS_ON },
    })
    expect(wrapper.find('table').exists()).toBe(true)
    expect(wrapper.find('caption').text()).toBe('deps.matrix.caption')
  })

  it('all col header th elements have scope=col', () => {
    const wrapper = mount(DepsMatrixView, {
      props: { cells: CELLS, dependsOn: DEPENDS_ON },
    })
    const colHeaders = wrapper.findAll('thead th[scope="col"]')
    // 3 data cell columns (corner is a td, not th)
    expect(colHeaders.length).toBe(3)
  })

  it('all row header th elements have scope=row', () => {
    const wrapper = mount(DepsMatrixView, {
      props: { cells: CELLS, dependsOn: DEPENDS_ON },
    })
    const rowHeaders = wrapper.findAll('th[scope="row"]')
    expect(rowHeaders.length).toBe(3)
  })

  it('dependency cells have accent-soft background class', () => {
    const wrapper = mount(DepsMatrixView, {
      props: { cells: CELLS, dependsOn: DEPENDS_ON },
    })
    const dependCells = wrapper.findAll('.deps-matrix__cell--depends')
    // auditcore depends on accesscore + configcore = 2 cells
    // accesscore depends on configcore = 1 cell
    // total = 3 dependency cells
    expect(dependCells.length).toBe(3)
  })

  it('dependency cells contain a sr-only deps.matrix.depends text', () => {
    const wrapper = mount(DepsMatrixView, {
      props: { cells: CELLS, dependsOn: DEPENDS_ON },
    })
    const srTexts = wrapper.findAll('.sr-only').filter((el) => el.text() === 'deps.matrix.depends')
    expect(srTexts.length).toBe(3)
  })

  it('self cells (diagonal) have the self class', () => {
    const wrapper = mount(DepsMatrixView, {
      props: { cells: CELLS, dependsOn: DEPENDS_ON },
    })
    const selfCells = wrapper.findAll('.deps-matrix__cell--self')
    expect(selfCells.length).toBe(3)
  })

  it('self cells contain sr-only deps.matrix.self text', () => {
    const wrapper = mount(DepsMatrixView, {
      props: { cells: CELLS, dependsOn: DEPENDS_ON },
    })
    const srSelf = wrapper.findAll('.sr-only').filter((el) => el.text() === 'deps.matrix.self')
    expect(srSelf.length).toBe(3)
  })

  it('independent cells contain sr-only deps.matrix.independent text', () => {
    const wrapper = mount(DepsMatrixView, {
      props: { cells: CELLS, dependsOn: DEPENDS_ON },
    })
    // 3x3 grid = 9; self=3, deps=3, independent=3
    const srIndep = wrapper
      .findAll('.sr-only')
      .filter((el) => el.text() === 'deps.matrix.independent')
    expect(srIndep.length).toBe(3)
  })

  it('cell ids appear in mono spans in headers', () => {
    const wrapper = mount(DepsMatrixView, {
      props: { cells: CELLS, dependsOn: DEPENDS_ON },
    })
    expect(wrapper.text()).toContain('configcore')
    expect(wrapper.text()).toContain('accesscore')
    expect(wrapper.text()).toContain('auditcore')
  })
})
