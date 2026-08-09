import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import { http } from '@gocell/request'
import {
  queryMetric,
  queryLogs,
  searchTraces,
  OBSERVE_METRICS_URL,
  OBSERVE_LOGS_URL,
  OBSERVE_TRACES_URL,
} from './observe'
import type { TimeRange } from './observe'

const range: TimeRange = { start: '2026-06-03T00:00:00Z', end: '2026-06-03T01:00:00Z' }

// ---------------------------------------------------------------------------
// Realistic mock payloads
// ---------------------------------------------------------------------------

const promPayload = {
  status: 'success',
  data: {
    resultType: 'matrix',
    result: [
      {
        metric: { __name__: 'go_goroutines', job: 'gocell' },
        values: [
          [1717372800, '128'],
          [1717372860, '130'],
          [1717372920, 'NaN'],
        ],
      },
      {
        metric: { __name__: 'go_goroutines', job: 'other' },
        values: [[1717372800, '64']],
      },
    ],
  },
}

const lokiPayload = {
  status: 'success',
  data: {
    resultType: 'streams',
    result: [
      {
        stream: { app: 'accesscore', level: 'warn' },
        values: [
          ['1717372800000000000', 'auth token expired'],
          ['1717372860000000000', 'retry succeeded'],
        ],
      },
      {
        stream: { app: 'auditcore', level: 'error' },
        values: [['1717372900000000000', 'db timeout']],
      },
    ],
  },
}

const tempoPayload = {
  traces: [
    {
      traceID: 'abc123def456',
      rootServiceName: 'accesscore',
      rootTraceName: 'POST /api/v1/auth/login',
      startTimeUnixNano: '1717372800000000000',
      durationMs: 45,
      spanSets: [{ matched: 7 }],
    },
    {
      traceID: 'xyz789',
      rootServiceName: 'auditcore',
      rootTraceName: 'GET /api/v1/audit/',
      startTimeUnixNano: '1717372860000000000',
      durationMs: 12,
      spanSet: { matched: 3 },
    },
  ],
}

describe('observe api · queryMetric', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('returns normalized MetricSeries[] on success', async () => {
    mock.onGet(OBSERVE_METRICS_URL).reply(200, promPayload)
    const res = await queryMetric('go_goroutines', range)
    expect(res).toHaveLength(2)
    expect(res[0]?.metric['__name__']).toBe('go_goroutines')
    expect(res[0]?.points).toHaveLength(3)
    expect(res[0]?.points[0]).toEqual({ t: 1717372800, v: 128 })
  })

  it('normalizes NaN string values to 0', async () => {
    mock.onGet(OBSERVE_METRICS_URL).reply(200, promPayload)
    const res = await queryMetric('go_goroutines', range)
    const nanPoint = res[0]?.points[2]
    expect(nanPoint?.v).toBe(0)
  })

  it('coerces string timestamps to finite numbers', async () => {
    mock.onGet(OBSERVE_METRICS_URL).reply(200, {
      status: 'success',
      data: {
        resultType: 'matrix',
        result: [
          {
            metric: { __name__: 'up' },
            values: [['1717372800', '1']],
          },
        ],
      },
    })
    const res = await queryMetric('up', range)
    const point = res[0]?.points[0]
    expect(typeof point?.t).toBe('number')
    expect(Number.isFinite(point?.t)).toBe(true)
    expect(point?.t).toBe(1717372800)
  })

  it('sends correct query params', async () => {
    let seenParams: Record<string, unknown> | undefined
    mock.onGet(OBSERVE_METRICS_URL).reply((config) => {
      seenParams = config.params as Record<string, unknown>
      return [200, promPayload]
    })
    await queryMetric('go_goroutines', range, '30s')
    expect(seenParams).toEqual({
      query: 'go_goroutines',
      start: range.start,
      end: range.end,
      step: '30s',
    })
  })

  it('uses default step "60s" when not provided', async () => {
    let seenParams: Record<string, unknown> | undefined
    mock.onGet(OBSERVE_METRICS_URL).reply((config) => {
      seenParams = config.params as Record<string, unknown>
      return [200, promPayload]
    })
    await queryMetric('up', range)
    expect(seenParams?.['step']).toBe('60s')
  })

  it('returns [] on empty result array', async () => {
    mock.onGet(OBSERVE_METRICS_URL).reply(200, {
      status: 'success',
      data: { resultType: 'matrix', result: [] },
    })
    const res = await queryMetric('up', range)
    expect(res).toEqual([])
  })

  it('returns [] when data is missing', async () => {
    mock.onGet(OBSERVE_METRICS_URL).reply(200, { status: 'success' })
    const res = await queryMetric('up', range)
    expect(res).toEqual([])
  })

  it('returns [] when data.data exists but result is null', async () => {
    mock
      .onGet(OBSERVE_METRICS_URL)
      .reply(200, { status: 'success', data: { resultType: 'matrix', result: null } })
    const res = await queryMetric('up', range)
    expect(res).toEqual([])
  })

  it('throws when prom status is "error"', async () => {
    mock.onGet(OBSERVE_METRICS_URL).reply(200, {
      status: 'error',
      data: { resultType: 'matrix', result: [] },
    })
    await expect(queryMetric('up', range)).rejects.toThrow('prom query failed')
  })

  it('filters out values tuples where first element is non-numeric string', async () => {
    mock.onGet(OBSERVE_METRICS_URL).reply(200, {
      status: 'success',
      data: {
        resultType: 'matrix',
        result: [{ metric: { __name__: 'up' }, values: [['not-a-number', '1']] }],
      },
    })
    const res = await queryMetric('up', range)
    // isPromRawResult rejects the series because first value element fails numeric check
    expect(res).toEqual([])
  })

  it('rejects on 404', async () => {
    mock.onGet(OBSERVE_METRICS_URL).reply(404)
    await expect(queryMetric('up', range)).rejects.toThrow()
  })

  it('rejects on network error', async () => {
    mock.onGet(OBSERVE_METRICS_URL).networkError()
    await expect(queryMetric('up', range)).rejects.toThrow()
  })
})

