import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { CellEntry } from '../../manifest/types'
import WiringTab from './WiringTab.vue'

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
  l0Dependencies: ['kernel'],
  smokeTests: [],
  slices: [],
  produces: [],
  consumes: [],
  dependsOnCells: [],
  requiredByCells: [],
  ...overrides,
})

describe('WiringTab', () => {
  it('renders wiring title key', () => {
    const wrapper = mount(WiringTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('cells.wiring.title')
  })

  it('renders wiring hint key', () => {
    const wrapper = mount(WiringTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('cells.wiring.hint')
  })

  it('renders requires section with infra deps', () => {
    const wrapper = mount(WiringTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('postgres')
    expect(wrapper.text()).toContain('redis')
  })

  it('renders l0Dependencies section', () => {
    const wrapper = mount(WiringTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('kernel')
  })

  it('renders infraToCell key in SVG diagram', () => {
    const wrapper = mount(WiringTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('cells.wiring.infraToCell')
  })

  it('renders an inline SVG', () => {
    const wrapper = mount(WiringTab, { props: { cell: makeCell() } })
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('shows none message when both requires and l0Dependencies are empty', () => {
    const wrapper = mount(WiringTab, {
      props: { cell: makeCell({ requires: [], l0Dependencies: [] }) },
    })
    expect(wrapper.text()).toContain('cells.wiring.none')
  })

  it('does not show none message when requires is non-empty', () => {
    const wrapper = mount(WiringTab, {
      props: { cell: makeCell({ requires: ['postgres'], l0Dependencies: [] }) },
    })
    expect(wrapper.text()).not.toContain('cells.wiring.none')
  })

  it('renders requires section label', () => {
    const wrapper = mount(WiringTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('cells.wiring.requires')
  })

  it('renders l0deps section label', () => {
    const wrapper = mount(WiringTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('cells.wiring.l0deps')
  })
})
