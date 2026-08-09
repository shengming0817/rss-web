import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createTestingPinia } from '@pinia/testing'
import { useObserveStore } from '../stores/useObserveStore'
import type { LogLine } from '../api/observe'
import LogsPanel from './LogsPanel.vue'

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

const mkLog = (over: Partial<LogLine> = {}): LogLine => ({
  tsNs: '1717228135000000000',
  line: 'test log line',
  labels: { level: 'info', cell: 'accesscore' },
  ...over,
})

type ObserveState = {
  logsStatus?: string
  logsErrorKey?: string | null
  logs?: LogLine[]
  logsQuery?: string
  overviewStatus?: string
  overviewErrorKey?: string | null
  kpis?: { qps: null; p95: null; errorRate: null; sloBurn: null }
  range?: string
  tracesService?: string
  tracesStatus?: string
  tracesErrorKey?: string | null
  traces?: unknown[]
}

function mountPanel(state: ObserveState = {}) {
  const wrapper = mount(LogsPanel, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            'observe.signals': {
              logsStatus: 'idle',
              logsErrorKey: null,
              logs: [],
              logsQuery: '',
              overviewStatus: 'idle',
              overviewErrorKey: null,
              kpis: { qps: null, p95: null, errorRate: null, sloBurn: null },
              range: 'h1',
              tracesService: '',
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

describe('LogsPanel · mount', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls loadLogs on mount', async () => {
    const { store } = mountPanel()
    await flushPromises()
    expect(store.loadLogs).toHaveBeenCalledOnce()
  })
})

describe('LogsPanel · loading branch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows role=status with loading text', () => {
    const { wrapper } = mountPanel({ logsStatus: 'loading' })
    const status = wrapper.find('[role="status"]')
    expect(status.exists()).toBe(true)
    expect(status.text()).toContain('observe.logs.loading')
  })
})

describe('LogsPanel · unavailable branch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows UnavailablePanel when unavailable', () => {
    const { wrapper } = mountPanel({ logsStatus: 'unavailable' })
    expect(wrapper.find('[data-testid="unavailable-panel"]').exists()).toBe(true)
  })

  it('shows retry button when unavailable', () => {
    const { wrapper } = mountPanel({ logsStatus: 'unavailable' })
    const btn = wrapper.find('button.logs__retry')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('observe.unavailable.retry')
  })

  it('retry button calls store.loadLogs', async () => {
    const { wrapper, store } = mountPanel({ logsStatus: 'unavailable' })
    await wrapper.find('button.logs__retry').trigger('click')
    await flushPromises()
    // mount fires once + retry fires once
    expect(store.loadLogs).toHaveBeenCalledTimes(2)
  })
})

describe('LogsPanel · empty branch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows empty state when loaded with no logs', () => {
    const { wrapper } = mountPanel({ logsStatus: 'loaded', logs: [] })
    const status = wrapper.find('[role="status"]')
    expect(status.exists()).toBe(true)
    expect(status.text()).toContain('observe.logs.empty')
  })
})

describe('LogsPanel · loaded with data', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders a table with column headers', () => {
    const { wrapper } = mountPanel({
      logsStatus: 'loaded',
      logs: [mkLog()],
    })
    const headers = wrapper.findAll('th[scope="col"]')
    expect(headers.length).toBeGreaterThanOrEqual(4)
  })

  it('renders one row per log entry', () => {
    const { wrapper } = mountPanel({
      logsStatus: 'loaded',
      logs: [mkLog(), mkLog({ tsNs: '1717228136000000000', line: 'second line' })],
    })
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
  })

  it('renders log line content in cells', () => {
    const { wrapper } = mountPanel({
      logsStatus: 'loaded',
      logs: [mkLog({ line: 'hello world log' })],
    })
    expect(wrapper.text()).toContain('hello world log')
  })

  it('renders level from labels', () => {
    const { wrapper } = mountPanel({
      logsStatus: 'loaded',
      logs: [mkLog({ labels: { level: 'warn', cell: 'auditcore' } })],
    })
    expect(wrapper.text()).toContain('warn')
  })

  it('renders cell from labels', () => {
    const { wrapper } = mountPanel({
      logsStatus: 'loaded',
      logs: [mkLog({ labels: { level: 'info', cell: 'configcore' } })],
    })
    expect(wrapper.text()).toContain('configcore')
  })

  it('shows count line', () => {
    const { wrapper } = mountPanel({
      logsStatus: 'loaded',
      logs: [mkLog()],
    })
    expect(wrapper.text()).toContain('observe.logs.count')
  })

  it('falls back to — when labels are missing', () => {
    const { wrapper } = mountPanel({
      logsStatus: 'loaded',
      logs: [mkLog({ labels: {} })],
    })
    expect(wrapper.text()).toContain('—')
  })
})

describe('LogsPanel · search form', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders search input with associated label', () => {
    const { wrapper } = mountPanel()
    const label = wrapper.find('label')
    const input = wrapper.find('input')
    expect(label.exists()).toBe(true)
    expect(input.exists()).toBe(true)
    expect(label.attributes('for')).toBe(input.attributes('id'))
  })

  it('submit button triggers loadLogs via form submit', async () => {
    const { wrapper, store } = mountPanel({ logsStatus: 'loaded', logs: [] })
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(store.loadLogs).toHaveBeenCalledTimes(2)
  })

  it('form submit triggers loadLogs', async () => {
    const { wrapper, store } = mountPanel()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(store.loadLogs).toHaveBeenCalledTimes(2)
  })
})
