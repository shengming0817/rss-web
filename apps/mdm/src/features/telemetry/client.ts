import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  nullable,
  uuid,
  positive,
} from '../../services/decode'
import { exactResource } from '../policies/clients/model'
import { sourceIds } from '../devices/clients/asset-model'
import {
  telemetryId,
  bucket,
  gaps,
  type gapCursor,
  health,
  observation,
  opaque,
  unavailable,
  type Observation,
} from './model'
export interface HistoryQuery {
  device: string
  field: string
  resource: string
  startMicros: number
  endMicros: number
  maxPoints: number
  mode: 'history' | 'latest'
  after: string | null
}
export interface AggregateQuery {
  query: HistoryQuery
  definitionVersion: number
  registration: string
  source: string
  epoch: string
  dimensions: Record<string, string>
  resolutionMicros: number
  operation:
    | 'min'
    | 'max'
    | 'sum'
    | 'count'
    | 'mean'
    | 'increase'
    | 'rate'
    | 'timeline'
    | 'transitions'
    | 'coverage'
  coverage: { coverage: 'observedOnly' }
  maxGapMicros: number | null
}
export function seriesKey(row: Observation) {
  const s = row.sample
  return JSON.stringify([
    s.series.definition.version,
    row.registration,
    row.source,
    row.epoch,
    Object.entries(s.series.dimensions).sort(([a], [b]) => a.localeCompare(b)),
  ])
}
export function createTelemetryClient(transport: HttpTransport, tenant: string) {
  return {
    configurations: (device: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/devices/{device}/telemetry-configurations',
        pathParams: { device },
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['device', 'registration', 'evaluatedAtMicros', 'configurations'])
          if (v['device'] !== device) throw new Error('Wrong configuration device')
          return {
            device,
            evaluatedAtMicros: count(v['evaluatedAtMicros']),
            registration: nullable(v['registration'], (x) => {
              const r = closed(x, ['id', 'generation'])
              return { id: uuid(r['id']), generation: positive(r['generation']) }
            }),
            configurations: array(v['configurations'], (x) => {
              const c = closed(x, [
                'policyId',
                'policyVersionId',
                'resource',
                'source',
                'projection',
                'sampleMillis',
                'normalSampleMillis',
                'boostExpiresAt',
                'uploadMillis',
                'supported',
              ])
              return {
                policyId: uuid(c['policyId']),
                policyVersionId: uuid(c['policyVersionId']),
                resource: exactResource(c['resource']),
                source: enumeration(c['source'], sourceIds),
                projection: enumeration(c['projection'], ['current', 'history', 'both'] as const),
                sampleMillis: positive(c['sampleMillis']),
                normalSampleMillis: positive(c['normalSampleMillis']),
                boostExpiresAt: nullable(c['boostExpiresAt'], positive),
                uploadMillis: positive(c['uploadMillis']),
                supported: boolean(c['supported']),
              }
            }),
          }
        },
      }),
    resources: (device: string, field: string, after: string | null = null) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/telemetry/resources',
        body: { device, field, after, limit: 64 },
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['resources', 'nextAfter', 'retired'])
          return {
            resources: array(v['resources'], telemetryId),
            nextAfter: opaque(v['nextAfter']),
            retired: boolean(v['retired']),
          }
        },
      }),
    history: (query: HistoryQuery) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/telemetry/history',
        body: query,
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['rows', 'unavailable', 'next', 'retired', 'mode'])
          if (v['mode'] !== query.mode) throw new Error('Wrong history mode')
          const rows = array(v['rows'], (x) => observation(x, tenant, query.mode))
          for (const row of rows) {
            const s = row.sample
            if (
              s.series.subject !== query.device ||
              s.series.resource !== query.resource ||
              s.series.definition.key !== query.field ||
              s.observedAt < query.startMicros ||
              s.observedAt >= query.endMicros
            )
              throw new Error('Wrong telemetry selection')
          }
          const next = opaque(v['next'])
          if (query.mode === 'latest' && next !== null) throw new Error('Latest cannot continue')
          return {
            rows,
            unavailable: unavailable(v['unavailable']),
            next,
            retired: boolean(v['retired']),
          }
        },
      }),
    aggregate: (request: AggregateQuery) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/telemetry/aggregate',
        body: request,
        successStatus: 200,
        decode(value) {
          const v = closed(value, [
            'buckets',
            'unavailable',
            'resolutionMicros',
            'refreshedThrough',
            'next',
          ])
          const buckets = array(v['buckets'], bucket)
          if (
            v['resolutionMicros'] !== request.resolutionMicros ||
            buckets.some(
              (b, i) =>
                b.window.end <= request.query.startMicros ||
                b.window.start >= request.query.endMicros ||
                b.window.end - b.window.start > request.resolutionMicros ||
                (i > 0 && buckets[i - 1]!.window.end > b.window.start),
            )
          )
            throw new Error('Wrong aggregate window')
          return {
            buckets,
            unavailable: unavailable(v['unavailable']),
            resolutionMicros: positive(v['resolutionMicros']),
            refreshedThrough: nullable(v['refreshedThrough'], count),
            next: opaque(v['next']),
          }
        },
      }),
    health: (
      device: string,
      field: string,
      receivedFrom: number,
      receivedUntil: number,
      maxBatches = 64,
    ) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/telemetry/health',
        body: { device, field, receivedFrom, receivedUntil, maxBatches },
        successStatus: 200,
        decode: health,
      }),
    gaps: (
      device: string,
      receivedFrom: number,
      receivedUntil: number,
      after: ReturnType<typeof gapCursor> = null,
    ) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/telemetry/gaps/query',
        body: { device, receivedFrom, receivedUntil, limit: 64, after },
        successStatus: 200,
        decode: (value) => gaps(value, device),
      }),
  }
}
