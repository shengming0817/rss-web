import { defineStore } from 'pinia'
import { shallowRef, ref } from 'vue'
import { toI18nKey } from '@gocell/request'
import { queryMetric, queryLogs, searchTraces } from '../api/observe'
import type { MetricSeries, LogLine, TraceSummary, TimeRange } from '../api/observe'
import { rangeFromPreset } from '../lib/timeRange'
import type { RangePreset } from '../lib/timeRange'
import type { LoadStatus } from '../lib/loadStatus'

// ---------------------------------------------------------------------------
// PromQL queries for the four overview KPIs
// ---------------------------------------------------------------------------
const QUERIES = {
  qps: 'sum(rate(gocell_http_requests_total[5m]))',
  p95: 'histogram_quantile(0.95, sum(rate(gocell_http_request_duration_seconds_bucket[5m])) by (le))',
  errorRate:
    'sum(rate(gocell_http_requests_total{status=~"5.."}[5m])) / sum(rate(gocell_http_requests_total[5m]))',
  sloBurn: 'gocell_slo_budget_burn_24h',
} as const

/**
 * observe.signals — observability query state.
 *
 * Owns: active time range, log/trace query params, and per-domain
 * fetch status + data for overview KPIs, logs, and traces.
 *
 * All fetch actions degrade individually; none rethrow.
 */
export const useObserveStore = defineStore('observe.signals', () => {
  // ─── query params ─────────────────────────────────────────────────────────
  const range = ref<RangePreset>('h1')
  const logsQuery = ref('')
  const tracesService = ref('')

  // ─── overview KPIs state ──────────────────────────────────────────────────
  const overviewStatus = ref<LoadStatus>('idle')
  const overviewErrorKey = ref<string | null>(null)
  // shallowRef: kpis object is replaced wholesale; no in-place element mutation.
  const kpis = shallowRef<{
    qps: MetricSeries | null
    p95: MetricSeries | null
    errorRate: MetricSeries | null
    sloBurn: MetricSeries | null
  }>({ qps: null, p95: null, errorRate: null, sloBurn: null })

  // ─── logs state ───────────────────────────────────────────────────────────
  // shallowRef: log arrays are replaced wholesale; no in-place element mutation.
  const logsStatus = ref<LoadStatus>('idle')
  const logsErrorKey = ref<string | null>(null)
  const logs = shallowRef<LogLine[]>([])

  // ─── traces state ─────────────────────────────────────────────────────────
  // shallowRef: same rationale as logs.
  const tracesStatus = ref<LoadStatus>('idle')
  const tracesErrorKey = ref<string | null>(null)
  const traces = shallowRef<TraceSummary[]>([])

  // ─── private helper ───────────────────────────────────────────────────────

  /** Build a TimeRange for the currently selected preset using wall-clock time. */
  function currentRange(): TimeRange {
    return rangeFromPreset(range.value, Date.now())
  }

  // ─── actions ──────────────────────────────────────────────────────────────

  /**
   * Load the four overview KPIs via parallel metric queries.
   *
   * Degradation: if ALL four queries fail → 'unavailable'.
   * If at least one succeeds → 'loaded' (partial data is valid to render).
   */
  async function loadOverview(): Promise<void> {
    overviewStatus.value = 'loading'
    overviewErrorKey.value = null

    const r = currentRange()
    const [qpsResult, p95Result, errorRateResult, sloBurnResult] = await Promise.allSettled([
      queryMetric(QUERIES.qps, r),
      queryMetric(QUERIES.p95, r),
      queryMetric(QUERIES.errorRate, r),
      queryMetric(QUERIES.sloBurn, r),
    ])

    const allFailed = [qpsResult, p95Result, errorRateResult, sloBurnResult].every(
      (s) => s.status === 'rejected',
    )

    if (allFailed) {
      // Pick the first rejection's i18n key as the representative error.
      const firstRejected = [qpsResult, p95Result, errorRateResult, sloBurnResult].find(
        (s): s is PromiseRejectedResult => s.status === 'rejected',
      )
      overviewErrorKey.value = firstRejected ? toI18nKey(firstRejected.reason) : null
      overviewStatus.value = 'unavailable'
      return
    }

    kpis.value = {
      qps: qpsResult.status === 'fulfilled' ? (qpsResult.value[0] ?? null) : null,
      p95: p95Result.status === 'fulfilled' ? (p95Result.value[0] ?? null) : null,
      errorRate: errorRateResult.status === 'fulfilled' ? (errorRateResult.value[0] ?? null) : null,
      sloBurn: sloBurnResult.status === 'fulfilled' ? (sloBurnResult.value[0] ?? null) : null,
    }
    overviewStatus.value = 'loaded'
  }

  /** Fetch log lines for the current LogQL query and time range. */
  async function loadLogs(): Promise<void> {
    logsStatus.value = 'loading'
    logsErrorKey.value = null
    try {
      const result = await queryLogs(logsQuery.value || '{cell=~".+"}', currentRange())
      logs.value = result
      logsStatus.value = 'loaded'
    } catch (err: unknown) {
      logsErrorKey.value = toI18nKey(err)
      logsStatus.value = 'unavailable'
    }
  }

  /** Fetch trace summaries for the current service filter. */
  async function loadTraces(): Promise<void> {
    tracesStatus.value = 'loading'
    tracesErrorKey.value = null
    try {
      const result = await searchTraces(tracesService.value || 'corebundle')
      traces.value = result
      tracesStatus.value = 'loaded'
    } catch (err: unknown) {
      tracesErrorKey.value = toI18nKey(err)
      tracesStatus.value = 'unavailable'
    }
  }

  /**
   * Update the active time range preset.
   * Does NOT auto-refetch — the view decides when to reload data.
   */
  function setRange(p: RangePreset): void {
    range.value = p
  }

  /** Update the LogQL query string (use instead of v-model on store state). */
  function setLogsQuery(v: string): void {
    logsQuery.value = v
  }

  /** Update the traces service filter (use instead of v-model on store state). */
  function setTracesService(v: string): void {
    tracesService.value = v
  }

  return {
    // query params
    range,
    logsQuery,
    tracesService,
    // overview
    overviewStatus,
    overviewErrorKey,
    kpis,
    // logs
    logsStatus,
    logsErrorKey,
    logs,
    // traces
    tracesStatus,
    tracesErrorKey,
    traces,
    // actions
    loadOverview,
    loadLogs,
    loadTraces,
    setRange,
    setLogsQuery,
    setTracesService,
  }
})
