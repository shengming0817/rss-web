// @vitest-environment jsdom
import { queryAggregations, secondsMicros, utcMicros } from './telemetry-format'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HistoryPage, HistoryQuery, TelemetryPort } from '@rss/mdm-telemetry'
import type { Runtime } from './runtime'
import { decodeMdmError } from '@rss/api/mdm'
import { TelemetryHealth } from './TelemetryHealth'
import { TelemetryChart } from './TelemetryChart'
import { TelemetryResults } from './TelemetryResults'
import { TelemetryWorkspace } from './Telemetry'
let host: HTMLDivElement, root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const computed = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((e) => computed(e))
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const query: HistoryQuery = {
  device: 'device-a',
  field: 'custom.gauge',
  resource: 'device',
  startMicros: '0',
  endMicros: '100',
  maxPoints: 10,
  mode: 'history',
  after: null,
}
const page: HistoryPage = {
  rows: [
    {
      device: 'reg',
      source: 'agent.script',
      epoch: 'epoch',
      receivedAt: '30',
      liveSource: false,
      sourceConflict: false,
      sample: {
        id: 'sample',
        sequence: '1',
        observedAt: '20',
        interval: null,
        reading: { quality: 'valid', value: { type: 'f64', value: -12.5 } },
        stream: {
          scope: { tenant: 'tenant', namespace: 'mdm.telemetry' },
          source: 'reg:agent.script',
          generation: 'epoch',
        },
        series: {
          definition: {
            scope: { tenant: 'tenant', namespace: 'mdm.telemetry' },
            key: 'custom.gauge',
            version: '1',
            unit: 'degree',
            metric: { kind: 'gauge', number: 'f64' },
            dimensions: {
              allowed: [],
              required: [],
              maxCount: 0,
              maxValueBytes: 16,
              maxTotalBytes: 64,
            },
          },
          subject: 'device-a',
          resource: 'device',
          dimensions: {},
        },
      },
    },
  ],
  unavailable: [],
  next: 'cursor',
  retired: false,
}
function runtime(
  history: unknown,
  effective = async () => ({
    grants: [{ operation: 'inventory_read', scope: { kind: 'device', id: 'device-a' } }],
  }),
  overrides: Partial<TelemetryPort> = {},
) {
  const admin = {
    binding: 'tenant/principal/session',
    telemetry: {
      history,
      resources: async () => ({ resources: ['device'], nextAfter: null, retired: false }),
      health: async () => ({
        batches: [],
        retention: [],
        retired: false,
        batchesTruncated: false,
        retentionTruncated: false,
      }),
      gaps: async () => ({ reports: [], next: null }),
      ...overrides,
    },
    inventory: {
      fields: async () => ({ items: [], nextCursor: null, dictionary: 'catalog' }),
      field: async () => ({
        version: '1',
        definition: { timeSeries: { aggregations: ['min', 'mean'] } },
      }),
    },
    authorization: { effective },
  }
  return { administration: () => admin } as unknown as Runtime
}
function button(name: string) {
  const result = [...host.querySelectorAll('button')].find((b) => b.textContent === name)
  if (!result) throw new Error('Missing button ' + name)
  return result
}
it('clears previous rows while continuing and after a forbidden page; never fills missing values', async () => {
  const history = vi
      .fn()
      .mockResolvedValueOnce(page)
      .mockRejectedValueOnce({ status: 403, code: 'forbidden' }),
    r = runtime(history)
  await act(async () => root.render(h(TelemetryResults, { runtime: r, locale: 'zh', query })))
  expect(host.textContent).toContain('-12.5 degree')
  expect(host.textContent).toContain('旧来源')
  await act(async () => button('下一页观察').click())
  expect(history.mock.calls[1]?.[0]).toEqual({ ...query, after: 'cursor' })
  expect(host.textContent).not.toContain('-12.5 degree')
  expect(host.textContent).toContain('当前账户没有此操作权限')
})
it('drops late responses after device selection changes', async () => {
  let resolve!: (v: HistoryPage) => void
  const history = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r
          }),
      )
      .mockResolvedValueOnce({ rows: [], unavailable: [], next: null, retired: false }),
    r = runtime(history)
  await act(async () => root.render(h(TelemetryResults, { runtime: r, locale: 'zh', query })))
  await act(async () =>
    root.render(
      h(TelemetryResults, { runtime: r, locale: 'zh', query: { ...query, device: 'device-b' } }),
    ),
  )
  await act(async () => resolve(page))
  expect(host.textContent).not.toContain('-12.5 degree')
  expect(host.textContent).toContain('没有数据')
})
it('gates device data using exact device grants', async () => {
  const history = vi.fn(),
    r = runtime(history)
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        null,
        h(TelemetryWorkspace, { runtime: r, locale: 'zh', device: 'device-b' }),
      ),
    ),
  )
  expect(host.textContent).toContain('当前账户没有此终端的遥测读取权限')
  expect(history).not.toHaveBeenCalled()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  await act(async () => document.dispatchEvent(new Event('visibilitychange')))
  expect(host.querySelector('.telemetry-results')).toBeNull()
})

