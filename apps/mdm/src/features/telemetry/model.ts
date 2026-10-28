type SampleWire = wireSchemas.postApiV1TelemetryHistoryResponse.HistoryRow['sample']
type DefinitionWire = SampleWire['series']['definition']
type MetricWire = DefinitionWire['metric']
type BucketWire = wireSchemas.postApiV1TelemetryAggregateResponse.Root['buckets'][number]
type IntervalWire = BucketWire['window']
type AggregateWire = BucketWire['value']
type NumericWire = Extract<AggregateWire, { Number: unknown }>['Number']
type SumWire = Extract<AggregateWire, { Sum: unknown }>['Sum']
type StateValueWire = Extract<
  AggregateWire,
  { StateSegments: unknown }
>['StateSegments'][number]['value']
import * as wireSchemas from '@rss/api/mdm-schemas'
import {
  array,
  count,
  enumeration,
  string,
  integer,
  nullable,
  uuid,
  finite,
  positive,
} from '../../services/decode'
import { sourceIds } from '../devices/clients/asset-model'
export function telemetryId(value: unknown) {
  const s = string(value)
  if (!s || new TextEncoder().encode(s).byteLength > 256 || /\p{Cc}/u.test(s))
    throw new Error('Invalid telemetry identity')
  return s
}
export const aggregationNames = [
  'min',
  'max',
  'sum',
  'count',
  'mean',
  'increase',
  'rate',
  'timeline',
  'transitions',
  'coverage',
] as const
export function interval(value: IntervalWire) {
  const v = value,
    start = count(v['start']),
    end = count(v['end'])
  if (end < start) throw new Error('Invalid window')
  return { start, end }
}
function scope(value: SampleWire['stream']['scope'], tenant: string) {
  const v = value
  if (uuid(v['tenant']) !== tenant || v['namespace'] !== 'mdm.telemetry')
    throw new Error('Wrong telemetry tenant')
  return { tenant, namespace: 'mdm.telemetry' }
}
function metric(value: MetricWire) {
  return value
}
function definition(value: DefinitionWire, tenant: string) {
  const v = value
  const d = v['dimensions']
  return {
    scope: scope(v['scope'], tenant),
    key: telemetryId(v['key']),
    version: positive(v['version']),
    unit: telemetryId(v['unit']),
    metric: metric(v['metric']),
    dimensions: {
      allowed: array(d['allowed'], telemetryId),
      required: array(d['required'], telemetryId),
      maxCount: count(d['maxCount']),
      maxValueBytes: count(d['maxValueBytes']),
      maxTotalBytes: count(d['maxTotalBytes']),
    },
  }
}
export function numeric(value: NumericWire): number {
  const v = value,
    kind = v['type']
  return kind === 'f64'
    ? finite(v['value'])
    : kind === 'u64'
      ? count(v['value'])
      : integer(v['value'])
}
export type Reading =
  | { quality: 'missing' | 'failed' }
  | { quality: 'valid'; value: number | boolean | string }
function reading(value: SampleWire['reading'], expected: ReturnType<typeof metric>): Reading {
  const quality = value['quality']
  if (quality !== 'valid') {
    return { quality }
  }
  const v = value,
    item = v['value']
  const type = item['type']
  const result =
    type === 'number'
      ? numeric(item['value'])
      : type === 'bool'
        ? item['value']
        : telemetryId(item['value'])
  if (
    expected.kind === 'bool'
      ? type !== 'bool'
      : expected.kind === 'state'
        ? type !== 'state' || !expected.members.includes(String(result))
        : type !== 'number' ||
          item['value']['type'] !== expected.number ||
          (expected.kind === 'counter' && Number(result) < 0)
  )
    throw new Error('Reading disagrees with definition')
  return { quality, value: result }
}
export function observation(value: unknown, tenant: string, mode: 'history' | 'latest') {
  if (mode === 'history') {
    if (!wireSchemas.postApiV1TelemetryHistoryResponse.validateHistoryRow(value))
      throw new Error('Invalid observation')
  } else if (!wireSchemas.postApiV1TelemetryHistoryResponse.validateLatestRow(value))
    throw new Error('Invalid observation')

  const v = value
  const s = v['sample']
  const stream = s['stream'],
    series = s['series']
  const source = telemetryId(stream['source']),
    colon = source.indexOf(':')
  const registration = uuid(source.slice(0, colon)),
    origin = enumeration(source.slice(colon + 1), sourceIds)
  const snapshot = definition(series['definition'], tenant)
  return {
    sample: {
      id: telemetryId(s['id']),
      sequence: count(s['sequence']),
      observedAt: count(s['observedAt']),
      interval: nullable(s['interval'], interval),
      reading: reading(s['reading'], snapshot.metric),
      stream: {
        scope: scope(stream['scope'], tenant),
        source,
        generation: uuid(stream['generation']),
      },
      series: {
        definition: snapshot,
        subject: telemetryId(series['subject']),
        resource: telemetryId(series['resource']),
        dimensions: Object.fromEntries(
          Object.entries(series['dimensions']).map(([k, v]) => [telemetryId(k), telemetryId(v)]),
        ),
      },
    },
    registration,
    source: origin,
    epoch: uuid(stream['generation']),
    receivedAt: count(v['receivedAt']),
    liveSource: 'liveSource' in v ? v.liveSource : v.effectiveSource,
    sourceConflict: 'sourceConflict' in v ? v.sourceConflict : false,
  }
}
export type Observation = ReturnType<typeof observation>
export function unavailable(value: unknown) {
  return array(value, (x) => {
    if (!wireSchemas.postApiV1TelemetryHistoryResponse.validateUnavailable(x))
      throw new Error('Invalid unavailable interval')
    return { selection: x.selection, window: interval(x.window), reason: x.reason }
  })
}
function sum(value: SumWire) {
  return 'F64' in value
    ? finite(value.F64)
    : 'U128' in value
      ? count(value.U128)
      : integer(value.I128)
}
function stateValue(value: StateValueWire): boolean | string {
  return 'Bool' in value ? value.Bool : telemetryId(value.State)
}
export type Aggregate =
  | { kind: 'number'; value: number }
  | { kind: 'missing' }
  | {
      kind: 'timeline'
      segments: { value: boolean | string; window: ReturnType<typeof interval> }[]
    }
  | {
      kind: 'transitions'
      transitions: { at: number; from: boolean | string; to: boolean | string }[]
    }
  | { kind: 'coverage'; durations: { value: boolean | string; micros: number }[] }
