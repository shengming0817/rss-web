export type * from './model'
export { operations, sources } from './model'
import { operations, sources } from './model'
import type {
  AggregateQuery,
  HistoryQuery,
  Observation,
  TelemetryPort,
  GapCursor,
  Unavailable,
} from './model'
import { freeze, identifier, uuid } from '@rss/mdm-inventory'
export function seriesKey(row: Observation): string {
  return JSON.stringify([
    row.sample.series.definition.scope,
    row.sample.series.subject,
    row.sample.series.resource,
    row.sample.series.definition.key,
    row.sample.series.definition.version,
    row.device,
    row.source,
    row.epoch,
    Object.entries(row.sample.series.dimensions).sort(([a], [b]) => a.localeCompare(b)),
  ])
}
export function windowRange(from: number, until: number): void {
  if (![from, until].every((n) => Number.isSafeInteger(n) && n >= 0) || until <= from)
    throw new Error('Invalid telemetry window')
}
export function validateHistory(query: HistoryQuery): void {
  if (
    query.after !== null &&
    (typeof query.after !== 'string' ||
      !query.after ||
      query.after.length > 16384 ||
      /\p{Cc}/u.test(query.after))
  )
    throw new Error('Invalid telemetry cursor')
  identifier(query.device)
  identifier(query.field)
  identifier(query.resource)
  windowRange(query.startMicros, query.endMicros)
  if (
    !Number.isSafeInteger(query.maxPoints) ||
    query.maxPoints < 1 ||
    query.maxPoints > 10000 ||
    !['history', 'latest'].includes(query.mode) ||
    (query.mode === 'latest' && query.after !== null)
  )
    throw new Error('Invalid telemetry query')
}
/** Exact series are chosen from observations, never reconstructed from the current field catalog. */
export function aggregateSelection(
  query: HistoryQuery,
  row: Observation,
  operation: AggregateQuery['operation'],
  resolutionMicros: number,
  maxGapMicros: number | null,
  coverage: AggregateQuery['coverage'] = { coverage: 'observedOnly' },
): AggregateQuery {
  if (
    row.sample.series.subject !== query.device ||
    row.sample.series.resource !== query.resource ||
    row.sample.series.definition.key !== query.field
  )
    throw new Error('Wrong series selection')
  if (
    !operations.includes(operation) ||
    !Number.isSafeInteger(resolutionMicros) ||
    resolutionMicros < 1 ||
    (maxGapMicros !== null && (!Number.isSafeInteger(maxGapMicros) || maxGapMicros < 1))
  )
    throw new Error('Invalid aggregate selection')
  const metric = row.sample.series.definition.metric
  if (
    (coverage.coverage === 'holdLast' && !['state', 'bool'].includes(metric.kind)) ||
    (operation === 'coverage' && coverage.coverage === 'observedOnly')
  )
    throw new Error('Invalid state coverage policy')
  if (row.sample.series.definition.metric.kind === 'counter' && maxGapMicros === null)
    throw new Error('Counter gap required')
  return {
    query: { ...query, mode: 'history', after: null },
    definitionVersion: row.sample.series.definition.version,
    source: row.source,
    epoch: row.epoch,
    dimensions: row.sample.series.dimensions,
    operation,
    resolutionMicros,
    maxGapMicros: row.sample.series.definition.metric.kind === 'counter' ? maxGapMicros : null,
    coverage,
  }
}
/** Authorization, latest source selection, aggregation and scheduling stay on the server. */
export function createTelemetry(port: TelemetryPort, tenant: string) {
  uuid(tenant)
  return Object.freeze({
    async configurations(device: string) {
      const result = await port.configurations(identifier(device))
      if (result.device !== device) throw new Error('Wrong configuration device')
      return result
    },
    resources: (device: string, field: string, after: string | null = null) =>
      port.resources(identifier(device), identifier(field), after),
    async history(query: HistoryQuery) {
      validateHistory(query)
      const result = await port.history(freeze(query))
      if (query.mode === 'latest' && result.next !== null) throw new Error('Latest cannot continue')
      for (const row of result.rows) {
        const sample = row.sample
        if (
          sample.stream.scope.tenant !== tenant ||
          sample.series.definition.scope.tenant !== tenant ||
          sample.stream.scope.namespace !== 'mdm.telemetry' ||
          sample.series.definition.scope.namespace !== 'mdm.telemetry' ||
          sample.series.subject !== query.device ||
          sample.series.resource !== query.resource ||
          sample.series.definition.key !== query.field ||
          sample.observedAt < query.startMicros ||
          sample.observedAt >= query.endMicros
        )
          throw new Error('Wrong telemetry coordinates')
      }
      validateUnavailable(result.unavailable, query, tenant)
      return result
    },
    async aggregate(request: AggregateQuery) {
      validateHistory(request.query)
      uuid(request.epoch)
      if (
        !sources.includes(request.source) ||
        !operations.includes(request.operation) ||
        request.query.mode !== 'history' ||
        !Number.isSafeInteger(request.definitionVersion) ||
        request.definitionVersion < 1 ||
        !Number.isSafeInteger(request.resolutionMicros) ||
        request.resolutionMicros < 1 ||
        !['observedOnly', 'holdLast'].includes(request.coverage.coverage) ||
        (request.coverage.coverage === 'holdLast' &&
          (!Number.isSafeInteger(request.coverage.maxHoldMicros) ||
            request.coverage.maxHoldMicros < 1)) ||
        (request.maxGapMicros !== null &&
          (!Number.isSafeInteger(request.maxGapMicros) || request.maxGapMicros < 1))
      )
        throw new Error('Invalid aggregation')
      const value = await port.aggregate(freeze(request))
      if (
        value.resolutionMicros !== request.resolutionMicros ||
        value.buckets.some(
          (b, i) =>
            b.window.start >= b.window.end ||
            b.window.end <= request.query.startMicros ||
            b.window.start >= request.query.endMicros ||
            b.window.end - b.window.start > request.resolutionMicros ||
            b.coveredMicros > b.window.end - b.window.start ||
            (i > 0 && value.buckets[i - 1]!.window.end > b.window.start),
        )
      )
        throw new Error('Wrong aggregate window')
      validateUnavailable(value.unavailable, request.query, tenant)
      return value
    },
    health(device: string, field: string, from: number, until: number) {
      windowRange(from, until)
      return port.health(identifier(device), identifier(field), from, until)
    },
    gaps(device: string, from: number, until: number, after: GapCursor = null) {
      windowRange(from, until)
      return port.gaps(identifier(device), from, until, after)
    },
  })
}

function validateUnavailable(
  items: readonly Unavailable[],
  query: HistoryQuery,
  tenant: string,
): void {
  for (const item of items) {
    const s = item.selection,
      scope = s.selection === 'exact' ? s.series.definition.scope : s.scope
    const device = s.selection === 'exact' ? s.series.subject : s.subject,
      resource = s.selection === 'exact' ? s.series.resource : s.resource
    if (
      scope.tenant !== tenant ||
      scope.namespace !== 'mdm.telemetry' ||
      device !== query.device ||
      resource !== query.resource ||
      (s.selection === 'exact'
        ? s.series.definition.key !== query.field
        : !s.keys.includes(query.field))
    )
      throw new Error('Wrong unavailable selection')
  }
}
