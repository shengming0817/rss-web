import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { defineComponent } from 'vue'
import DepsView from './DepsView.vue'
import type { CellEntry } from '../manifest/types'
import { useCellsStore } from '../stores/useCellsStore'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (k: string, params?: Record<string, unknown>) => {
      if (params !== undefined) return `${k}(${JSON.stringify(params)})`
      return k
    },
  }),
}))

vi.mock('../stores/useCellsStore', () => ({
  useCellsStore: vi.fn(),
}))

const RouterLinkStub = defineComponent({
  name: 'RouterLink',
  props: { to: { type: String, required: true } },
  template: '<a :href="to"><slot /></a>',
})

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

const STUB_CELLS: CellEntry[] = [
  makeCell({ id: 'configcore', dependsOnCells: [], requiredByCells: ['accesscore', 'auditcore'] }),
  makeCell({ id: 'accesscore', dependsOnCells: ['configcore'], requiredByCells: ['auditcore'] }),
  makeCell({
    id: 'auditcore',
    dependsOnCells: ['accesscore', 'configcore'],
    requiredByCells: [],
  }),
]

function setupStoreMock(cells: CellEntry[] = STUB_CELLS): void {
  vi.mocked(useCellsStore).mockReturnValue({
    cells: cells as unknown as ReturnType<typeof useCellsStore>['cells'],
    selectedId: null,
    selectedCell: null,
    byId: (id: string) => cells.find((c) => c.id === id) ?? null,
    selectCell: vi.fn(),
    $id: 'devboard.cells',
    $patch: vi.fn(),
    $reset: vi.fn(),
    $subscribe: vi.fn(),
    $onAction: vi.fn(),
    $dispose: vi.fn(),
  } as unknown as ReturnType<typeof useCellsStore>)
}

function mountView(cells: CellEntry[] = STUB_CELLS) {
  setupStoreMock(cells)
  return mount(DepsView, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          stubActions: false,
        }),
      ],
      stubs: {
        RouterLink: RouterLinkStub,
      },
    },
  })
}

describe('DepsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the page title from i18n', () => {
    const wrapper = mountView()
    expect(wrapper.find('h1').text()).toContain('deps.title')
  })

  it('renders the cell count in the header', () => {
    const wrapper = mountView()
    expect(wrapper.text()).toContain('deps.count')
  })

  it('renders DepsViewBar with 4 tabs', () => {
    const wrapper = mountView()
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs).toHaveLength(4)
  })

  it('list view panel is visible by default', () => {
    const wrapper = mountView()
    const listPanel = wrapper.find('#deps-panel-list')
    expect(listPanel.exists()).toBe(true)
    // The list panel should not be hidden
    expect(listPanel.attributes('hidden')).toBeUndefined()
  })

  it('other panels are hidden by default', () => {
    const wrapper = mountView()
    for (const id of ['graph', 'tree', 'matrix']) {
      const panel = wrapper.find(`#deps-panel-${id}`)
      expect(panel.exists()).toBe(true)
      expect(panel.attributes('hidden')).toBeDefined()
    }
  })

  it('clicking graph tab shows graph panel and hides list panel', async () => {
    const wrapper = mountView()
    const graphTab = wrapper.find('#deps-tab-graph')
    await graphTab.trigger('click')

    const graphPanel = wrapper.find('#deps-panel-graph')
    expect(graphPanel.attributes('hidden')).toBeUndefined()

    const listPanel = wrapper.find('#deps-panel-list')
    expect(listPanel.attributes('hidden')).toBeDefined()
  })

  it('clicking tree tab shows tree panel', async () => {
    const wrapper = mountView()
    const treeTab = wrapper.find('#deps-tab-tree')
    await treeTab.trigger('click')

    const treePanel = wrapper.find('#deps-panel-tree')
    expect(treePanel.attributes('hidden')).toBeUndefined()
  })

  it('clicking matrix tab shows matrix panel', async () => {
    const wrapper = mountView()
    const matrixTab = wrapper.find('#deps-tab-matrix')
    await matrixTab.trigger('click')

    const matrixPanel = wrapper.find('#deps-panel-matrix')
    expect(matrixPanel.attributes('hidden')).toBeUndefined()
  })

  it('detail aside shows empty state message when no cell selected', () => {
    const wrapper = mountView()
    const aside = wrapper.find('aside')
    expect(aside.exists()).toBe(true)
    expect(aside.text()).toContain('deps.detail.empty')
  })

  it('selecting a cell in list view shows detail aside with cell info', async () => {
    const wrapper = mountView()
    // Click on first cell button in the list view
    const cellBtn = wrapper.find('.deps-list__cell-btn')
    await cellBtn.trigger('click')

    const aside = wrapper.find('aside')
    // After selection, the detail aside should no longer show the empty state
    expect(aside.text()).not.toContain('deps.detail.empty')
    // Should show dependsOn/requiredBy headings
    expect(aside.text()).toContain('deps.detail.dependsOn')
    expect(aside.text()).toContain('deps.detail.requiredBy')
  })

  it('all tabpanels have role=tabpanel', () => {
    const wrapper = mountView()
    const panels = wrapper.findAll('[role="tabpanel"]')
    expect(panels).toHaveLength(4)
  })

  it('tabpanel aria-labelledby corresponds to tab id', () => {
    const wrapper = mountView()
    const listPanel = wrapper.find('#deps-panel-list')
    expect(listPanel.attributes('aria-labelledby')).toBe('deps-tab-list')
  })

  it('close button in detail aside calls select(null)', async () => {
    const wrapper = mountView()
    // First select a cell
    const cellBtn = wrapper.find('.deps-list__cell-btn')
    await cellBtn.trigger('click')

    // Now close button should be visible
    const closeBtn = wrapper.find('.deps-view__detail-close')
    expect(closeBtn.exists()).toBe(true)
    await closeBtn.trigger('click')

    // After closing, empty state should reappear
    const aside = wrapper.find('aside')
    expect(aside.text()).toContain('deps.detail.empty')
  })
})
