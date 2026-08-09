import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { defineComponent } from 'vue'
import CellsListView from './CellsListView.vue'
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

// Mock useCellsStore so we control `cells` in the view (the real store reads
// the static generated manifest which has all cells as 'durable').
vi.mock('../stores/useCellsStore', () => ({
  useCellsStore: vi.fn(),
}))

// Stub RouterLink to a simple <a> so href is testable without a router
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
  makeCell({ id: 'accesscore', name: 'AccessCore', domain: 'Access', durabilityMode: 'durable' }),
  makeCell({ id: 'auditcore', name: 'AuditCore', domain: 'Audit', durabilityMode: 'durable' }),
  makeCell({ id: 'configcore', name: 'ConfigCore', domain: 'Config', durabilityMode: 'demo' }),
]

function setupStoreMock(cells: CellEntry[] = STUB_CELLS): void {
  // Return cells as a plain array — in the real store, Pinia's reactive proxy
  // auto-unwraps ComputedRef, so `store.cells` is already readonly CellEntry[].
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
  return mount(CellsListView, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          stubActions: false,
        }),
      ],
      stubs: {
        RouterLink: RouterLinkStub,
        CellDurabilityBadge: {
          name: 'CellDurabilityBadge',
          props: ['mode'],
          template: '<span class="badge-stub" :data-mode="mode">{{ mode }}</span>',
        },
      },
    },
  })
}

describe('CellsListView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a table row for each cell from the store', () => {
    const wrapper = mountView()
    // The real store reads the static manifest which has 3 cells
    const rows = wrapper.findAll('tbody tr')
    expect(rows.length).toBe(3)
  })

  it('renders the CellDurabilityBadge for each row', () => {
    const wrapper = mountView()
    const badges = wrapper.findAll('.badge-stub')
    expect(badges.length).toBe(3)
  })

  it('thead th elements all have scope="col"', () => {
    const wrapper = mountView()
    const headers = wrapper.findAll('thead th')
    expect(headers.length).toBeGreaterThan(0)
    headers.forEach((th) => {
      expect(th.attributes('scope')).toBe('col')
    })
  })

  it('search input has an associated label (for/id pair)', () => {
    const wrapper = mountView()
    const input = wrapper.find('input[type="search"], input[type="text"]')
    expect(input.exists()).toBe(true)
    const inputId = input.attributes('id')
    expect(inputId).toBeTruthy()
    const label = wrapper.find(`label[for="${inputId}"]`)
    expect(label.exists()).toBe(true)
  })

  it('typing a query filters the displayed rows', async () => {
    const wrapper = mountView()
    const input = wrapper.find('input[type="search"], input[type="text"]')
    await input.setValue('audit')
    const rows = wrapper.findAll('tbody tr')
    // Only auditcore should match
    expect(rows.length).toBe(1)
    expect(wrapper.text()).toContain('auditcore')
  })

  it('clicking a domain button filters rows to that domain', async () => {
    const wrapper = mountView()
    // Find the button for 'Audit' domain
    const domainBtn = wrapper.findAll('button').find((btn) => btn.text() === 'Audit')
    expect(domainBtn).toBeDefined()
    await domainBtn!.trigger('click')
    const rows = wrapper.findAll('tbody tr')
    expect(rows.length).toBe(1)
    expect(wrapper.text()).toContain('auditcore')
  })

  it('active domain button has aria-pressed="true"', async () => {
    const wrapper = mountView()
    // The 'all' button renders as t('cells.list.domainAll') which returns the key in the mock
    const allBtn = wrapper.findAll('button').find((btn) => btn.text() === 'cells.list.domainAll')
    expect(allBtn).toBeDefined()
    expect(allBtn!.attributes('aria-pressed')).toBe('true')
  })

  it('non-active domain buttons have aria-pressed="false"', async () => {
    const wrapper = mountView()
    const auditBtn = wrapper.findAll('button').find((btn) => btn.text() === 'Audit')
    expect(auditBtn).toBeDefined()
    expect(auditBtn!.attributes('aria-pressed')).toBe('false')
  })

  it('first cell column contains a link to /cells/:id', () => {
    const wrapper = mountView()
    const firstRow = wrapper.find('tbody tr')
    // The link is in the first td
    const link = firstRow.find('a')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toMatch(/^\/cells\//)
  })

  it('shows the empty state message when no rows match', async () => {
    const wrapper = mountView()
    const input = wrapper.find('input[type="search"], input[type="text"]')
    await input.setValue('zzz-no-match')
    const rows = wrapper.findAll('tbody tr')
    // Only the empty-state row should be present
    expect(rows.length).toBe(1)
    expect(wrapper.text()).toContain('cells.list.empty')
  })

  it('renders the demo badge for configcore (durabilityMode=demo)', () => {
    const wrapper = mountView()
    const badges = wrapper.findAll('.badge-stub')
    const demoBadge = badges.find((b) => b.attributes('data-mode') === 'demo')
    expect(demoBadge).toBeDefined()
  })
})
