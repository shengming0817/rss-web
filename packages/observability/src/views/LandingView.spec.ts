import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { createTestRouter } from '@gocell/core/testing'
import type { Router } from 'vue-router'
import LandingView from './LandingView.vue'
import { useHealthStore } from '../stores/useHealthStore'

// ─── module mocks ─────────────────────────────────────────────────────────────

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k),
  }),
}))

// Prevent real polling/timers; expose a spy for assertions.
vi.mock('../composables/useHealthPoll', () => ({
  useHealthPoll: vi.fn(() => ({ stop: vi.fn() })),
}))

// Stub heavy child components so the view spec focuses on layout/state.
vi.mock('../components/CellHealthCard.vue', () => ({
  default: {
    name: 'CellHealthCard',
    props: ['cell'],
    template: '<div class="stub-cell-card" data-testid="cell-health-card" />',
  },
}))

vi.mock('../components/SystemInfoCard.vue', () => ({
  default: {
    name: 'SystemInfoCard',
    props: ['system', 'status'],
    template: '<div class="stub-system-card" data-testid="system-info-card" />',
  },
}))

// ─── helpers ──────────────────────────────────────────────────────────────────

type HealthState = {
  healthStatus?: 'idle' | 'loading' | 'loaded' | 'unavailable'
  cells?: object[]
  lastCheckAt?: string | null
  system?: object | null
  systemStatus?: 'idle' | 'loading' | 'loaded' | 'unavailable'
  rollup?: { total: number; healthy: number; degraded: number; down: number }
}

function mountView(state: HealthState = {}) {
  const router: Router = createTestRouter([
    { path: '/', name: 'landing', component: LandingView },
    { path: '/observe', name: 'observe', component: { template: '<div />' } },
  ])

  const wrapper = mount(LandingView, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            'observe.health': {
              healthStatus: 'idle',
              cells: [],
              lastCheckAt: null,
              system: null,
              systemStatus: 'idle',
              rollup: { total: 0, healthy: 0, degraded: 0, down: 0 },
              ...state,
            },
          },
        }),
        router,
      ],
    },
  })

  const health = useHealthStore()
  return { wrapper, router, health }
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('LandingView · page structure', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the h1 with the landing.title i18n key', () => {
    const { wrapper } = mountView()
    expect(wrapper.find('h1').text()).toContain('landing.title')
  })

  it('h1 carries the v1-h1 class', () => {
    const { wrapper } = mountView()
    expect(wrapper.find('h1').classes()).toContain('v1-h1')
  })

  it('renders the subtitle with the landing.subtitle i18n key', () => {
    const { wrapper } = mountView()
    expect(wrapper.find('p.v1-sub').text()).toContain('landing.subtitle')
  })

  it('renders the SystemInfoCard stub', () => {
    const { wrapper } = mountView()
    expect(wrapper.find('[data-testid="system-info-card"]').exists()).toBe(true)
  })

  it('renders the deploys placeholder panel', () => {
    const { wrapper } = mountView({ healthStatus: 'loaded' })
    expect(wrapper.text()).toContain('landing.deploys.title')
    expect(wrapper.text()).toContain('landing.deploys.unavailable')
  })

  it('renders the KPI placeholder panel', () => {
    const { wrapper } = mountView({ healthStatus: 'loaded' })
    expect(wrapper.text()).toContain('landing.kpi.title')
    expect(wrapper.text()).toContain('landing.kpi.unavailable')
  })

  it('renders a RouterLink to /observe inside the KPI section', () => {
    const { wrapper } = mountView({ healthStatus: 'loaded' })
    const link = wrapper.find('a[href="/observe"]')
    expect(link.exists()).toBe(true)
  })
})

describe('LandingView · refresh button', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refresh button is present and calls health.refresh', async () => {
    const { wrapper, health } = mountView()
    const btn = wrapper.find('button[type="button"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('landing.refresh')
    await btn.trigger('click')
    await flushPromises()
    expect(health.refresh).toHaveBeenCalled()
  })
})

