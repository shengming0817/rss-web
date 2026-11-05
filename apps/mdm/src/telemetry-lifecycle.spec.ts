// @vitest-environment jsdom
import { queryAggregations, utcMicros } from './telemetry-format'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HistoryPage, HistoryQuery } from '@rss/mdm-telemetry'
import type { Runtime } from './runtime'
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
  startMicros: 0,
  endMicros: 100,
  maxPoints: 10,
  mode: 'history',
  after: null,
}
const page: HistoryPage = {
  rows: [
    {
      registration: 'reg',
      source: 'agent.script',
      epoch: 'epoch',
      receivedAt: 30,
      liveSource: false,
      sourceConflict: false,
      sample: {
        id: 'sample',
        sequence: 1,
        observedAt: 20,
        interval: null,
        reading: { quality: 'valid', value: -12.5 },
        stream: {
          scope: { tenant: 'tenant', namespace: 'mdm.telemetry' },
          source: 'reg:agent.script',
          generation: 'epoch',
        },
        series: {
          definition: {
            scope: { tenant: 'tenant', namespace: 'mdm.telemetry' },
            key: 'custom.gauge',
            version: 1,
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
    },
    inventory: {
      fields: async () => ({ items: [], nextCursor: null, dictionary: 'catalog' }),
      field: async () => ({
        version: 1,
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
    queryAggregations(row, { version: 1, definition: { timeSeries: { aggregations: ['mean'] } } }),
  ).toEqual(['mean'])
  expect(queryAggregations(row, { version: 2, definition: null })).toContain('min')
})
