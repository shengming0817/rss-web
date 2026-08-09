import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { CellEntry, ContractUsage } from '../../manifest/types'
import InventoryTab from './InventoryTab.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}))

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
  requires: ['postgres', 'redis'],
  l0Dependencies: [],
  smokeTests: ['smoke-a', 'smoke-b', 'smoke-c'],
  slices: [
    {
      id: 'access.auth',
      belongsToCell: 'accesscore',
      consistencyLevel: 'L2',
      lifecycle: 'asset',
      contractUsages: [],
      unitTests: [],
      contractTests: [],
      waivers: [],
    },
    {
      id: 'access.policy',
      belongsToCell: 'accesscore',
      consistencyLevel: 'L1',
      lifecycle: 'asset',
      contractUsages: [],
      unitTests: [],
      contractTests: [],
      waivers: [],
    },
  ],
  produces: [{ contract: 'access.authn.v1', role: 'serve' }] satisfies ContractUsage[],
  consumes: [
    { contract: 'audit.event.v1', role: 'call' },
    { contract: 'config.flag.v1', role: 'call' },
  ] satisfies ContractUsage[],
  dependsOnCells: [],
  requiredByCells: [],
  ...overrides,
})

describe('InventoryTab', () => {
  it('renders inventory title key', () => {
    const wrapper = mount(InventoryTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('cells.inventory.title')
  })

  it('renders slice count', () => {
    const wrapper = mount(InventoryTab, { props: { cell: makeCell() } })
    // 2 slices
    expect(wrapper.text()).toContain('2')
  })

  it('renders produces count', () => {
    const wrapper = mount(InventoryTab, { props: { cell: makeCell() } })
    // 1 produced contract
    expect(wrapper.text()).toContain('1')
  })

  it('renders consumes count', () => {
    const wrapper = mount(InventoryTab, { props: { cell: makeCell() } })
    // 2 consumed contracts
    expect(wrapper.text()).toContain('2')
  })

  it('renders requires count', () => {
    const wrapper = mount(InventoryTab, { props: { cell: makeCell() } })
    // 2 requires
    expect(wrapper.text()).toContain('2')
  })

  it('renders smoke test count', () => {
    const wrapper = mount(InventoryTab, { props: { cell: makeCell() } })
    // 3 smoke tests
    expect(wrapper.text()).toContain('3')
  })

  it('renders total contracts count (produces + consumes)', () => {
    const wrapper = mount(InventoryTab, { props: { cell: makeCell() } })
    // 1 + 2 = 3
    expect(wrapper.text()).toContain('3')
  })

  it('table has scope=col on headers', () => {
    const wrapper = mount(InventoryTab, { props: { cell: makeCell() } })
    const headers = wrapper.findAll('th[scope="col"]')
    expect(headers.length).toBeGreaterThanOrEqual(2)
  })

  it('renders inventory slices label', () => {
    const wrapper = mount(InventoryTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('cells.inventory.slices')
  })

  it('renders inventory contracts label', () => {
    const wrapper = mount(InventoryTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('cells.inventory.contracts')
  })
})
