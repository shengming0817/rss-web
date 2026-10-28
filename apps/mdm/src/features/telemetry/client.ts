import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import { array, count, enumeration, nullable, uuid, positive } from '../../services/decode'
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
  source: (typeof sourceIds)[number]
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
      api.getApiV1DevicesByDeviceTelemetryConfigurations(
        transport,
        { pathParams: { device } },
        (value) => {
          const v = value
          if (v['device'] !== device) throw new Error('Wrong configuration device')
          return {
            device,
            evaluatedAtMicros: count(v['evaluatedAtMicros']),
            registration: nullable(v['registration'], (x) => {
              const r = x
              return { id: uuid(r['id']), generation: positive(r['generation']) }
            }),
            configurations: array(v['configurations'], (x) => {
              const c = x
              return {
                policyId: uuid(c['policyId']),
                policyVersionId: uuid(c['policyVersionId']),
                resource: exactResource(c['resource']),
                source: enumeration(c['source'], sourceIds),
                projection: c['projection'],
                sampleMillis: positive(c['sampleMillis']),
                normalSampleMillis: positive(c['normalSampleMillis']),
                boostExpiresAt: nullable(c['boostExpiresAt'], positive),
                uploadMillis: positive(c['uploadMillis']),
                supported: c['supported'],
              }
            }),
          }
        },
      ),
    resources: (device: string, field: string, after: string | null = null) =>
      api.postApiV1TelemetryResources(
        transport,
        { body: { device, field, after, limit: 64 } },
        (value) => {
          const v = value
          return {
            resources: array(v['resources'], telemetryId),
            nextAfter: opaque(v['nextAfter']),
            retired: v['retired'],
          }
        },
      ),
    history: (query: HistoryQuery) =>
      api.postApiV1TelemetryHistory(transport, { body: query }, (value) => {
        const v = value
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
          retired: v['retired'],
        }
      }),
    aggregate: (request: AggregateQuery) =>
      api.postApiV1TelemetryAggregate(transport, { body: request }, (value) => {
        const v = value
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
      }),
    health: (
      device: string,
      field: string,
      receivedFrom: number,
      receivedUntil: number,
      maxBatches = 64,
    ) =>
      api.postApiV1TelemetryHealth(
        transport,
        { body: { device, field, receivedFrom, receivedUntil, maxBatches } },
        health,
      ),
    gaps: (
      device: string,
      receivedFrom: number,
      receivedUntil: number,
      after: ReturnType<typeof gapCursor> = null,
    ) =>
      api.postApiV1TelemetryGapsQuery(
        transport,
        { body: { device, receivedFrom, receivedUntil, limit: 64, after } },
        (value) => gaps(value, device),
      ),
  }
}