describe('observe api · queryLogs', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('returns normalized LogLine[] on success', async () => {
    mock.onGet(OBSERVE_LOGS_URL).reply(200, lokiPayload)
    const res = await queryLogs('{app="accesscore"}', range)
    // 2 lines from stream 1 + 1 line from stream 2 = 3
    expect(res).toHaveLength(3)
    expect(res[0]?.tsNs).toBe('1717372800000000000')
    expect(res[0]?.line).toBe('auth token expired')
    expect(res[0]?.labels).toEqual({ app: 'accesscore', level: 'warn' })
  })

  it('sends correct query params including limit', async () => {
    let seenParams: Record<string, unknown> | undefined
    mock.onGet(OBSERVE_LOGS_URL).reply((config) => {
      seenParams = config.params as Record<string, unknown>
      return [200, lokiPayload]
    })
    await queryLogs('{app="gocell"}', range, 50)
    expect(seenParams).toEqual({
      query: '{app="gocell"}',
      start: range.start,
      end: range.end,
      limit: 50,
    })
  })

  it('uses default limit 100 when not provided', async () => {
    let seenParams: Record<string, unknown> | undefined
    mock.onGet(OBSERVE_LOGS_URL).reply((config) => {
      seenParams = config.params as Record<string, unknown>
      return [200, lokiPayload]
    })
    await queryLogs('{app="gocell"}', range)
    expect(seenParams?.['limit']).toBe(100)
  })

  it('returns [] on empty result array', async () => {
    mock.onGet(OBSERVE_LOGS_URL).reply(200, {
      status: 'success',
      data: { resultType: 'streams', result: [] },
    })
    const res = await queryLogs('{app="x"}', range)
    expect(res).toEqual([])
  })

  it('returns [] when data is missing', async () => {
    mock.onGet(OBSERVE_LOGS_URL).reply(200, { status: 'success' })
    const res = await queryLogs('{app="x"}', range)
    expect(res).toEqual([])
  })

  it('returns [] when data.data exists but result is null', async () => {
    mock
      .onGet(OBSERVE_LOGS_URL)
      .reply(200, { status: 'success', data: { resultType: 'streams', result: null } })
    const res = await queryLogs('{app="x"}', range)
    expect(res).toEqual([])
  })

  it('filters out loki stream entries where values is a non-array non-undefined value', async () => {
    mock.onGet(OBSERVE_LOGS_URL).reply(200, {
      status: 'success',
      data: {
        resultType: 'streams',
        result: [
          { stream: { app: 'ok' }, values: null }, // values is not array and not undefined → filtered
          { stream: { app: 'good' }, values: [['1000', 'msg']] },
        ],
      },
    })
    const res = await queryLogs('{app="x"}', range)
    expect(res).toHaveLength(1)
    expect(res[0]?.labels['app']).toBe('good')
  })

  it('rejects on 404', async () => {
    mock.onGet(OBSERVE_LOGS_URL).reply(404)
    await expect(queryLogs('{app="x"}', range)).rejects.toThrow()
  })

  it('rejects on network error', async () => {
    mock.onGet(OBSERVE_LOGS_URL).networkError()
    await expect(queryLogs('{app="x"}', range)).rejects.toThrow()
  })
})

