import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { CellEntry } from '../../manifest/types'
import DependenciesTab from './DependenciesTab.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}))

vi.mock('vue-router', () => ({
  RouterLink: {
    name: 'RouterLink',
    props: { to: [String, Object] },
    template: '<a :href="String(to)"><slot /></a>',
  },
  useRouter: () => ({}),
  useRoute: () => ({}),
}))

// Stub RouterLink to avoid needing a full router setup
const RouterLinkStub = {
  name: 'RouterLink',
  props: { to: [String, Object] },
  template: '<a :href="String(to)"><slot /></a>',
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
  requires: ['postgres', 'redis'],
  l0Dependencies: [],
  smokeTests: [],
  slices: [],
  produces: [],
  consumes: [],
  dependsOnCells: ['auditcore', 'configcore'],
  requiredByCells: ['observabilitycore'],
  ...overrides,
})

const mountOpts = {
  global: {
    components: { RouterLink: RouterLinkStub },
  },
}

describe('DependenciesTab', () => {
  it('renders dependencies title key', () => {
    const wrapper = mount(DependenciesTab, { props: { cell: makeCell() }, ...mountOpts })
    expect(wrapper.text()).toContain('cells.dependencies.title')
  })

  it('renders hint key', () => {
    const wrapper = mount(DependenciesTab, { props: { cell: makeCell() }, ...mountOpts })
    expect(wrapper.text()).toContain('cells.dependencies.hint')
  })

  it('renders dependsOn section label', () => {
    const wrapper = mount(DependenciesTab, { props: { cell: makeCell() }, ...mountOpts })
    expect(wrapper.text()).toContain('cells.dependencies.dependsOn')
  })

  it('renders requiredBy section label', () => {
    const wrapper = mount(DependenciesTab, { props: { cell: makeCell() }, ...mountOpts })
    expect(wrapper.text()).toContain('cells.dependencies.requiredBy')
  })

  it('renders infra section label', () => {
    const wrapper = mount(DependenciesTab, { props: { cell: makeCell() }, ...mountOpts })
    expect(wrapper.text()).toContain('cells.dependencies.infra')
  })

  it('renders dependsOnCells as RouterLinks', () => {
    const wrapper = mount(DependenciesTab, { props: { cell: makeCell() }, ...mountOpts })
    expect(wrapper.text()).toContain('auditcore')
    expect(wrapper.text()).toContain('configcore')
  })

  it('renders requiredByCells as RouterLinks', () => {
    const wrapper = mount(DependenciesTab, { props: { cell: makeCell() }, ...mountOpts })
    expect(wrapper.text()).toContain('observabilitycore')
  })

  it('renders infra dependencies', () => {
    const wrapper = mount(DependenciesTab, { props: { cell: makeCell() }, ...mountOpts })
    expect(wrapper.text()).toContain('postgres')
    expect(wrapper.text()).toContain('redis')
  })

  it('shows none message when dependsOnCells and requiredByCells are empty', () => {
    const wrapper = mount(DependenciesTab, {
      props: { cell: makeCell({ dependsOnCells: [], requiredByCells: [] }) },
      ...mountOpts,
    })
    expect(wrapper.text()).toContain('cells.dependencies.none')
  })

  it('does not show none when dependsOnCells non-empty', () => {
    const wrapper = mount(DependenciesTab, { props: { cell: makeCell() }, ...mountOpts })
    expect(wrapper.text()).not.toContain('cells.dependencies.none')
  })

  it('RouterLink to attribute contains cell id', () => {
    const wrapper = mount(DependenciesTab, { props: { cell: makeCell() }, ...mountOpts })
    const links = wrapper.findAll('a')
    const hrefs = links.map((l) => l.attributes('href'))
    expect(hrefs.some((h) => h?.includes('auditcore'))).toBe(true)
  })
})
