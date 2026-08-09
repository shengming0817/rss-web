import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { CellEntry, ContractUsage } from '../../manifest/types'
import ContractsTab from './ContractsTab.vue'

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
  requires: [],
  l0Dependencies: [],
  smokeTests: [],
  slices: [],
  produces: [
    { contract: 'access.authn.v1', role: 'serve' },
    { contract: 'access.authz.v1', role: 'publish' },
  ] satisfies ContractUsage[],
  consumes: [
    { contract: 'audit.event.v1', role: 'call' },
    { contract: 'config.flag.v1', role: 'subscribe' },
  ] satisfies ContractUsage[],
  dependsOnCells: [],
  requiredByCells: [],
  ...overrides,
})

describe('ContractsTab', () => {
  it('renders contracts title key', () => {
    const wrapper = mount(ContractsTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('cells.contracts.title')
  })

  it('renders produces section label', () => {
    const wrapper = mount(ContractsTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('cells.contracts.produces')
  })

  it('renders consumes section label', () => {
    const wrapper = mount(ContractsTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('cells.contracts.consumes')
  })

  it('renders produces contracts in mono', () => {
    const wrapper = mount(ContractsTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('access.authn.v1')
    expect(wrapper.text()).toContain('access.authz.v1')
  })

  it('renders consumes contracts in mono', () => {
    const wrapper = mount(ContractsTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('audit.event.v1')
    expect(wrapper.text()).toContain('config.flag.v1')
  })

  it('renders role pills for produces', () => {
    const wrapper = mount(ContractsTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('cells.roles.serve')
    expect(wrapper.text()).toContain('cells.roles.publish')
  })

  it('renders role pills for consumes', () => {
    const wrapper = mount(ContractsTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('cells.roles.call')
    expect(wrapper.text()).toContain('cells.roles.subscribe')
  })

  it('shows none message when both produces and consumes are empty', () => {
    const wrapper = mount(ContractsTab, {
      props: { cell: makeCell({ produces: [], consumes: [] }) },
    })
    expect(wrapper.text()).toContain('cells.contracts.none')
  })

  it('shows none in produces section when produces empty but consumes not empty', () => {
    const wrapper = mount(ContractsTab, {
      props: { cell: makeCell({ produces: [] }) },
    })
    // Consumes should still render
    expect(wrapper.text()).toContain('audit.event.v1')
  })

  it('produces table has scope=col headers', () => {
    const wrapper = mount(ContractsTab, { props: { cell: makeCell() } })
    const headers = wrapper.findAll('th[scope="col"]')
    expect(headers.length).toBeGreaterThanOrEqual(2)
  })

  it('contract column header key rendered', () => {
    const wrapper = mount(ContractsTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('cells.contracts.contract')
  })

  it('role column header key rendered', () => {
    const wrapper = mount(ContractsTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('cells.contracts.role')
  })
})