describe('observe api · searchTraces', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('returns normalized TraceSummary[] on success', async () => {
    mock.onGet(OBSERVE_TRACES_URL).reply(200, tempoPayload)
    const res = await searchTraces('accesscore')
    expect(res).toHaveLength(2)
    expect(res[0]?.traceId).toBe('abc123def456')
    expect(res[0]?.rootService).toBe('accesscore')
    expect(res[0]?.durationMs).toBe(45)
    expect(res[0]?.spanCount).toBe(7)
  })

  it('falls back to spanSet.matched when spanSets is absent', async () => {
    mock.onGet(OBSERVE_TRACES_URL).reply(200, tempoPayload)
    const res = await searchTraces('auditcore')
    // trace[1] uses spanSet (not spanSets)
    expect(res[1]?.spanCount).toBe(3)
  })

  it('sends correct query params', async () => {
    let seenParams: Record<string, unknown> | undefined
    mock.onGet(OBSERVE_TRACES_URL).reply((config) => {
      seenParams = config.params as Record<string, unknown>
      return [200, tempoPayload]
    })
    await searchTraces('accesscore', 10)
    expect(seenParams).toEqual({
      tags: 'service.name=accesscore',
      limit: 10,
    })
  })

  it('uses default limit 20 when not provided', async () => {
    let seenParams: Record<string, unknown> | undefined
    mock.onGet(OBSERVE_TRACES_URL).reply((config) => {
      seenParams = config.params as Record<string, unknown>
      return [200, tempoPayload]
    })
    await searchTraces('gocell')
    expect(seenParams?.['limit']).toBe(20)
  })

  it('returns [] on empty traces array', async () => {
    mock.onGet(OBSERVE_TRACES_URL).reply(200, { traces: [] })
    const res = await searchTraces('x')
    expect(res).toEqual([])
  })

  it('returns [] when traces field is missing', async () => {
    mock.onGet(OBSERVE_TRACES_URL).reply(200, {})
    const res = await searchTraces('x')
    expect(res).toEqual([])
  })

  it('normalizes a trace with only traceID present (other fields fall back to defaults)', async () => {
    // isTempoRawTrace now requires traceID or rootServiceName; use traceID to pass
    mock.onGet(OBSERVE_TRACES_URL).reply(200, { traces: [{ traceID: 'abc' }] })
    const res = await searchTraces('x')
    expect(res).toHaveLength(1)
    expect(res[0]).toEqual({
      traceId: 'abc',
      rootService: '',
      rootName: '',
      startUnixNano: '',
      durationMs: 0,
      spanCount: 0,
    })
  })

  it('filters out traces that have neither traceID nor rootServiceName', async () => {
    mock.onGet(OBSERVE_TRACES_URL).reply(200, {
      traces: [
        {}, // no traceID or rootServiceName → filtered
        { traceID: 'valid', durationMs: 5 }, // valid
      ],
    })
    const res = await searchTraces('x')
    expect(res).toHaveLength(1)
    expect(res[0]?.traceId).toBe('valid')
  })

  it('handles spanSets[0].matched being undefined (falls back to 0)', async () => {
    mock.onGet(OBSERVE_TRACES_URL).reply(200, {
      traces: [{ traceID: 'x1', spanSets: [{}] }],
    })
    const res = await searchTraces('x')
    expect(res[0]?.spanCount).toBe(0)
  })

  it('handles spanSet.matched being non-number (falls back to 0)', async () => {
    mock.onGet(OBSERVE_TRACES_URL).reply(200, {
      traces: [{ traceID: 'x2', spanSet: { matched: 'three' } }],
    })
    const res = await searchTraces('x')
    expect(res[0]?.spanCount).toBe(0)
  })

  it('rejects on 404', async () => {
    mock.onGet(OBSERVE_TRACES_URL).reply(404)
    await expect(searchTraces('x')).rejects.toThrow()
  })

  it('rejects on network error', async () => {
    mock.onGet(OBSERVE_TRACES_URL).networkError()
    await expect(searchTraces('x')).rejects.toThrow()
  })
})