it('preserves microsecond observation coordinates in UTC display', () => {
  expect(utcMicros(20)).toBe('1970-01-01T00:00:00.000020Z')
})
it.each([
  ['1.5', '1500000'],
  ['1.000001', '1000001'],
  ['9007199254740.993001', '9007199254740993001'],
])('preserves exact decimal seconds %s as %s microseconds', (seconds, micros) => {
  expect(secondsMicros(seconds)).toBe(micros)
})
it.each(['0', '-1', 'NaN', '1.0000001'])(
  'rejects a duration without a positive exact microsecond value: %s',
  (seconds) => expect(() => secondsMicros(seconds)).toThrow('Invalid microsecond duration'),
)

async function submitQuery() {
  for (const [label, value] of [
    ['字段键', 'custom.gauge'],
    ['序列资源', 'device'],
  ]) {
    const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  await act(async () => {
    button('查询已上报数据')
      .closest('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}
it('removes actual sibling facts after server denial and does not leave health data behind', async () => {
  const history = vi
      .fn()
      .mockResolvedValueOnce(page)
      .mockRejectedValueOnce({ status: 403, code: 'forbidden' }),
    r = runtime(history)
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        null,
        h(TelemetryWorkspace, { runtime: r, locale: 'zh', device: 'device-a' }),
      ),
    ),
  )
  await submitQuery()
  expect(host.textContent).toContain('-12.5 degree')
  expect(host.querySelector('.telemetry-health-grid')).not.toBeNull()
  await act(async () => button('重新读取数据').click())
  expect(host.textContent).toContain('服务端已拒绝读取')
  expect(host.querySelector('.telemetry-results,.telemetry-health-grid')).toBeNull()
})
it('removes previously visible observations when the document is hidden', async () => {
  const history = vi.fn().mockResolvedValue(page),
    r = runtime(history)
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        null,
        h(TelemetryWorkspace, { runtime: r, locale: 'zh', device: 'device-a' }),
      ),
    ),
  )
  await submitQuery()
  expect(host.textContent).toContain('-12.5 degree')
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  await act(async () => document.dispatchEvent(new Event('visibilitychange')))
  expect(host.textContent).not.toContain('-12.5 degree')
  expect(host.querySelector('.telemetry-results,.telemetry-health-grid')).toBeNull()
})

it('does not use the current field revision to suppress valid frozen historical aggregates', () => {
  const row = page.rows[0]!
  expect(
    queryAggregations(row, {
      version: 1,
      definition: { timeSeries: { aggregations: ['mean'] } },
    }),
  ).toEqual(['mean'])
  expect(queryAggregations(row, { version: 2, definition: null })).toContain('min')
})

it.each([
  [0, Number.MIN_VALUE],
  [-Number.MAX_VALUE, Number.MAX_VALUE],
])('separates finite f64 chart endpoints %s and %s', async (low, high) => {
  const rows = [low, high].map((value, i) => ({
    ...page.rows[0]!,
    sample: {
      ...page.rows[0]!.sample,
      observedAt: String(i),
      reading: { quality: 'valid' as const, value: { type: 'f64' as const, value } },
    },
  }))
  await act(async () => root.render(h(TelemetryChart, { rows, locale: 'en' })))
  expect([...host.querySelectorAll('circle')].map((point) => point.getAttribute('cy'))).toEqual([
    '150',
    '25',
  ])
  expect(host.querySelector('svg')?.textContent).toContain(String(high))
})

