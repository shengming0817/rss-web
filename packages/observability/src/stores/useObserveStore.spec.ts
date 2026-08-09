import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import MockAdapter from 'axios-mock-adapter'
import { http } from '@gocell/request'
import { useObserveStore } from './useObserveStore'
import { OBSERVE_METRICS_URL, OBSERVE_LOGS_URL, OBSERVE_TRACES_URL } from '../api/observe'

// ---------------------------------------------------------------------------
// Mock payloads — shaped to match the upstream Prometheus / Loki / Tempo raw
// response format that the api layer normalizes.
// ---------------------------------------------------------------------------

/** A minimal Prometheus query_range matrix response with one series. */
const mkPromResponse = (metric: Record<string, string> = {}) => ({
  status: 'success',
  data: {
    resultType: 'matrix',
    result: [
      {
        metric,
        values: [
          [1748952000, '1.5'],
          [1748952060, '1.7'],
        ],
      },
    ],
  },
})

/** An empty Prometheus response (no series). */
const emptyPromResponse = () => ({
  status: 'success',
  data: { resultType: 'matrix', result: [] },
})

/** A minimal Loki query_range streams response. */
const mkLokiResponse = () => ({
  status: 'success',
  data: {
    resultType: 'streams',
    result: [
      {
        stream: { cell: 'accesscore', level: 'info' },
        values: [
          ['1748952000000000000', 'starting up'],
          ['1748952001000000000', 'ready'],
        ],
      },
    ],
  },
})

