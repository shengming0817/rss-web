import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AITab from './AITab.vue'
import type { CellEntry } from '../../manifest/types'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

const cell: CellEntry = {
  id: 'auditcore',
  name: 'AuditCore',
  domain: 'Audit',
  type: 'core',
  consistencyLevel: 'L1',
  lifecycle: 'stable',
  durabilityMode: 'durable',
  owner: { team: 'platform', role: 'owner' },
  goStructName: 'AuditCore',
  schemaPrimary: null,
  requires: [],
  l0Dependencies: [],
  smokeTests: [],
  slices: [],
  produces: [],
  consumes: [],
  dependsOnCells: [],
  requiredByCells: [],
}

describe('AITab', () => {
  it('renders UnavailablePanel with the ai unavailable message', () => {
    const wrapper = mount(AITab, { props: { cell } })
    expect(wrapper.text()).toContain('cells.unavailable.ai')
  })

  it('renders UnavailablePanel with the shared unavailable title', () => {
    const wrapper = mount(AITab, { props: { cell } })
    expect(wrapper.text()).toContain('cells.unavailable.title')
  })

  it('renders a panel with role="status" (via UnavailablePanel)', () => {
    const wrapper = mount(AITab, { props: { cell } })
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
  })
})