it.each([
  [409, 'query_cursor_invalidated', '分页上下文已失效', '保留条件重新开始'],
  [409, 'query_result_unavailable', '原查询结果已不可用', '重新查询'],
  [400, 'malformed_request', '查询请求无效', '从首页重新查询'],
] as const)(
  'restarts the original history query explicitly after %s %s',
  async (status, code, message, action) => {
    const history = vi
      .fn()
      .mockResolvedValueOnce(page)
      .mockRejectedValueOnce(decodeMdmError(status, { code }))
      .mockResolvedValueOnce(page)
    await act(async () =>
      root.render(h(TelemetryResults, { runtime: runtime(history), locale: 'zh', query })),
    )
    await act(async () => button('下一页观察').click())
    expect(history.mock.calls.map(([q]) => q)).toEqual([query, { ...query, after: 'cursor' }])
    expect(host.textContent).toContain(message)
    expect(host.textContent).not.toContain('-12.5 degree')
    await act(async () => button(action).click())
    expect(history).toHaveBeenCalledTimes(3)
    expect(history).toHaveBeenLastCalledWith(query)
    expect(host.textContent).toContain('-12.5 degree')
  },
)

it('shows an invalid first-page request without replaying the same query', async () => {
  const history = vi.fn().mockRejectedValue(decodeMdmError(400, { code: 'malformed_request' }))
  await act(async () =>
    root.render(h(TelemetryResults, { runtime: runtime(history), locale: 'zh', query })),
  )
  expect(host.textContent).toContain('查询请求无效，请核对查询条件')
  expect(host.querySelector('.telemetry-results button')).toBeNull()
  expect(history).toHaveBeenCalledTimes(1)
})

it('drops stale aggregate buckets and explicitly reopens the selected series at its first page', async () => {
  const bucket = {
    window: { start: '0', end: '10' },
    value: { kind: 'number', value: { type: 'f64', value: 42 } },
    validSamples: '1',
    coveredMicros: '10',
    completeness: [],
  }
  const result = {
    buckets: [bucket],
    unavailable: [],
    refreshedThrough: '10',
    resolutionMicros: '300000000',
    next: 'next-buckets',
  }
  const aggregate = vi
    .fn()
    .mockResolvedValueOnce(result)
    .mockRejectedValueOnce(decodeMdmError(409, { code: 'query_cursor_invalidated' }))
    .mockResolvedValueOnce({ ...result, next: null })
  const r = runtime(async () => page, undefined, { aggregate })
  await act(async () => root.render(h(TelemetryResults, { runtime: r, locale: 'zh', query })))
  await act(async () =>
    host
      .querySelector('[aria-label="精确序列与维度"]')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true })),
  )
  await act(async () => document.querySelector<HTMLElement>('.ant-select-item-option')!.click())
  await act(async () => button('查询聚合').click())
  const first = aggregate.mock.calls[0]![0]
  expect(host.querySelector('.telemetry-aggregate')?.textContent).toContain('42 degree')
  await act(async () => button('下一页聚合').click())
  expect(host.querySelector('.telemetry-aggregate')?.textContent).not.toContain('42 degree')
  expect(aggregate.mock.calls[1]![0]).toEqual({
    ...first,
    query: { ...first.query, after: 'next-buckets' },
  })
  await act(async () => button('保留条件重新开始').click())
  expect(aggregate).toHaveBeenCalledTimes(3)
  expect(aggregate).toHaveBeenLastCalledWith(first)
  expect(host.querySelector('.telemetry-aggregate')?.textContent).toContain('42 degree')
})

it('displays retention phases, processed counts and reasons when there are no received batches', async () => {
  const steps = [
    null,
    { state: 'unknown' },
    { state: 'more', processed: 2 },
    { state: 'complete', processed: 4 },
    { state: 'blocked', reason: 'accepted_batches_pending' },
    { state: 'blocked', reason: 'budget_exceeded' },
    { state: 'blocked', reason: 'Cutoff' },
  ] as const
  const r = runtime(async () => page, undefined, {
    health: async () => ({
      batches: [],
      retired: false,
      batchesTruncated: false,
      retentionTruncated: false,
      retention: steps.map((progress, i) => ({
        resource: 'device',
        definitionVersion: i + 1,
        dueAt: 10,
        phase: 1,
        progress,
      })),
    }),
  })
  await act(async () => root.render(h(TelemetryHealth, { runtime: r, locale: 'zh', query })))
  const table = host.querySelector('.telemetry-health-grid details')!
  const values = [...table.querySelectorAll('tbody tr')].map(
    (row) => row.lastElementChild?.textContent,
  )
  expect(table.textContent).toContain('当前阶段')
  expect(values).toEqual([
    '—',
    '未知',
    '待继续，已处理 2 项',
    '上次维护已完成，已处理 4 项',
    '受阻 · 已接收的批次等待发布',
    '受阻 · 超过维护预算',
    '受阻 · 保留边界尚未覆盖清理范围',
  ])
})
