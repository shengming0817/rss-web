import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { CellEntry } from '../../manifest/types'
import OverviewTab from './OverviewTab.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}))

// Stub child components to avoid their own i18n/router deps
vi.mock('../CellDurabilityBadge.vue', () => ({
  default: { template: '<span data-testid="durability-badge" />' },
}))
vi.mock('@gocell/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gocell/core')>()
  return {
    ...actual,
    UnavailablePanel: { template: '<div data-testid="unavailable-panel" />' },
  }
})

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
  schemaPrimary: 'access.v1',
  requires: ['postgres', 'redis'],
  l0Dependencies: [],
  smokeTests: ['smoke-auth'],
  slices: [],
  produces: [],
  consumes: [],
  dependsOnCells: [],
  requiredByCells: [],
  ...overrides,
})

describe('OverviewTab', () => {
  it('renders cell id', () => {
    const wrapper = mount(OverviewTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('accesscore')
  })

  it('renders cell name', () => {
    const wrapper = mount(OverviewTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('AccessCore')
  })

  it('renders domain', () => {
    const wrapper = mount(OverviewTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('Access')
  })

  it('renders owner team', () => {
    const wrapper = mount(OverviewTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('platform')
  })

  it('renders consistencyLevel', () => {
    const wrapper = mount(OverviewTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('L2')
  })

  it('renders lifecycle', () => {
    const wrapper = mount(OverviewTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('asset')
  })

  it('renders goStructName', () => {
    const wrapper = mount(OverviewTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('AccessCore')
  })

  it('renders schemaPrimary when present', () => {
    const wrapper = mount(OverviewTab, {
      props: { cell: makeCell({ schemaPrimary: 'access.v1' }) },
    })
    expect(wrapper.text()).toContain('access.v1')
  })

  it('shows unavailable label when schemaPrimary is null', () => {
    const wrapper = mount(OverviewTab, { props: { cell: makeCell({ schemaPrimary: null }) } })
    // i18n key returned as-is by mock
    expect(wrapper.text()).toContain('cells.unavailable.label')
  })

  it('renders CellDurabilityBadge', () => {
    const wrapper = mount(OverviewTab, { props: { cell: makeCell() } })
    expect(wrapper.find('[data-testid="durability-badge"]').exists()).toBe(true)
  })

  it('renders UnavailablePanel for Health section (degraded)', () => {
    const wrapper = mount(OverviewTab, { props: { cell: makeCell() } })
    // Health and Runtime are degraded — at least one UnavailablePanel expected
    const panels = wrapper.findAll('[data-testid="unavailable-panel"]')
    expect(panels.length).toBeGreaterThanOrEqual(1)
  })

  it('does not render fabricated runtime numbers', () => {
    const wrapper = mount(OverviewTab, { props: { cell: makeCell() } })
    // Should NOT contain QPS, p95, replicas etc. as those are backend-only
    expect(wrapper.text()).not.toContain('QPS')
    expect(wrapper.text()).not.toContain('p95')
  })
})
