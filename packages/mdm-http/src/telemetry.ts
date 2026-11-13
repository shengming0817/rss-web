import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  count,
  enumeration,
  nullable,
  uuid,
  positive,
  exactResource,
  decimal,
  wirePositive,
  wireCount,
  wireNumber,
} from './telemetry-scalars'
import type { TelemetryPort } from '@rss/mdm-telemetry'
import { sources as sourceIds } from '@rss/mdm-telemetry'
import {
  telemetryId,
  bucket,
  gaps,
  type gapCursor,
  health,
  observation,
  opaque,
  unavailable,
} from './telemetry-values'
export function createTelemetryAdapter(transport: HttpTransport, tenant: string): TelemetryPort {
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
    history: (query: Parameters<TelemetryPort['history']>[0]) =>
      api.postApiV1TelemetryHistory(
        transport,
        {
          body: {
            ...query,
            startMicros: decimal(query.startMicros),
            endMicros: decimal(query.endMicros),
          },
        },
        (value) => {
          const v = value
          if (v['mode'] !== query.mode) throw new Error('Wrong history mode')
          const rows = array(v['rows'], (x) => observation(x, tenant, query.mode))
          for (const row of rows) {
            const s = row.sample
            if (
              s.series.subject !== query.device ||
              s.series.resource !== query.resource ||
              s.series.definition.key !== query.field ||
              BigInt(s.observedAt) < BigInt(query.startMicros) ||
              BigInt(s.observedAt) >= BigInt(query.endMicros)
            )
              throw new Error('Wrong telemetry selection')
          }
          const next = opaque(v['next'])
          if (query.mode === 'latest' && next !== null) throw new Error('Latest cannot continue')
          return {
            rows,
            unavailable: unavailable(v['unavailable'], tenant),
            next,
            retired: v['retired'],
          }
        },
      ),
    aggregate: (request: Parameters<TelemetryPort['aggregate']>[0]) =>
      api.postApiV1TelemetryAggregate(
        transport,
        {
          body: {
            ...request,
            query: {
              ...request.query,
              startMicros: decimal(request.query.startMicros),
              endMicros: decimal(request.query.endMicros),
            },
            definitionVersion: decimal(request.definitionVersion),
            resolutionMicros: decimal(request.resolutionMicros),
            maxGapMicros: request.maxGapMicros === null ? null : decimal(request.maxGapMicros),
            coverage:
              request.coverage.coverage === 'holdLast'
                ? { coverage: 'holdLast', maxHoldMicros: decimal(request.coverage.maxHoldMicros) }
                : request.coverage,
          },
        },
        (value) => {
          const v = value
          const buckets = array(v['buckets'], bucket)
          if (
            wirePositive(v['resolutionMicros']) !== request.resolutionMicros ||
            buckets.some(
              (b, i) =>
                BigInt(b.window.end) <= BigInt(request.query.startMicros) ||
                BigInt(b.window.start) >= BigInt(request.query.endMicros) ||
                BigInt(b.window.end) - BigInt(b.window.start) > BigInt(request.resolutionMicros) ||
                (i > 0 && BigInt(buckets[i - 1]!.window.end) > BigInt(b.window.start)),
            )
          )
            throw new Error('Wrong aggregate window')
          return {
            buckets,
            unavailable: unavailable(v['unavailable'], tenant),
            resolutionMicros: wirePositive(v['resolutionMicros']),
            refreshedThrough: nullable(v['refreshedThrough'], wireCount),
            next: opaque(v['next']),
          }
        },
      ),
    health: (
      device: string,
      field: string,
      receivedFrom: string,
      receivedUntil: string,
      maxBatches = 64,
    ) =>
      api.postApiV1TelemetryHealth(
        transport,
        {
          body: {
            device,
            field,
            receivedFrom: wireNumber(receivedFrom),
            receivedUntil: wireNumber(receivedUntil),
            maxBatches,
          },
        },
        health,
      ),
    gaps: (
      device: string,
      receivedFrom: string,
      receivedUntil: string,
      after: ReturnType<typeof gapCursor> = null,
    ) =>
      api.postApiV1TelemetryGapsQuery(
        transport,
        {
          body: {
            device,
            receivedFrom: wireNumber(receivedFrom),
            receivedUntil: wireNumber(receivedUntil),
            limit: 64,
            after,
          },
        },
        (value) => gaps(value, device),
      ),
  }
}
