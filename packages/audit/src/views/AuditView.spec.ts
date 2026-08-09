import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed } from 'vue'
import { createTestingPinia } from '@pinia/testing'
import { PDP_INJECTION_KEY, type PdpClient } from '@gocell/core'
import { useAuditStore } from '../stores/useAuditStore'
import type { AuditEntry } from '../api/audit'
import AuditView from './AuditView.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const pdp = (allowed: boolean): PdpClient => ({
  can: () => computed(() => allowed),
  decide: () => Promise.resolve({ effect: allowed ? 'allow' : 'deny', reasonCode: '' }),
})

const mkEntry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 'evt-001',
  eventId: 'eid-001',
  eventType: 'slice.merge',
  actorId: 'dario@gocell.dev',
  timestamp: '2026-06-01T12:48:55Z',
  occurredAt: '2026-06-01T12:48:55Z',
  ...over,
})

type StoreState = {
  entries?: AuditEntry[]
  loading?: boolean
  errorKey?: string | null
  hasMore?: boolean
  filter?: string
  actorKind?: string
  actionNs?: string
}

function mountView(state: StoreState = {}, pdpAllowed = true) {
  const wrapper = mount(AuditView, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            'audit.query': {
              entries: [],
              loading: false,
              errorKey: null,
              hasMore: false,
              filter: '',
              actorKind: 'all',
              actionNs: 'all',
              ...state,
            },
          },
        }),
      ],
      provide: {
        [PDP_INJECTION_KEY]: pdp(pdpAllowed),
      },
    },
  })
  const store = useAuditStore()
  return { wrapper, store }
}

describe('AuditView · page structure', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the page heading with i18n key', () => {
    const { wrapper } = mountView()
    expect(wrapper.find('h1').text()).toContain('audit.log.title')
  })

  it('renders the filter input with associated label', () => {
    const { wrapper } = mountView()
    expect(wrapper.find('label[for="audit-filter"]').exists()).toBe(true)
    expect(wrapper.find('#audit-filter').exists()).toBe(true)
  })

  it('renders actor kind select with associated label', () => {
    const { wrapper } = mountView()
    expect(wrapper.find('label[for="audit-actor-kind"]').exists()).toBe(true)
    expect(wrapper.find('#audit-actor-kind').exists()).toBe(true)
  })

  it('renders action namespace select with associated label', () => {
    const { wrapper } = mountView()
    expect(wrapper.find('label[for="audit-action-ns"]').exists()).toBe(true)
    expect(wrapper.find('#audit-action-ns').exists()).toBe(true)
  })

  it('renders chain integrity card in unavailable state', () => {
    const { wrapper } = mountView()
    const chainCard = wrapper.find('[data-testid="chain-integrity"]')
    expect(chainCard.exists()).toBe(true)
    expect(chainCard.attributes('role')).toBe('status')
    expect(chainCard.text()).toContain('audit.log.chain.unavailable')
  })

  it('renders chain card in ok state when entries have intact hash chain', () => {
    // Entries with matching hash/prevHash — chain is intact.
    const e1 = mkEntry({ id: 'e1', ...({ hash: 'h2', prevHash: 'h1' } as object) })
    const e2 = mkEntry({ id: 'e2', ...({ hash: 'h1' } as object) })
    const { wrapper } = mountView({ entries: [e1, e2] })
    const chainCard = wrapper.find('[data-testid="chain-integrity"]')
    expect(chainCard.text()).toContain('audit.log.chain.ok')
  })

  it('renders chain card in broken state when entries have mismatched hashes', () => {
    // Entries with mismatched prevHash/hash — chain is broken.
    const e1 = mkEntry({ id: 'e1', ...({ hash: 'h2', prevHash: 'WRONG' } as object) })
    const e2 = mkEntry({ id: 'e2', ...({ hash: 'h1' } as object) })
    const { wrapper } = mountView({ entries: [e1, e2] })
    const chainCard = wrapper.find('[data-testid="chain-integrity"]')
    expect(chainCard.text()).toContain('audit.log.chain.broken')
  })

  it('calls store.fetchList on mount', async () => {
    const { store } = mountView()
    await flushPromises()
    expect(store.fetchList).toHaveBeenCalledOnce()
  })
})

describe('AuditView · states', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows loading indicator (role=status) while loading', () => {
    const { wrapper } = mountView({ loading: true, entries: [] })
    const status = wrapper.find('[role="status"]')
    expect(status.exists()).toBe(true)
    // Loading text should appear somewhere
    expect(wrapper.text()).toContain('audit.log.loading')
  })

  it('shows empty state when entries is empty and not loading', () => {
    const { wrapper } = mountView({ loading: false, entries: [] })
    expect(wrapper.text()).toContain('audit.log.empty')
  })

  it('shows error in role=alert when errorKey is set', () => {
    const { wrapper } = mountView({ errorKey: 'errors.network' })
    const alert = wrapper.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('errors.network')
  })

  it('renders day group sections when entries exist', () => {
    const { wrapper } = mountView({
      entries: [
        mkEntry({
          id: 'e1',
          occurredAt: '2026-06-01T10:00:00Z',
          timestamp: '2026-06-01T10:00:00Z',
        }),
      ],
    })
    // day heading should appear in a section
    expect(wrapper.findAll('section').length).toBeGreaterThanOrEqual(1)
  })

  it('renders ActorPill for each entry', () => {
    const { wrapper } = mountView({
      entries: [mkEntry({ id: 'e1' })],
    })
    expect(wrapper.findComponent({ name: 'ActorPill' }).exists()).toBe(true)
  })
})

