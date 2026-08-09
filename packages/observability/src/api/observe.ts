/**
 * observe.ts — LGTM observability query API (BR-003).
 *
 * LGTM queries route through @gocell/request to BFF proxy paths
 * /api/v1/observability/* (BR-003 §3.4 方案 B). Dev direct-connect
 * (方案 A, bare fetch to localhost:3100/3200/9091) was rejected — it
 * violates the package-boundary no-fetch rule. Backend proxy not
 * implemented yet → calls 404 → callers degrade. Raw response types
 * match upstream Prometheus/Loki/Tempo HTTP APIs (not codegen-derived).
 *
 * Local types — no codegen schema exists for LGTM upstream APIs.
 * If/when a BFF response contract is added, delete raw upstream types
 * and import from @gocell/contracts instead.
 */
import { http } from '@gocell/request'

// ---------------------------------------------------------------------------
// URL constants
// ---------------------------------------------------------------------------

export const OBSERVE_METRICS_URL = '/api/v1/observability/prometheus/api/v1/query_range'
export const OBSERVE_LOGS_URL = '/api/v1/observability/loki/loki/api/v1/query_range'
export const OBSERVE_TRACES_URL = '/api/v1/observability/tempo/api/search'

// ---------------------------------------------------------------------------
// Shared input type
// ---------------------------------------------------------------------------

/** RFC3339 or unix-seconds strings (Prometheus/Loki accept both). */
export interface TimeRange {
  start: string
  end: string
}

// ---------------------------------------------------------------------------
// Normalized output types
// ---------------------------------------------------------------------------

export interface MetricSeries {
  metric: Record<string, string>
  points: { t: number; v: number }[]
}

export interface LogLine {
  tsNs: string
  line: string
  labels: Record<string, string>
}

export interface TraceSummary {
  traceId: string
  rootService: string
  rootName: string
  startUnixNano: string
  durationMs: number
  spanCount: number
}

// ---------------------------------------------------------------------------
// Raw upstream response types (Prometheus query_range)
// ---------------------------------------------------------------------------

interface PromRawResult {
  metric: Record<string, string>
  values: [number, string][]
}

interface PromRawResponse {
  status: 'success' | 'error'
  data?: {
    resultType?: string
    result?: unknown[]
  }
}

// ---------------------------------------------------------------------------
// Raw upstream response types (Loki query_range streams)
// ---------------------------------------------------------------------------

interface LokiStreamValue {
  stream?: Record<string, string>
  values?: [string, string][]
}

interface LokiRawResponse {
  status?: string
  data?: {
    resultType?: string
    result?: unknown[]
  }
}

// ---------------------------------------------------------------------------
// Raw upstream response types (Tempo search)
// ---------------------------------------------------------------------------

interface TempoRawTrace {
  traceID?: string
  rootServiceName?: string
  rootTraceName?: string
  startTimeUnixNano?: string
  durationMs?: number
  spanSet?: { matched?: number }
  spanSets?: { matched?: number }[]
}

