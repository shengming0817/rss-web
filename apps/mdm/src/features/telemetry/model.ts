import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  string,
  integer,
  nullable,
  record,
  uuid,
} from '../../services/decode'
import { finite, positive } from '../policies/clients/collection-mapping'
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
export function interval(value: unknown) {
  const v = closed(value, ['start', 'end']),
    start = count(v['start']),
    end = count(v['end'])
  if (end < start) throw new Error('Invalid window')
  return { start, end }
}
function scope(value: unknown, tenant: string) {
  const v = closed(value, ['tenant', 'namespace'])
  if (uuid(v['tenant']) !== tenant || v['namespace'] !== 'mdm.telemetry')
    throw new Error('Wrong telemetry tenant')
  return { tenant, namespace: 'mdm.telemetry' }
}
function metric(value: unknown) {
  const kind = enumeration(record(value)['kind'], ['gauge', 'counter', 'bool', 'state'] as const)
  if (kind === 'bool') {
    closed(value, ['kind'])
    return { kind }
  }
  if (kind === 'state') {
    const v = closed(value, ['kind', 'members'])
    return { kind, members: array(v['members'], telemetryId) }
  }
  const v = closed(value, kind === 'gauge' ? ['kind', 'number'] : ['kind', 'number', 'temporality'])
  const number = enumeration(v['number'], ['i64', 'u64', 'f64'] as const)
  return kind === 'gauge'
    ? { kind, number }
    : { kind, number, temporality: enumeration(v['temporality'], ['cumulative', 'delta'] as const) }
}
function definition(value: unknown, tenant: string) {
  const v = closed(value, ['scope', 'key', 'version', 'unit', 'metric', 'dimensions'])
  const d = closed(v['dimensions'], [
    'allowed',
    'required',
    'maxCount',
    'maxValueBytes',
    'maxTotalBytes',
  ])
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
export function numeric(value: unknown): number {
  const v = closed(value, ['type', 'value']),
    kind = enumeration(v['type'], ['i64', 'u64', 'f64'] as const)
  return kind === 'f64'
    ? finite(v['value'])
    : kind === 'u64'
      ? count(v['value'])
      : integer(v['value'])
}
export type Reading =
  | { quality: 'missing' | 'failed' }
  | { quality: 'valid'; value: number | boolean | string }
function reading(value: unknown, expected: ReturnType<typeof metric>): Reading {
  const quality = enumeration(record(value)['quality'], ['valid', 'missing', 'failed'] as const)
  if (quality !== 'valid') {
    closed(value, ['quality'])
    return { quality }
  }
  const v = closed(value, ['quality', 'value']),
    item = closed(v['value'], ['type', 'value'])
  const type = enumeration(item['type'], ['number', 'bool', 'state'] as const)
  const result =
    type === 'number'
      ? numeric(item['value'])
      : type === 'bool'
        ? boolean(item['value'])
        : telemetryId(item['value'])
  if (
    expected.kind === 'bool'
      ? type !== 'bool'
      : expected.kind === 'state'
        ? type !== 'state' || !expected.members.includes(String(result))
        : type !== 'number' ||
          record(item['value'])['type'] !== expected.number ||
          (expected.kind === 'counter' && Number(result) < 0)
  )
    throw new Error('Reading disagrees with definition')
  return { quality, value: result }
}
export function observation(value: unknown, tenant: string, mode: 'history' | 'latest') {
  const v = closed(value, [
    'sample',
    'receivedAt',
    ...(mode === 'history' ? ['liveSource'] : ['effectiveSource', 'sourceConflict']),
  ])
  const s = closed(v['sample'], [
    'stream',
    'series',
    'id',
    'sequence',
    'observedAt',
    'interval',
    'reading',
  ])
  const stream = closed(s['stream'], ['scope', 'source', 'generation']),
    series = closed(s['series'], ['definition', 'subject', 'resource', 'dimensions'])
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
          Object.entries(record(series['dimensions'])).map(([k, v]) => [
            telemetryId(k),
            telemetryId(v),
          ]),
        ),
      },
    },
    registration,
    source: origin,
    epoch: uuid(stream['generation']),
    receivedAt: count(v['receivedAt']),
    liveSource: mode === 'history' ? boolean(v['liveSource']) : boolean(v['effectiveSource']),
    sourceConflict: mode === 'latest' ? boolean(v['sourceConflict']) : false,
  }
}
export type Observation = ReturnType<typeof observation>
export function unavailable(value: unknown) {
  return array(value, (x) => {
    const v = closed(x, ['selection', 'window', 'reason'])
    return {
      selection: record(v['selection']),
      window: interval(v['window']),
      reason: enumeration(v['reason'], ['deleted', 'pruned'] as const),
    }
  })
}
function sum(value: unknown) {
  const v = record(value),
    keys = Object.keys(v)
  if (keys.length !== 1) throw new Error('Invalid sum')
  const key = enumeration(keys[0], ['I128', 'U128', 'F64'] as const)
  return key === 'F64' ? finite(v[key]) : key === 'U128' ? count(v[key]) : integer(v[key])
}
function stateValue(value: unknown): boolean | string {
  const v = record(value),
    keys = Object.keys(v)
  if (keys.length !== 1) throw new Error('Invalid state')
  const key = enumeration(keys[0], ['Bool', 'State'] as const)
  return key === 'Bool' ? boolean(v[key]) : telemetryId(v[key])
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
function aggregateValue(value: unknown): Aggregate {
  if (value === 'Missing') return { kind: 'missing' }
  const v = record(value),
    keys = Object.keys(v)
  if (keys.length !== 1) throw new Error('Invalid aggregate')
  const kind = enumeration(keys[0], [
    'Number',
    'Sum',
    'Count',
    'Mean',
    'Rate',
    'StateSegments',
    'Transitions',
    'StateCoverage',
  ] as const)
  const inner = v[kind]
  if (kind === 'Number') return { kind: 'number', value: numeric(inner) }
  if (kind === 'Sum') return { kind: 'number', value: sum(inner) }
  if (kind === 'Count') return { kind: 'number', value: count(inner) }
  if (kind === 'Mean') {
    const m = closed(inner, ['sum', 'count'])
    return { kind: 'number', value: sum(m['sum']) / positive(m['count']) }
  }
  if (kind === 'Rate') {
    const r = closed(inner, ['increase', 'duration_micros'])
    return {
      kind: 'number',
      value: sum(r['increase']) / (positive(r['duration_micros']) / 1_000_000),
    }
  }
  if (kind === 'StateSegments')
    return {
      kind: 'timeline',
      segments: array(inner, (x) => {
        const s = closed(x, ['value', 'window'])
        return { value: stateValue(s['value']), window: interval(s['window']) }
      }),
    }
  if (kind === 'Transitions')
    return {
      kind: 'transitions',
      transitions: array(inner, (x) => {
        const s = closed(x, ['at', 'from', 'to'])
        return { at: count(s['at']), from: stateValue(s['from']), to: stateValue(s['to']) }
      }),
    }
  return {
    kind: 'coverage',
    durations: array(inner, (x) => {
      const s = closed(x, ['value', 'micros'])
      return { value: stateValue(s['value']), micros: count(s['micros']) }
    }),
  }
}
export function bucket(value: unknown) {
  const v = closed(value, ['window', 'value', 'valid_samples', 'covered_micros', 'completeness'])
  const window = interval(v['window']),
    coveredMicros = count(v['covered_micros'])
  if (coveredMicros > window.end - window.start) throw new Error('Invalid coverage')
  return {
    window,
    value: aggregateValue(v['value']),
    validSamples: count(v['valid_samples']),
    coveredMicros,
    completeness: array(v['completeness'], (x) =>
      enumeration(x, ['Gaps', 'Overlap', 'ResetBoundary', 'Boundary'] as const),
    ),
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
  const v = closed(value, [
    'batches',
    'batchesTruncated',
    'retention',
    'retentionTruncated',
    'qualityOrder',
    'retired',
  ])
  const order = array(v['qualityOrder'], (x) =>
    enumeration(x, ['valid', 'missing', 'failed'] as const),
  )
  if (order.join() !== 'valid,missing,failed') throw new Error('Unknown quality counts')
  return {
    batches: array(v['batches'], (x) => {
      const b = closed(x, [
        'batchId',
        'receivedAt',
        'firstObserved',
        'lastObserved',
        'delivery',
        'qualityCounts',
      ])
      const counts = array(b['qualityCounts'], count)
      if (counts.length !== 3) throw new Error('Invalid quality counts')
      return {
        batchId: uuid(b['batchId']),
        receivedAt: count(b['receivedAt']),
        firstObserved: count(b['firstObserved']),
        lastObserved: count(b['lastObserved']),
        delivery: enumeration(b['delivery'], [
          'pending',
          'published',
          'unknown',
          'blocked',
        ] as const),
        qualityCounts: counts,
      }
    }),
    batchesTruncated: boolean(v['batchesTruncated']),
    retentionTruncated: boolean(v['retentionTruncated']),
    retired: boolean(v['retired']),
    retention: array(v['retention'], (x) => {
      const r = closed(x, ['resource', 'definitionVersion', 'dueAt', 'phase', 'progress'])
      return {
        resource: telemetryId(r['resource']),
        definitionVersion: positive(r['definitionVersion']),
        dueAt: count(r['dueAt']),
        phase: count(r['phase']),
        progress: r['progress'] === null ? null : record(r['progress']),
      }
    }),
  }
}
export function gapCursor(value: unknown) {
  if (value === null) return null
  const v = closed(value, ['receivedAt', 'reportId'])
  return { receivedAt: count(v['receivedAt']), reportId: uuid(v['reportId']) }
}
export function gaps(value: unknown, device: string) {
  const v = closed(value, ['reports', 'next'])
  return {
    next: gapCursor(v['next']),
    reports: array(v['reports'], (x) => {
      const r = closed(x, ['report', 'receivedAt']),
        report = closed(r['report'], [
          'reportId',
          'registrationId',
          'generation',
          'createdAt',
          'gaps',
        ])
      return {
        device,
        receivedAt: count(r['receivedAt']),
        reportId: uuid(report['reportId']),
        registrationId: uuid(report['registrationId']),
        generation: positive(report['generation']),
        createdAt: count(report['createdAt']),
        gaps: array(report['gaps'], (x) => {
          const g = closed(x, ['reason', 'count', 'first', 'last'])
          return {
            reason: enumeration(g['reason'], [
              'expired',
              'capacity',
              'lease',
              'power',
              'suspended',
              'clock',
              'collection',
              'rejected',
              'registration',
              'configuration',
            ] as const),
            count: positive(g['count']),
            first: count(g['first']),
            last: count(g['last']),
          }
        }),
      }
    }),
  }
}