/** A minimal Tempo search response. */
const mkTempoResponse = () => ({
  traces: [
    {
      traceID: 'trace-abc',
      rootServiceName: 'accesscore',
      rootTraceName: 'POST /api/v1/auth/login',
      startTimeUnixNano: '1748952000000000000',
      durationMs: 42,
      spanSets: [{ matched: 5 }],
    },
  ],
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useObserveStore', () => {
  let mock: MockAdapter

  beforeEach(() => {
    setActivePinia(createPinia())
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
    vi.restoreAllMocks()
  })

  // ─── initial state ────────────────────────────────────────────────────────

  it('starts with default state', () => {
    const store = useObserveStore()
    expect(store.range).toBe('h1')
    expect(store.logsQuery).toBe('')
    expect(store.tracesService).toBe('')

    expect(store.overviewStatus).toBe('idle')
    expect(store.overviewErrorKey).toBeNull()
    expect(store.kpis).toEqual({ qps: null, p95: null, errorRate: null, sloBurn: null })

    expect(store.logsStatus).toBe('idle')
    expect(store.logsErrorKey).toBeNull()
    expect(store.logs).toEqual([])

    expect(store.tracesStatus).toBe('idle')
    expect(store.tracesErrorKey).toBeNull()
    expect(store.traces).toEqual([])
  })

  // ─── setRange ─────────────────────────────────────────────────────────────

  describe('setRange', () => {
    it('updates the range preset without fetching', () => {
      const store = useObserveStore()
      const loadSpy = vi.spyOn(store, 'loadOverview')
      store.setRange('h24')
      expect(store.range).toBe('h24')
      expect(loadSpy).not.toHaveBeenCalled()
    })
  })

  // ─── setLogsQuery / setTracesService ──────────────────────────────────────

  describe('setLogsQuery', () => {
    it('updates logsQuery ref', () => {
      const store = useObserveStore()
      store.setLogsQuery('{cell="accesscore"}')
      expect(store.logsQuery).toBe('{cell="accesscore"}')
    })

    it('clears logsQuery when called with empty string', () => {
      const store = useObserveStore()
      store.setLogsQuery('previous')
      store.setLogsQuery('')
      expect(store.logsQuery).toBe('')
    })
  })

  describe('setTracesService', () => {
    it('updates tracesService ref', () => {
      const store = useObserveStore()
      store.setTracesService('auditcore')
      expect(store.tracesService).toBe('auditcore')
    })

    it('clears tracesService when called with empty string', () => {
      const store = useObserveStore()
      store.setTracesService('previous')
      store.setTracesService('')
      expect(store.tracesService).toBe('')
    })
  })

  // ─── loadOverview ─────────────────────────────────────────────────────────

  describe('loadOverview', () => {
    it('sets overviewStatus to loading before await', async () => {
      mock.onGet(OBSERVE_METRICS_URL).reply(200, mkPromResponse())
      const store = useObserveStore()

      const p = store.loadOverview()
      expect(store.overviewStatus).toBe('loading')
      await p
    })

    it('populates kpis and sets status=loaded on full success', async () => {
      mock.onGet(OBSERVE_METRICS_URL).reply(200, mkPromResponse({ __name__: 'gocell_metric' }))
      const store = useObserveStore()
      await store.loadOverview()

      expect(store.overviewStatus).toBe('loaded')
      expect(store.overviewErrorKey).toBeNull()
      // All four queries hit the same mocked URL → each gets the same series
      expect(store.kpis.qps).not.toBeNull()
      expect(store.kpis.p95).not.toBeNull()
      expect(store.kpis.errorRate).not.toBeNull()
      expect(store.kpis.sloBurn).not.toBeNull()
    })

    it('sets status=loaded when only some queries succeed (partial)', async () => {
      // Two of four queries succeed, two fail — allSettled with ≥1 success → loaded
      mock
        .onGet(OBSERVE_METRICS_URL)
        .replyOnce(200, mkPromResponse())
        .onGet(OBSERVE_METRICS_URL)
        .replyOnce(200, mkPromResponse())
        .onGet(OBSERVE_METRICS_URL)
        .replyOnce(500)
        .onGet(OBSERVE_METRICS_URL)
        .replyOnce(500)
      const store = useObserveStore()
      await store.loadOverview()

      expect(store.overviewStatus).toBe('loaded')
    })

    it('sets status=unavailable when all four queries fail', async () => {
      mock.onGet(OBSERVE_METRICS_URL).reply(500)
      const store = useObserveStore()
      await expect(store.loadOverview()).resolves.toBeUndefined()

      expect(store.overviewStatus).toBe('unavailable')
      expect(store.overviewErrorKey).not.toBeNull()
    })

    it('sets status=unavailable on all network errors', async () => {
      mock.onGet(OBSERVE_METRICS_URL).networkError()
      const store = useObserveStore()
      await expect(store.loadOverview()).resolves.toBeUndefined()

      expect(store.overviewStatus).toBe('unavailable')
      expect(store.overviewErrorKey).not.toBeNull()
    })

    it('kpis null when query returns empty series', async () => {
      mock.onGet(OBSERVE_METRICS_URL).reply(200, emptyPromResponse())
      const store = useObserveStore()
      await store.loadOverview()

      expect(store.overviewStatus).toBe('loaded')
      expect(store.kpis.qps).toBeNull()
    })
  })

  // ─── loadLogs ─────────────────────────────────────────────────────────────

  describe('loadLogs', () => {
    it('sets logsStatus to loading before await', async () => {
      mock.onGet(OBSERVE_LOGS_URL).reply(200, mkLokiResponse())
      const store = useObserveStore()

      const p = store.loadLogs()
      expect(store.logsStatus).toBe('loading')
      await p
    })

    it('populates logs on success', async () => {
      mock.onGet(OBSERVE_LOGS_URL).reply(200, mkLokiResponse())
      const store = useObserveStore()
      await store.loadLogs()

      expect(store.logsStatus).toBe('loaded')
      expect(store.logs.length).toBeGreaterThan(0)
      expect(store.logsErrorKey).toBeNull()
    })

    it('uses default logql when logsQuery is empty', async () => {
      const getSpy = vi.spyOn(http, 'get')
      mock.onGet(OBSERVE_LOGS_URL).reply(200, mkLokiResponse())
      const store = useObserveStore()
      await store.loadLogs()

      // The first get call's params should include the default logql
      const callParams = getSpy.mock.calls[0]?.[1]?.params as Record<string, string> | undefined
      expect(callParams?.['query']).toBe('{cell=~".+"}')
    })

    it('degrades to unavailable on 500 without throwing', async () => {
      mock.onGet(OBSERVE_LOGS_URL).reply(500)
      const store = useObserveStore()
      await expect(store.loadLogs()).resolves.toBeUndefined()

      expect(store.logsStatus).toBe('unavailable')
      expect(store.logsErrorKey).not.toBeNull()
    })

    it('degrades to unavailable on network error without throwing', async () => {
      mock.onGet(OBSERVE_LOGS_URL).networkError()
      const store = useObserveStore()
      await expect(store.loadLogs()).resolves.toBeUndefined()

      expect(store.logsStatus).toBe('unavailable')
      expect(store.logsErrorKey).not.toBeNull()
    })

    it('uses custom logsQuery when set', async () => {
      const getSpy = vi.spyOn(http, 'get')
      mock.onGet(OBSERVE_LOGS_URL).reply(200, mkLokiResponse())
      const store = useObserveStore()
      store.logsQuery = '{cell="accesscore"}'
      await store.loadLogs()

      const callParams = getSpy.mock.calls[0]?.[1]?.params as Record<string, string> | undefined
      expect(callParams?.['query']).toBe('{cell="accesscore"}')
    })
  })

  // ─── loadTraces ───────────────────────────────────────────────────────────

  describe('loadTraces', () => {
    it('sets tracesStatus to loading before await', async () => {
      mock.onGet(OBSERVE_TRACES_URL).reply(200, mkTempoResponse())
      const store = useObserveStore()

      const p = store.loadTraces()
      expect(store.tracesStatus).toBe('loading')
      await p
    })

    it('populates traces on success', async () => {
      mock.onGet(OBSERVE_TRACES_URL).reply(200, mkTempoResponse())
      const store = useObserveStore()
      await store.loadTraces()

      expect(store.tracesStatus).toBe('loaded')
      expect(store.traces).toHaveLength(1)
      expect(store.traces[0]?.traceId).toBe('trace-abc')
      expect(store.tracesErrorKey).toBeNull()
    })

    it('uses default service when tracesService is empty', async () => {
      const getSpy = vi.spyOn(http, 'get')
      mock.onGet(OBSERVE_TRACES_URL).reply(200, mkTempoResponse())
      const store = useObserveStore()
      await store.loadTraces()

      const callParams = getSpy.mock.calls[0]?.[1]?.params as Record<string, string> | undefined
      expect(callParams?.['tags']).toBe('service.name=corebundle')
    })

    it('degrades to unavailable on 500 without throwing', async () => {
      mock.onGet(OBSERVE_TRACES_URL).reply(500)
      const store = useObserveStore()
      await expect(store.loadTraces()).resolves.toBeUndefined()

      expect(store.tracesStatus).toBe('unavailable')
      expect(store.tracesErrorKey).not.toBeNull()
    })

    it('degrades to unavailable on network error without throwing', async () => {
      mock.onGet(OBSERVE_TRACES_URL).networkError()
      const store = useObserveStore()
      await expect(store.loadTraces()).resolves.toBeUndefined()

      expect(store.tracesStatus).toBe('unavailable')
      expect(store.tracesErrorKey).not.toBeNull()
    })

    it('uses custom tracesService when set', async () => {
      const getSpy = vi.spyOn(http, 'get')
      mock.onGet(OBSERVE_TRACES_URL).reply(200, mkTempoResponse())
      const store = useObserveStore()
      store.tracesService = 'auditcore'
      await store.loadTraces()

      const callParams = getSpy.mock.calls[0]?.[1]?.params as Record<string, string> | undefined
      expect(callParams?.['tags']).toBe('service.name=auditcore')
    })
  })
})
