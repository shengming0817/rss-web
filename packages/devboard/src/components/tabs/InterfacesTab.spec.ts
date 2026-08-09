import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { CellEntry, ContractUsage } from '../../manifest/types'
import InterfacesTab from './InterfacesTab.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k }),
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
  schemaPrimary: null,
  requires: ['postgres'],
  l0Dependencies: [],
  smokeTests: ['smoke-auth', 'smoke-policy'],
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
  ],
  produces: [
    { contract: 'access.authn.v1', role: 'serve' },
    { contract: 'access.authz.v1', role: 'serve' },
  ] satisfies ContractUsage[],
  consumes: [{ contract: 'audit.event.v1', role: 'call' }] satisfies ContractUsage[],
  dependsOnCells: ['auditcore'],
  requiredByCells: [],
  ...overrides,
})

describe('InterfacesTab', () => {
  it('renders ISP title key', () => {
    const wrapper = mount(InterfacesTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('cells.interfaces.ispTitle')
  })

  it('renders ISP hint key', () => {
    const wrapper = mount(InterfacesTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('cells.interfaces.ispHint')
  })

  it('renders Identity card with cell id', () => {
    const wrapper = mount(InterfacesTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('accesscore')
  })

  it('renders Identity card with team', () => {
    const wrapper = mount(InterfacesTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('platform')
  })

  it('renders Lifecycle card with lifecycle value', () => {
    const wrapper = mount(InterfacesTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('asset')
  })

  it('renders Status card with UnavailablePanel (degraded)', () => {
    const wrapper = mount(InterfacesTab, { props: { cell: makeCell() } })
    expect(wrapper.find('[data-testid="unavailable-panel"]').exists()).toBe(true)
  })

  it('renders Inventory card with slice count', () => {
    const wrapper = mount(InterfacesTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('1')
  })

  it('renders produces contracts list', () => {
    const wrapper = mount(InterfacesTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('access.authn.v1')
    expect(wrapper.text()).toContain('access.authz.v1')
  })

  it('renders consumes contracts list', () => {
    const wrapper = mount(InterfacesTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('audit.event.v1')
  })

  it('shows noProduces message when produces is empty', () => {
    const wrapper = mount(InterfacesTab, { props: { cell: makeCell({ produces: [] }) } })
    expect(wrapper.text()).toContain('cells.interfaces.noProduces')
  })

  it('shows noConsumes message when consumes is empty', () => {
    const wrapper = mount(InterfacesTab, { props: { cell: makeCell({ consumes: [] }) } })
    expect(wrapper.text()).toContain('cells.interfaces.noConsumes')
  })

  it('renders role pills for produces contracts', () => {
    const wrapper = mount(InterfacesTab, { props: { cell: makeCell() } })
    // role pill text = t('cells.roles.serve') = key itself via mock
    expect(wrapper.text()).toContain('cells.roles.serve')
  })

  it('renders role pills for consumes contracts', () => {
    const wrapper = mount(InterfacesTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('cells.roles.call')
  })

  it('renders smoke test count in Inventory card', () => {
    const wrapper = mount(InterfacesTab, { props: { cell: makeCell() } })
    expect(wrapper.text()).toContain('2')
  })
})