describe('AuditView · detail panel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows detail panel with entry fields when a row is selected', async () => {
    const { wrapper } = mountView({
      entries: [mkEntry({ id: 'e1', eventType: 'slice.merge', actorId: 'dario@gocell.dev' })],
    })
    // Click the first row
    const row = wrapper.find('[data-testid="audit-row"]')
    if (row.exists()) {
      await row.trigger('click')
    }
    // Detail panel should exist (either pre-selected or after click)
    const detail = wrapper.find('[data-testid="audit-detail"]')
    expect(detail.exists()).toBe(true)
  })

  it('detail panel shows chain unavailable text', () => {
    const { wrapper } = mountView({
      entries: [mkEntry()],
    })
    expect(wrapper.text()).toContain('audit.log.chain.unavailable')
  })

  it('detail panel renders tenantId + scope rows when present', () => {
    const { wrapper } = mountView({
      entries: [mkEntry({ tenantId: 'tenant-abc', scope: 'system' })],
    })
    const detail = wrapper.find('[data-testid="audit-detail"]')
    expect(detail.text()).toContain('audit.log.detail.tenantId')
    expect(detail.text()).toContain('tenant-abc')
    expect(detail.text()).toContain('audit.log.detail.scope')
    expect(detail.text()).toContain('system')
  })

  it('detail panel omits tenantId + scope rows when absent (empty/system rows)', () => {
    const { wrapper } = mountView({ entries: [mkEntry()] })
    const detail = wrapper.find('[data-testid="audit-detail"]')
    expect(detail.text()).not.toContain('audit.log.detail.tenantId')
    expect(detail.text()).not.toContain('audit.log.detail.scope')
  })
})

describe('AuditView · quick filter chips', () => {
  beforeEach(() => vi.clearAllMocks())

  it('quick filter chips are keyboard reachable (tabindex != -1)', () => {
    const { wrapper } = mountView()
    const chips = wrapper.findAll('[data-testid="qf-chip"]')
    chips.forEach((chip) => {
      expect(chip.attributes('tabindex')).not.toBe('-1')
    })
  })

  it('clicking a quick filter chip updates store filter state', async () => {
    const { wrapper, store } = mountView()
    const chips = wrapper.findAll('[data-testid="qf-chip"]')
    expect(chips.length).toBeGreaterThan(0)
    // Click the "flag flips" chip (3rd chip)
    await chips[2]?.trigger('click')
    await flushPromises()
    expect(store.actionNs).toBe('flag')
  })
})

describe('AuditView · time range segment', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders 4 time range buttons', () => {
    const { wrapper } = mountView()
    const rangeGroup = wrapper.find('[aria-label="audit.log.range.label"]')
    expect(rangeGroup.exists()).toBe(true)
    const btns = rangeGroup.findAll('button')
    expect(btns).toHaveLength(4)
  })

  it('24h is the default active range', () => {
    const { wrapper } = mountView()
    const active = wrapper.find('.audit__seg-btn--active')
    expect(active.text()).toBe('24h')
  })

  it('clicking a range button updates active range', async () => {
    const { wrapper } = mountView()
    const btns = wrapper.findAll('.audit__seg-btn')
    await btns[0]?.trigger('click') // 1h
    const active = wrapper.find('.audit__seg-btn--active')
    expect(active.text()).toBe('1h')
  })
})

describe('AuditView · load more', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows load-more button when hasMore is true', () => {
    const { wrapper } = mountView({
      entries: [mkEntry()],
      hasMore: true,
    })
    const btn = wrapper.find('[data-action="load-more"]')
    expect(btn.exists()).toBe(true)
  })

  it('clicking load-more calls store.loadMore', async () => {
    const { wrapper, store } = mountView({
      entries: [mkEntry()],
      hasMore: true,
    })
    await wrapper.find('[data-action="load-more"]').trigger('click')
    await flushPromises()
    expect(store.loadMore).toHaveBeenCalled()
  })
})

describe('AuditView · filter controls', () => {
  beforeEach(() => vi.clearAllMocks())

  it('typing in filter input updates store filter', async () => {
    const { wrapper, store } = mountView()
    const input = wrapper.find('#audit-filter')
    await input.setValue('slice')
    expect(store.filter).toBe('slice')
  })

  it('selecting actor kind updates store actorKind', async () => {
    const { wrapper, store } = mountView()
    const select = wrapper.find('#audit-actor-kind')
    await select.setValue('human')
    expect(store.actorKind).toBe('human')
  })

  it('selecting action namespace updates store actionNs', async () => {
    const { wrapper, store } = mountView()
    const select = wrapper.find('#audit-action-ns')
    await select.setValue('flag')
    expect(store.actionNs).toBe('flag')
  })
})
