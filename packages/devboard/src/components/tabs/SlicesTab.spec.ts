import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { CellEntry, CellSlice, ContractUsage, CellWaiver } from '../../manifest/types'
import SlicesTab from './SlicesTab.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k),
  }),
}))

const waiver: CellWaiver = {
  contract: 'access.authn.v1',
  owner: 'platform',
  reason: 'legacy migration',
  expiresAt: '2026-12-31',
}

const slice1: CellSlice = {
  id: 'access.auth',
  belongsToCell: 'accesscore',
  consistencyLevel: 'L2',
  lifecycle: 'asset',
  contractUsages: [{ contract: 'access.authn.v1', role: 'serve' }] satisfies ContractUsage[],
  unitTests: [],
  contractTests: [],
  waivers: [waiver],
}

const slice2: CellSlice = {
  id: 'access.policy',
  belongsToCell: 'accesscore',
  consistencyLevel: 'L1',
  lifecycle: 'asset',
  contractUsages: [],
  unitTests: [],
  contractTests: [],
  waivers: [],
}

const makeCell = (overrides: Partial<CellEntry> = {}): CellEntry => ({
  id: 'accesscore',
  name: 'AccessCore',
  domain: 'Access',
  type: 'core',
  consistencyLevel: 'L2',
  lifecycle: 'asset',
  durabilityMode: 'durable',
  owner: { team: 'platform', role: 'cell-owner' },
  goStructName: 'AccessCore',
  schemaPrimary: null,
  requires: [],
  l0Dependencies: [],
  smokeTests: [],
  slices: [slice1, slice2],
  produces: [],
  consumes: [],
  dependsOnCells: [],
  requiredByCells: [],
  ...overrides,
})

describe('SlicesTab', () => {
  it('renders slices title key', () => {
    const wrapper = mount(SlicesTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('cells.slices.title')
  })

  it('renders slice id in mono', () => {
    const wrapper = mount(SlicesTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('access.auth')
    expect(wrapper.text()).toContain('access.policy')
  })

  it('renders consistency level for each slice', () => {
    const wrapper = mount(SlicesTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('L2')
    expect(wrapper.text()).toContain('L1')
  })

  it('renders contract usage count for each slice', () => {
    const wrapper = mount(SlicesTab, { props: { cell: makeCell() } })
    // slice1 has 1 contract usage, slice2 has 0
    expect(wrapper.text()).toContain('1')
  })

  it('renders waiver count and expires for slices with waivers', () => {
    const wrapper = mount(SlicesTab, { props: { cell: makeCell() } })
    // waiver expires 2026-12-31
    expect(wrapper.text()).toContain('2026-12-31')
  })

  it('renders waiverExpires i18n key for slice with waivers', () => {
    const wrapper = mount(SlicesTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('cells.slices.waiverExpires')
  })

  it('shows none message when slices is empty', () => {
    const wrapper = mount(SlicesTab, { props: { cell: makeCell({ slices: [] }) } })
    expect(wrapper.text()).toContain('cells.slices.none')
  })

  it('does not show none message when slices is non-empty', () => {
    const wrapper = mount(SlicesTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).not.toContain('cells.slices.none')
  })

  it('table has scope=col on headers', () => {
    const wrapper = mount(SlicesTab, { props: { cell: makeCell() } })
    const headers = wrapper.findAll('th[scope="col"]')
    expect(headers.length).toBeGreaterThanOrEqual(3)
  })

  it('renders slices column header key', () => {
    const wrapper = mount(SlicesTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('cells.slices.slice')
  })

  it('slice with no waivers renders 0 or empty waivers cell', () => {
    const wrapper = mount(SlicesTab, { props: { cell: makeCell() } })
    // slice2 has 0 waivers — should render 0 or a dash
    const rows = wrapper.findAll('tbody tr')
    expect(rows.length).toBe(2)
  })
})