interface TempoRawResponse {
  traces?: unknown[]
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isStringRecord(v: unknown): v is Record<string, string> {
  if (!isRecord(v)) return false
  return Object.values(v).every((x) => typeof x === 'string')
}

function isPromRawResult(v: unknown): v is PromRawResult {
  if (!isRecord(v)) return false
  if (!isStringRecord(v['metric'])) return false
  if (!Array.isArray(v['values'])) return false
  // Validate that values elements are [number|string, string] tuples
  const values = v['values'] as unknown[]
  if (values.length > 0) {
    const first = values[0]
    if (!Array.isArray(first) || first.length < 2) return false
    const t = first[0]
    // first element must be a number or a string that can be converted to a number
    if (typeof t !== 'number' && (typeof t !== 'string' || !Number.isFinite(Number(t))))
      return false
  }
  return true
}

function isLokiStreamValue(v: unknown): v is LokiStreamValue {
  if (!isRecord(v)) return false
  // values must be absent or an array
  if (v['values'] !== undefined && !Array.isArray(v['values'])) return false
  return true
}

function isTempoRawTrace(v: unknown): v is TempoRawTrace {
  if (!isRecord(v)) return false
  // Must have at least one of traceID or rootServiceName to be a valid trace
  return 'traceID' in v || 'rootServiceName' in v
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function normalizePromResult(raw: PromRawResult): MetricSeries {
  const points = raw.values.map(([t, v]) => {
    const tNum = typeof t === 'number' ? t : Number(t)
    const parsed = parseFloat(v)
    return { t: Number.isFinite(tNum) ? tNum : 0, v: isNaN(parsed) ? 0 : parsed }
  })
  return { metric: raw.metric, points }
}

function normalizeLokiStream(raw: LokiStreamValue): LogLine[] {
  const labels: Record<string, string> = isStringRecord(raw.stream) ? raw.stream : {}
  const values = Array.isArray(raw.values) ? raw.values : []
  return values.map(([tsNs, line]) => ({
    tsNs: typeof tsNs === 'string' ? tsNs : String(tsNs),
    line: typeof line === 'string' ? line : String(line),
    labels,
  }))
}

function normalizeTempoTrace(raw: TempoRawTrace): TraceSummary {
  // spanCount: prefer spanSets[0].matched, fall back to spanSet.matched, then 0
  let spanCount = 0
  const spanSets = raw.spanSets
  if (Array.isArray(spanSets) && spanSets.length > 0) {
    spanCount = spanSets[0]?.matched ?? 0
  } else if (isRecord(raw.spanSet)) {
    const matched = raw.spanSet['matched']
    spanCount = typeof matched === 'number' ? matched : 0
  }

  return {
    traceId: typeof raw.traceID === 'string' ? raw.traceID : '',
    rootService: typeof raw.rootServiceName === 'string' ? raw.rootServiceName : '',
    rootName: typeof raw.rootTraceName === 'string' ? raw.rootTraceName : '',
    startUnixNano: typeof raw.startTimeUnixNano === 'string' ? raw.startTimeUnixNano : '',
    durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : 0,
    spanCount,
  }
}

// ---------------------------------------------------------------------------
// Public API functions
// ---------------------------------------------------------------------------

/**
 * Query a Prometheus metric over a time range.
 * Normalizes the upstream query_range matrix response into MetricSeries[].
 */
export async function queryMetric(
  promql: string,
  range: TimeRange,
  step = '60s',
): Promise<MetricSeries[]> {
  const res = await http.get<PromRawResponse>(OBSERVE_METRICS_URL, {
    params: { query: promql, start: range.start, end: range.end, step },
  })
  const data = res.data
  if (data.status !== 'success') throw new Error('prom query failed')
  const raw = data.data?.result
  const result: unknown[] = Array.isArray(raw) ? raw : []
  return result.filter(isPromRawResult).map(normalizePromResult)
}

/**
 * Query Loki logs over a time range.
 * Normalizes the upstream query_range streams response into LogLine[].
 */
export async function queryLogs(logql: string, range: TimeRange, limit = 100): Promise<LogLine[]> {
  const res = await http.get<LokiRawResponse>(OBSERVE_LOGS_URL, {
    params: { query: logql, start: range.start, end: range.end, limit },
  })
  const data = res.data
  const raw = data.data?.result
  const result: unknown[] = Array.isArray(raw) ? raw : []
  return result.filter(isLokiStreamValue).flatMap(normalizeLokiStream)
}

/**
 * Search Tempo traces for a service.
 * Normalizes the upstream search response into TraceSummary[].
 */
export async function searchTraces(service: string, limit = 20): Promise<TraceSummary[]> {
  const res = await http.get<TempoRawResponse>(OBSERVE_TRACES_URL, {
    params: { tags: `service.name=${service}`, limit },
  })
  const data = res.data
  const traces: unknown[] = Array.isArray(data.traces) ? data.traces : []
  return traces.filter(isTempoRawTrace).map(normalizeTempoTrace)
}
