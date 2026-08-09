import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createTestingPinia } from '@pinia/testing'
import { useObserveStore } from '../stores/useObserveStore'
import type { TraceSummary } from '../api/observe'
import TracesPanel from './TracesPanel.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (k: string, params?: Record<string, unknown>) =>
      params ? `${k}:${JSON.stringify(params)}` : k,
  }),
}))
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

const mkTrace = (over: Partial<TraceSummary> = {}): TraceSummary => ({
  traceId: 'abc123def456',
  rootService: 'corebundle',
  rootName: '/api/v1/cells',
  startUnixNano: '1717228135000000000',
  durationMs: 42,
  spanCount: 5,
  ...over,
})

type ObserveState = {
  tracesStatus?: string
  tracesErrorKey?: string | null
  traces?: TraceSummary[]
  tracesService?: string
  overviewStatus?: string
  overviewErrorKey?: string | null
  kpis?: { qps: null; p95: null; errorRate: null; sloBurn: null }
  range?: string
  logsQuery?: string
  logsStatus?: string
  logsErrorKey?: string | null
  logs?: unknown[]
}

function mountPanel(state: ObserveState = {}) {
  const wrapper = mount(TracesPanel, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            'observe.signals': {
              tracesStatus: 'idle',
              tracesErrorKey: null,
              traces: [],
              tracesService: '',
              overviewStatus: 'idle',
              overviewErrorKey: null,
              kpis: { qps: null, p95: null, errorRate: null, sloBurn: null },
              range: 'h1',
              logsQuery: '',
              logsStatus: 'idle',
              logsErrorKey: null,
              logs: [],
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

describe('TracesPanel · mount', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls loadTraces on mount', async () => {
    const { store } = mountPanel()
    await flushPromises()
    expect(store.loadTraces).toHaveBeenCalledOnce()
  })
})

describe('TracesPanel · loading branch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows role=status with loading text', () => {
    const { wrapper } = mountPanel({ tracesStatus: 'loading' })
    const status = wrapper.find('[role="status"]')
    expect(status.exists()).toBe(true)
    expect(status.text()).toContain('observe.traces.loading')
  })
})

describe('TracesPanel · unavailable branch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows UnavailablePanel when unavailable', () => {
    const { wrapper } = mountPanel({ tracesStatus: 'unavailable' })
    expect(wrapper.find('[data-testid="unavailable-panel"]').exists()).toBe(true)
  })

  it('shows retry button when unavailable', () => {
    const { wrapper } = mountPanel({ tracesStatus: 'unavailable' })
    const btn = wrapper.find('button.traces__retry')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('observe.unavailable.retry')
  })

  it('retry button calls store.loadTraces', async () => {
    const { wrapper, store } = mountPanel({ tracesStatus: 'unavailable' })
    await wrapper.find('button.traces__retry').trigger('click')
    await flushPromises()
    expect(store.loadTraces).toHaveBeenCalledTimes(2)
  })
})

describe('TracesPanel · empty branch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows empty state when loaded with no traces', () => {
    const { wrapper } = mountPanel({ tracesStatus: 'loaded', traces: [] })
    const status = wrapper.find('[role="status"]')
    expect(status.exists()).toBe(true)
    expect(status.text()).toContain('observe.traces.empty')
  })
})

describe('TracesPanel · loaded with data', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders column headers with scope=col', () => {
    const { wrapper } = mountPanel({
      tracesStatus: 'loaded',
      traces: [mkTrace()],
    })
    const headers = wrapper.findAll('th[scope="col"]')
    expect(headers.length).toBeGreaterThanOrEqual(6)
  })

  it('renders one row per trace', () => {
    const { wrapper } = mountPanel({
      tracesStatus: 'loaded',
      traces: [mkTrace(), mkTrace({ traceId: 'xyz789' })],
    })
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
  })

  it('renders traceId in cell', () => {
    const { wrapper } = mountPanel({
      tracesStatus: 'loaded',
      traces: [mkTrace({ traceId: 'abc123def456' })],
    })
    expect(wrapper.text()).toContain('abc123def456')
  })

  it('renders rootService in cell', () => {
    const { wrapper } = mountPanel({
      tracesStatus: 'loaded',
      traces: [mkTrace({ rootService: 'myservice' })],
    })
    expect(wrapper.text()).toContain('myservice')
  })

  it('renders durationMs with ms suffix', () => {
    const { wrapper } = mountPanel({
      tracesStatus: 'loaded',
      traces: [mkTrace({ durationMs: 42 })],
    })
    expect(wrapper.text()).toContain('42ms')
  })

  it('renders spanCount', () => {
    const { wrapper } = mountPanel({
      tracesStatus: 'loaded',
      traces: [mkTrace({ spanCount: 7 })],
    })
    expect(wrapper.text()).toContain('7')
  })

  it('shows count line', () => {
    const { wrapper } = mountPanel({
      tracesStatus: 'loaded',
      traces: [mkTrace()],
    })
    expect(wrapper.text()).toContain('observe.traces.count')
  })
})

describe('TracesPanel · search form', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders search input with associated label', () => {
    const { wrapper } = mountPanel()
    const label = wrapper.find('label')
    const input = wrapper.find('input')
    expect(label.exists()).toBe(true)
    expect(input.exists()).toBe(true)
    expect(label.attributes('for')).toBe(input.attributes('id'))
  })

  it('submit button triggers loadTraces via form submit', async () => {
    const { wrapper, store } = mountPanel({ tracesStatus: 'loaded', traces: [] })
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(store.loadTraces).toHaveBeenCalledTimes(2)
  })

  it('form submit triggers loadTraces', async () => {
    const { wrapper, store } = mountPanel()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(store.loadTraces).toHaveBeenCalledTimes(2)
  })
})

describe('TracesPanel · region', () => {
  beforeEach(() => vi.clearAllMocks())

  it('has a section with aria-labelledby pointing to a heading', () => {
    const { wrapper } = mountPanel()
    const section = wrapper.find('section')
    const labelledById = section.attributes('aria-labelledby')
    expect(labelledById).toBeTruthy()
    const heading = wrapper.find(`#${labelledById}`)
    expect(heading.exists()).toBe(true)
    expect(heading.text()).toContain('observe.traces.regionLabel')
  })
})
