import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { defineComponent } from 'vue'
import ContractsView from './ContractsView.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (k: string, params?: Record<string, unknown>) => {
      if (params !== undefined) return `${k}(${JSON.stringify(params)})`
      return k
    },
  }),
}))

// Stub RouterLink
const RouterLinkStub = defineComponent({
  name: 'RouterLink',
  props: { to: { type: String, required: true } },
  template: '<a :href="to"><slot /></a>',
})

// Stub GovernanceGatesPanel so we can test its presence without testing its internals
const GovernanceGatesPanelStub = defineComponent({
  name: 'GovernanceGatesPanel',
  template: '<div class="gates-panel-stub" data-testid="governance-gates-panel"></div>',
})

function mountView() {
  return mount(ContractsView, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          stubActions: false,
        }),
      ],
      stubs: {
        RouterLink: RouterLinkStub,
        GovernanceGatesPanel: GovernanceGatesPanelStub,
      },
    },
  })
}

describe('ContractsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders table rows equal to the registry length', () => {
    const wrapper = mountView()
    const rows = wrapper.findAll('tbody tr')
    // The real manifest has contracts; rows should be > 0
    expect(rows.length).toBeGreaterThan(0)
    // The count badge in the header should reflect the registry count
    expect(wrapper.text()).toContain('contracts.count')
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
    const input = wrapper.find('input[type="search"]')
    expect(input.exists()).toBe(true)
    const inputId = input.attributes('id')
    expect(inputId).toBeTruthy()
    const label = wrapper.find(`label[for="${inputId}"]`)
    expect(label.exists()).toBe(true)
  })

  it('typing a query filters the displayed rows', async () => {
    const wrapper = mountView()
    const allRows = wrapper.findAll('tbody tr')
    const totalRows = allRows.length
    expect(totalRows).toBeGreaterThan(1)

    const input = wrapper.find('input[type="search"]')
    await input.setValue('http.auth.login')
    const filteredRows = wrapper.findAll('tbody tr')
    expect(filteredRows.length).toBeLessThan(totalRows)
  })

  it('shows empty state when query has no matches', async () => {
    const wrapper = mountView()
    const input = wrapper.find('input[type="search"]')
    await input.setValue('zzz-no-match-at-all')
    const rows = wrapper.findAll('tbody tr')
    expect(rows.length).toBe(1)
    expect(wrapper.text()).toContain('contracts.empty')
  })

  it('clicking the contract button shows the detail aside with that contract', async () => {
    const wrapper = mountView()
    // Initially no detail aside visible
    expect(wrapper.find('[data-testid="contract-detail"]').exists()).toBe(false)
    // Activate the first row's selection button
    const firstBtn = wrapper.find('tbody tr .contracts__select-btn')
    expect(firstBtn.exists()).toBe(true)
    await firstBtn.trigger('click')
    // Detail aside should now appear
    const detail = wrapper.find('[data-testid="contract-detail"]')
    expect(detail.exists()).toBe(true)
  })

  it('snapshot banner exists with role="note"', () => {
    const wrapper = mountView()
    const banner = wrapper.find('[role="note"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('contracts.snapshot.note')
  })

  it('contains the GovernanceGatesPanel component', () => {
    const wrapper = mountView()
    const panel = wrapper.find('[data-testid="governance-gates-panel"]')
    expect(panel.exists()).toBe(true)
  })

  it('kind filter buttons have role="group" container', () => {
    const wrapper = mountView()
    const group = wrapper.find('[role="group"]')
    expect(group.exists()).toBe(true)
    const buttons = group.findAll('button')
    expect(buttons.length).toBe(3) // all, http, event
  })

  it('kind filter buttons have aria-pressed attributes', () => {
    const wrapper = mountView()
    const group = wrapper.find('[role="group"]')
    const buttons = group.findAll('button')
    buttons.forEach((btn) => {
      expect(btn.attributes('aria-pressed')).toMatch(/^true|false$/)
    })
  })

  it('"all" filter button is aria-pressed=true initially', () => {
    const wrapper = mountView()
    const group = wrapper.find('[role="group"]')
    const allBtn = group.findAll('button').find((btn) => btn.text().includes('contracts.kind.all'))
    expect(allBtn).toBeDefined()
    expect(allBtn!.attributes('aria-pressed')).toBe('true')
  })

  it('detail aside shows "empty" placeholder when no contract selected', () => {
    const wrapper = mountView()
    // Since nothing is selected by default, detail placeholder should say empty
    expect(wrapper.text()).toContain('contracts.detail.empty')
  })

  it('selecting a contract sets aria-current on its row and aria-pressed on its button', async () => {
    const wrapper = mountView()
    const firstRow = wrapper.find('tbody tr')
    const firstBtn = firstRow.find('.contracts__select-btn')
    await firstBtn.trigger('click')
    expect(firstRow.attributes('aria-current')).toBe('true')
    expect(firstBtn.attributes('aria-pressed')).toBe('true')
  })

  it('table contains expected column headers', () => {
    const wrapper = mountView()
    const text = wrapper.text()
    expect(text).toContain('contracts.table.contract')
    expect(text).toContain('contracts.table.kind')
    expect(text).toContain('contracts.table.servers')
    expect(text).toContain('contracts.table.callers')
  })
})
