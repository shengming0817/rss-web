export { integerText, positiveText, numericText, fractionText } from './numbers'
export type { Numeric, IntegerKind } from './numbers'
import { integerText, positiveText } from './numbers'
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
export function windowRange(from: string, until: string): void {
  if (BigInt(integerText(until)) <= BigInt(integerText(from)))
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
  resolutionMicros: string,
  maxGapMicros: string | null,
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
    !positiveText(resolutionMicros) ||
    (maxGapMicros !== null && !positiveText(maxGapMicros))
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
          BigInt(sample.observedAt) < BigInt(query.startMicros) ||
          BigInt(sample.observedAt) >= BigInt(query.endMicros)
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
        !positiveText(request.definitionVersion) ||
        !positiveText(request.resolutionMicros) ||
        !['observedOnly', 'holdLast'].includes(request.coverage.coverage) ||
        (request.coverage.coverage === 'holdLast' &&
          !positiveText(request.coverage.maxHoldMicros)) ||
        (request.maxGapMicros !== null && !positiveText(request.maxGapMicros))
      )
        throw new Error('Invalid aggregation')
      const value = await port.aggregate(freeze(request))
      if (
        value.resolutionMicros !== request.resolutionMicros ||
        value.buckets.some(
          (b, i) =>
            BigInt(b.window.start) >= BigInt(b.window.end) ||
            BigInt(b.window.end) <= BigInt(request.query.startMicros) ||
            BigInt(b.window.start) >= BigInt(request.query.endMicros) ||
            BigInt(b.window.end) - BigInt(b.window.start) > BigInt(request.resolutionMicros) ||
            BigInt(b.coveredMicros) > BigInt(b.window.end) - BigInt(b.window.start) ||
            (i > 0 && BigInt(value.buckets[i - 1]!.window.end) > BigInt(b.window.start)),
        )
      )
        throw new Error('Wrong aggregate window')
      validateUnavailable(value.unavailable, request.query, tenant)
      return value
    },
    health(device: string, field: string, from: string, until: string) {
      windowRange(from, until)
      return port.health(identifier(device), identifier(field), from, until)
    },
    gaps(device: string, from: string, until: string, after: GapCursor = null) {
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