function aggregateValue(value: AggregateWire): Aggregate {
  if (value === 'Missing') return { kind: 'missing' }
  if ('Number' in value) return { kind: 'number', value: numeric(value.Number) }
  if ('Sum' in value) return { kind: 'number', value: sum(value.Sum) }
  if ('Count' in value) return { kind: 'number', value: count(value.Count) }
  if ('Mean' in value)
    return { kind: 'number', value: sum(value.Mean.sum) / positive(value.Mean.count) }
  if ('Rate' in value)
    return {
      kind: 'number',
      value: sum(value.Rate.increase) / (positive(value.Rate.duration_micros) / 1_000_000),
    }
  if ('StateSegments' in value)
    return {
      kind: 'timeline',
      segments: value.StateSegments.map((x) => ({
        value: stateValue(x.value),
        window: interval(x.window),
      })),
    }
  if ('Transitions' in value)
    return {
      kind: 'transitions',
      transitions: value.Transitions.map((x) => ({
        at: count(x.at),
        from: stateValue(x.from),
        to: stateValue(x.to),
      })),
    }
  return {
    kind: 'coverage',
    durations: value.StateCoverage.map((x) => ({
      value: stateValue(x.value),
      micros: count(x.micros),
    })),
  }
}
export function bucket(value: BucketWire) {
  const v = value
  const window = interval(v['window']),
    coveredMicros = count(v['covered_micros'])
  if (coveredMicros > window.end - window.start) throw new Error('Invalid coverage')
  return {
    window,
    value: aggregateValue(v['value']),
    validSamples: count(v['valid_samples']),
    coveredMicros,
    completeness: array(v['completeness'], (x) => x),
  }
}
export type Bucket = ReturnType<typeof bucket>
export function opaque(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || !value || value.length > 16384 || /\p{Cc}/u.test(value))
    throw new Error('Invalid continuation')
  return value
}
export function health(value: unknown) {
  if (!wireSchemas.postApiV1TelemetryHealthResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  const order = array(v['qualityOrder'], (x) => x)
  if (order.join() !== 'valid,missing,failed') throw new Error('Unknown quality counts')
  return {
    batches: array(v['batches'], (x) => {
      const b = x
      const counts = array(b['qualityCounts'], count)
      if (counts.length !== 3) throw new Error('Invalid quality counts')
      return {
        batchId: uuid(b['batchId']),
        receivedAt: count(b['receivedAt']),
        firstObserved: count(b['firstObserved']),
        lastObserved: count(b['lastObserved']),
        delivery: b['delivery'],
        qualityCounts: counts,
      }
    }),
    batchesTruncated: v['batchesTruncated'],
    retentionTruncated: v['retentionTruncated'],
    retired: v['retired'],
    retention: array(v['retention'], (x) => {
      const r = x
      return {
        resource: telemetryId(r['resource']),
        definitionVersion: positive(r['definitionVersion']),
        dueAt: count(r['dueAt']),
        phase: count(r['phase']),
        progress: r['progress'] === null ? null : r['progress'],
      }
    }),
  }
}
export function gapCursor(value: unknown) {
  if (value === null) return null
  if (!wireSchemas.postApiV1TelemetryGapsQueryResponse.validateCursor(value))
    throw new Error('Invalid cursor')
  return value
}
export function gaps(value: unknown, device: string) {
  if (!wireSchemas.postApiV1TelemetryGapsQueryResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    next: gapCursor(v['next']),
    reports: array(v['reports'], (x) => {
      const r = x,
        report = r['report']
      return {
        device,
        receivedAt: count(r['receivedAt']),
        reportId: uuid(report['reportId']),
        registrationId: uuid(report['registrationId']),
        generation: positive(report['generation']),
        createdAt: count(report['createdAt']),
        gaps: array(report['gaps'], (x) => {
          const g = x
          return {
            reason: g['reason'],
            count: positive(g['count']),
            first: count(g['first']),
            last: count(g['last']),
          }
        }),
      }
    }),
  }
}
