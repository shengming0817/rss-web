import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createTestingPinia } from '@pinia/testing'
import { useObserveStore } from '../stores/useObserveStore'
import type { MetricSeries } from '../api/observe'
import OverviewPanel from './OverviewPanel.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('@gocell/core', () => ({
  UnavailablePanel: defineComponent({
    name: 'UnavailablePanel',
    props: {
      title: { type: String, default: undefined },
      message: { type: String, required: true },
    },
    template: `<div role="status" data-testid="unavailable-panel">{{ message }}</div>`,
  }),
}))

function mkSeries(v: number): MetricSeries {
  return { metric: {}, points: [{ t: 1000, v }] }
}

type ObserveState = {
  overviewStatus?: string
  overviewErrorKey?: string | null
  kpis?: {
    qps: MetricSeries | null
    p95: MetricSeries | null
    errorRate: MetricSeries | null
    sloBurn: MetricSeries | null
  }
  range?: string
  logsQuery?: string
  tracesService?: string
  logsStatus?: string
  logsErrorKey?: string | null
  logs?: unknown[]
  tracesStatus?: string
  tracesErrorKey?: string | null
  traces?: unknown[]
}

function mountPanel(state: ObserveState = {}) {
  const wrapper = mount(OverviewPanel, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            'observe.signals': {
              overviewStatus: 'idle',
              overviewErrorKey: null,
              kpis: { qps: null, p95: null, errorRate: null, sloBurn: null },
              range: 'h1',
              logsQuery: '',
              tracesService: '',
              logsStatus: 'idle',
              logsErrorKey: null,
              logs: [],
              tracesStatus: 'idle',
              tracesErrorKey: null,
              traces: [],
              ...state,
            },
          },
        }),
      ],
    },
  })
  const store = useObserveStore()
  return { wrapper, store }
}

describe('OverviewPanel · mount', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls loadOverview on mount', async () => {
    const { store } = mountPanel()
    await flushPromises()
    expect(store.loadOverview).toHaveBeenCalledOnce()
  })
})

describe('OverviewPanel · loading branch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows role=status with loading text while loading', () => {
    const { wrapper } = mountPanel({ overviewStatus: 'loading' })
    const status = wrapper.find('[role="status"]')
    expect(status.exists()).toBe(true)
    expect(status.text()).toContain('observe.overview.loading')
  })
})

describe('OverviewPanel · unavailable branch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows UnavailablePanel when status is unavailable', () => {
    const { wrapper } = mountPanel({ overviewStatus: 'unavailable' })
    const panel = wrapper.find('[data-testid="unavailable-panel"]')
    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('observe.unavailable.message')
  })

  it('shows retry button when unavailable', () => {
    const { wrapper } = mountPanel({ overviewStatus: 'unavailable' })
    const btn = wrapper.find('button')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('observe.unavailable.retry')
  })

  it('retry button calls store.loadOverview', async () => {
    const { wrapper, store } = mountPanel({ overviewStatus: 'unavailable' })
    await wrapper.find('button').trigger('click')
    await flushPromises()
    // Called once on mount + once on retry = 2 total
    expect(store.loadOverview).toHaveBeenCalledTimes(2)
  })
})

describe('OverviewPanel · loaded with kpis', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows 4 KPI tiles when kpis are loaded', () => {
    const { wrapper } = mountPanel({
      overviewStatus: 'loaded',
      kpis: {
        qps: mkSeries(12.3),
        p95: mkSeries(0.045),
        errorRate: mkSeries(0.012),
        sloBurn: mkSeries(1.5),
      },
    })
    const tiles = wrapper.findAll('.overview__tile')
    expect(tiles).toHaveLength(4)
  })

  it('renders qps value formatted to 1 decimal', () => {
    const { wrapper } = mountPanel({
      overviewStatus: 'loaded',
      kpis: {
        qps: mkSeries(12.3),
        p95: mkSeries(0.045),
        errorRate: mkSeries(0.012),
        sloBurn: mkSeries(1.5),
      },
    })
    expect(wrapper.text()).toContain('12.3')
  })

  it('renders p95 value as ms integer', () => {
    const { wrapper } = mountPanel({
      overviewStatus: 'loaded',
      kpis: {
        qps: mkSeries(12.3),
        p95: mkSeries(0.045),
        errorRate: mkSeries(0.012),
        sloBurn: mkSeries(1.5),
      },
    })
    // 0.045 seconds * 1000 = 45ms
    expect(wrapper.text()).toContain('45')
  })

  it('renders errorRate as percent', () => {
    const { wrapper } = mountPanel({
      overviewStatus: 'loaded',
      kpis: {
        qps: mkSeries(12.3),
        p95: mkSeries(0.045),
        errorRate: mkSeries(0.012),
        sloBurn: mkSeries(1.5),
      },
    })
    // 0.012 * 100 = 1.20%
    expect(wrapper.text()).toContain('1.20%')
  })
})

describe('OverviewPanel · all-null kpis', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows empty state when all kpis are null (loaded status)', () => {
    const { wrapper } = mountPanel({
      overviewStatus: 'loaded',
      kpis: { qps: null, p95: null, errorRate: null, sloBurn: null },
    })
    const status = wrapper.find('[role="status"]')
    expect(status.exists()).toBe(true)
    expect(status.text()).toContain('observe.overview.empty')
  })

  it('does not show tiles when all kpis are null', () => {
    const { wrapper } = mountPanel({
      overviewStatus: 'loaded',
      kpis: { qps: null, p95: null, errorRate: null, sloBurn: null },
    })
    const tiles = wrapper.findAll('.overview__tile')
    expect(tiles).toHaveLength(0)
  })
})

describe('OverviewPanel · region', () => {
  beforeEach(() => vi.clearAllMocks())

  it('has a section with aria-labelledby pointing to a heading', () => {
    const { wrapper } = mountPanel()
    const section = wrapper.find('section')
    const labelledById = section.attributes('aria-labelledby')
    expect(labelledById).toBeTruthy()
    const heading = wrapper.find(`#${labelledById}`)
    expect(heading.exists()).toBe(true)
    expect(heading.text()).toContain('observe.overview.regionLabel')
  })
})