describe('LandingView · lastCheckAt display', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows last-check text when lastCheckAt is set', () => {
    const { wrapper } = mountView({ lastCheckAt: '2026-06-03T10:00:00Z' })
    expect(wrapper.text()).toContain('landing.lastCheck')
  })

  it('hides last-check text when lastCheckAt is null', () => {
    const { wrapper } = mountView({ lastCheckAt: null })
    expect(wrapper.text()).not.toContain('landing.lastCheck')
  })

  it('renders a11y live region (role=status) always present', () => {
    const { wrapper } = mountView({ lastCheckAt: '2026-06-03T10:00:00Z' })
    const liveRegion = wrapper.find('p.sr-only[role="status"]')
    expect(liveRegion.exists()).toBe(true)
    expect(liveRegion.attributes('aria-live')).toBe('polite')
  })

  it('a11y live region announces loading when in idle state with no lastCheckAt', () => {
    // idle + no lastCheckAt → live region shows loading text (idle is treated as loading)
    const { wrapper } = mountView({ lastCheckAt: null, healthStatus: 'idle' })
    const liveRegion = wrapper.find('p.sr-only[role="status"]')
    expect(liveRegion.exists()).toBe(true)
    expect(liveRegion.text().trim()).toBe('landing.loading')
  })

  it('a11y live region announces loaded state via lastCheck text when loaded', () => {
    const { wrapper } = mountView({
      lastCheckAt: '2026-06-03T10:00:00Z',
      healthStatus: 'loaded',
    })
    const liveRegion = wrapper.find('p.sr-only[role="status"]')
    expect(liveRegion.exists()).toBe(true)
    expect(liveRegion.text().trim()).toContain('landing.liveRegion')
  })
})

describe('LandingView · loading branch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows loading indicator (role=status) while loading with no cells', () => {
    const { wrapper } = mountView({ healthStatus: 'loading', cells: [] })
    const loading = wrapper.find('[role="status"]')
    expect(loading.exists()).toBe(true)
    expect(wrapper.text()).toContain('landing.loading')
  })

  it('does not render CellHealthCard stubs in loading state', () => {
    const { wrapper } = mountView({ healthStatus: 'loading', cells: [] })
    expect(wrapper.find('[data-testid="cell-health-card"]').exists()).toBe(false)
  })
})

describe('LandingView · degraded branch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows health-degraded banner when healthStatus is unavailable', () => {
    const { wrapper } = mountView({ healthStatus: 'unavailable' })
    expect(wrapper.find('[data-testid="health-degraded"]').exists()).toBe(true)
  })

  it('shows unavailable title and message texts', () => {
    const { wrapper } = mountView({ healthStatus: 'unavailable' })
    expect(wrapper.text()).toContain('landing.unavailable.title')
    expect(wrapper.text()).toContain('landing.unavailable.message')
  })

  it('degraded section has a retry button that calls health.refresh', async () => {
    const { wrapper, health } = mountView({ healthStatus: 'unavailable' })
    const degraded = wrapper.find('[data-testid="health-degraded"]')
    const retryBtn = degraded.find('button')
    expect(retryBtn.exists()).toBe(true)
    await retryBtn.trigger('click')
    await flushPromises()
    expect(health.refresh).toHaveBeenCalled()
  })
})

describe('LandingView · loaded branch', () => {
  beforeEach(() => vi.clearAllMocks())

  const fakeCells = [
    {
      name: 'accesscore',
      type: 'core',
      status: 'healthy',
      durability: 'Durable',
      version: '1.0.0',
      commit: 'abc',
      startedAt: '',
      uptimeSeconds: 0,
      lastHealthCheckAt: '',
      lastHealthCheckDurationMs: 0,
      sliceCount: 0,
      slices: [],
    },
    {
      name: 'auditcore',
      type: 'core',
      status: 'degraded',
      durability: 'Durable',
      version: '1.0.0',
      commit: 'abc',
      startedAt: '',
      uptimeSeconds: 0,
      lastHealthCheckAt: '',
      lastHealthCheckDurationMs: 0,
      sliceCount: 0,
      slices: [],
    },
  ]

  it('renders one CellHealthCard stub per cell', () => {
    const { wrapper } = mountView({
      healthStatus: 'loaded',
      cells: fakeCells,
      rollup: { total: 2, healthy: 1, degraded: 1, down: 0 },
    })
    const cards = wrapper.findAll('[data-testid="cell-health-card"]')
    expect(cards).toHaveLength(2)
  })

  it('renders summary section with rollup counts', () => {
    const { wrapper } = mountView({
      healthStatus: 'loaded',
      cells: fakeCells,
      rollup: { total: 2, healthy: 1, degraded: 1, down: 0 },
    })
    expect(wrapper.text()).toContain('landing.summary.label')
    expect(wrapper.text()).toContain('landing.summary.total')
    expect(wrapper.text()).toContain('landing.summary.healthy')
    expect(wrapper.text()).toContain('landing.summary.degraded')
    expect(wrapper.text()).toContain('landing.summary.down')
  })

  it('does not show health-degraded banner in loaded state', () => {
    const { wrapper } = mountView({
      healthStatus: 'loaded',
      cells: fakeCells,
      rollup: { total: 2, healthy: 1, degraded: 1, down: 0 },
    })
    expect(wrapper.find('[data-testid="health-degraded"]').exists()).toBe(false)
  })
})
