import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createTestPinia } from '@gocell/core/testing'
import AuditTab from './AuditTab.vue'
import type { CellEntry } from '../../manifest/types'

vi.mock('../../api/cellAudit', () => ({
  fetchCellAudit: vi.fn(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('vue-router', () => ({
  RouterLink: defineComponent({
    props: { to: String },
    setup(props, { slots }) {
      return () => h('a', { href: String(props.to) }, slots.default?.())
    },
  }),
}))

import { fetchCellAudit } from '../../api/cellAudit'

const mockFetch = vi.mocked(fetchCellAudit)

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

const sampleEntries = [
  {
    id: 'evt-001',
    eventId: 'eid-001',
    eventType: 'slice.merge',
    actorId: 'dario@gocell.dev',
    subjectId: 'auditcore/persist@a7f3',
    correlationId: 'corr-abc',
    occurredAt: '2026-06-01T12:48:55Z',
    timestamp: '2026-06-01T12:48:56Z',
    payload: { pr: 2241 },
  },
  {
    id: 'evt-002',
    eventId: 'eid-002',
    eventType: 'config.update',
    actorId: 'sam@gocell.dev',
    timestamp: '2026-06-02T09:00:00Z',
  },
]

/** Mount with a fresh testing Pinia (real actions run against the mocked fetch). */
function mountTab() {
  return mount(AuditTab, {
    props: { cell },
    global: { plugins: [createTestPinia({ createSpy: vi.fn })] },
  })
}

describe('AuditTab', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('shows loading state before the fetch resolves', () => {
    mockFetch.mockReturnValue(new Promise(() => {}))
    const wrapper = mountTab()
    expect(wrapper.find('[role="status"]').text()).toBe('cells.audit.loading')
    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('renders a table with entries after successful fetch', async () => {
    mockFetch.mockResolvedValue({
      data: sampleEntries,
      nextCursor: 'cur-2',
      hasMore: false,
    })
    const wrapper = mountTab()
    await flushPromises()

    expect(wrapper.find('table').exists()).toBe(true)
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.text()).toContain('slice.merge')
    expect(rows[0]?.text()).toContain('dario@gocell.dev')
  })

  it('renders column headers from i18n keys', async () => {
    mockFetch.mockResolvedValue({
      data: sampleEntries,
      nextCursor: '',
      hasMore: false,
    })
    const wrapper = mountTab()
    await flushPromises()

    const headers = wrapper.findAll('th')
    expect(headers[0]?.text()).toBe('cells.audit.action')
    expect(headers[1]?.text()).toBe('cells.audit.actor')
    expect(headers[2]?.text()).toBe('cells.audit.time')
  })

  it('shows empty state when data array is empty', async () => {
    mockFetch.mockResolvedValue({ data: [], nextCursor: '', hasMore: false })
    const wrapper = mountTab()
    await flushPromises()

    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.text()).toContain('cells.audit.empty')
  })

  it('shows error state when fetch rejects', async () => {
    mockFetch.mockRejectedValue(new Error('network error'))
    const wrapper = mountTab()
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('cells.audit.error')
    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('renders open-full link in data state', async () => {
    mockFetch.mockResolvedValue({
      data: sampleEntries,
      nextCursor: '',
      hasMore: false,
    })
    const wrapper = mountTab()
    await flushPromises()

    const link = wrapper.find('a')
    expect(link.exists()).toBe(true)
    expect(link.text()).toBe('cells.audit.openFull')
  })

  it('calls fetchCellAudit with limit: 20', async () => {
    mockFetch.mockResolvedValue({ data: [], nextCursor: '', hasMore: false })
    mountTab()
    await flushPromises()

    expect(mockFetch).toHaveBeenCalledWith({ limit: 20 })
  })

  it('reuses the cached entries on tab re-entry (no refetch)', async () => {
    mockFetch.mockResolvedValue({ data: sampleEntries, nextCursor: '', hasMore: false })
    // Same store instance across both mounts → models leaving and re-entering the tab.
    const pinia = createTestPinia({ createSpy: vi.fn })
    const first = mount(AuditTab, { props: { cell }, global: { plugins: [pinia] } })
    await flushPromises()
    expect(mockFetch).toHaveBeenCalledTimes(1)

    first.unmount()
    const second = mount(AuditTab, { props: { cell }, global: { plugins: [pinia] } })
    await flushPromises()

    // Cache hit: no second request, data shown immediately.
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(second.find('table').exists()).toBe(true)
  })
})
