import { randomUUID } from 'node:crypto'
import type { DomainHandler } from './scenario'
import { TENANT } from './scenario'
import { count, identifier, record } from '../src/services/decode'
import { catalog } from './devices/fixtures'
import { error, ok } from './http'
import type { createDeviceDemo } from './devices/state'
import type { createResourceDemo } from './policies/resources'
import type { createPolicyStore } from './policies/store'
import type { createScopeDemo } from './policies/scopes'
import { policyDefinition } from '../src/features/policies/clients/model'
import { objectKey } from '../src/features/devices/clients/objects'
/** Explicit synthetic HTTP data only. Production entries never import this owner. */
export function createTelemetryDemo(
  devices: ReturnType<typeof createDeviceDemo>,
  resources: ReturnType<typeof createResourceDemo>,
  store: ReturnType<typeof createPolicyStore>,
  scopes: ReturnType<typeof createScopeDemo>,
) {
  const epoch = randomUUID(),
    cursors = new Map<string, { basis: string; offset: number }>()
  store.register('telemetry_profile', (d) => {
    if (d.action.kind !== 'telemetry_profile') return error('malformed_request', 400)
    const b = d.action.resource,
      r = resources.read(b.id),
      v = r?.versions.find((v) => v.id === b.version && v.state === 'active')
    return r?.kind === 'telemetry_profile' &&
      v?.variants.some(
        (v) =>
          v.key === b.variant && v.platform === b.platform && v.architecture === b.architecture,
      ) &&
      scopes.resolve(d.scope, 'agent')
      ? undefined
      : error('resource_not_found', 404)
  })
  const handle: DomainHandler = (request, scenario) => {
    const { path, method } = request
    if (path === '/api/v1/policies/previews' && method === 'POST') {
      const body = record(request.body),
        raw = record(body['definition'])
      if (record(raw['action'])['kind'] !== 'telemetry_profile') return
      const d = policyDefinition(raw),
        snapshot = scopes.snapshot(d.scope)
      if (!snapshot) return error('scope_not_found', 404)
      if (body['scopeResult'] && body['scopeResult'] !== snapshot.result)
        return error('operation_conflict')
      const rows = scopes
        .assignments(d.scope, 'agent')
        .filter((x) => objectKey(x.object) > String(body['after'] ?? ''))
      return ok({
        action: d.action,
        scopeResult: snapshot.result,
        items: rows
          .slice(0, 64)
          .map(({ sources: _sources, scopeResult: _result, qualification, ...facts }) => ({
            ...facts,
            eligibility: qualification,
            collectionSupported: facts.target !== null,
          })),
        nextCursor: rows.length > 64 ? objectKey(rows[63]!.object) : null,
      })
    }
    const configuration = /^\/api\/v1\/devices\/([^/]+)\/telemetry-configurations$/.exec(path)
    if (configuration && method === 'GET') {
      const device = decodeURIComponent(configuration[1]!),
        facts = devices.facts().find((x) => x.summary.id === device)
      if (!facts) return error('inventory_not_found', 404)
      const registration = facts.registrations.find(
        (x) => x.status === 'active' && x.source === 'agent.builtin',
      )
      return ok({
        device,
        registration: registration
          ? { id: registration.registrationId, generation: registration.generation }
          : null,
        evaluatedAtMicros: Date.now() * 1000,
        configurations: store.values().flatMap((p) => {
          if (
            !registration ||
            !p.enabled ||
            p.definition.action.kind !== 'telemetry_profile' ||
            !scopes.resolve(p.definition.scope, 'agent')?.members.includes(device)
          )
            return []
          const binding = p.definition.action.resource,
            d = resources
              .read(binding.id)
              ?.versions.find((v) => v.id === binding.version)
              ?.variants.find((v) => v.key === binding.variant)?.declaration
          return d?.kind === 'telemetry_profile'
            ? [
                {
                  policyId: p.id,
                  policyVersionId: p.versionId,
                  resource: binding,
                  source: 'agent.script',
                  projection: d.definition.projection,
                  sampleMillis: d.definition.sampleMillis,
                  normalSampleMillis: d.definition.sampleMillis,
                  boostExpiresAt: null,
                  uploadMillis: d.definition.uploadMillis,
                  supported: true,
                },
              ]
            : []
        }),
      })
    }
    if (!path.startsWith('/api/v1/telemetry/') || method !== 'POST') return
    if (scenario === 'unsupported') return error('telemetry_unavailable', 501)
    const body = record(request.body),
      query = path.endsWith('/aggregate') ? record(body['query']) : body
    const device = identifier(query['device']),
      fact = devices.facts().find((x) => x.summary.id === device)
    if (!fact) return error('inventory_not_found', 404)
    const registration =
      fact.registrations.find((r) => r.status === 'active' && r.source === 'agent.builtin')
        ?.registrationId ?? '11111111-1111-4111-8111-111111111111'
    if (path.endsWith('/gaps/query'))
      return ok({
        reports:
          scenario === 'empty'
            ? []
            : [
                {
                  receivedAt: count(body['receivedUntil']) - 10_000_000,
                  report: {
                    reportId: epoch,
                    registrationId: registration,
                    generation: 1,
                    createdAt: count(body['receivedUntil']) - 11_000_000,
                    gaps: [
                      {
                        reason: 'capacity',
                        count: 3,
                        first: count(body['receivedFrom']),
                        last: count(body['receivedUntil']) - 60_000_000,
                      },
                    ],
                  },
                },
              ],
        next: null,
      })
    const field = catalog.find((f) => f.key === query['field'])
    if (!field) return error('inventory_not_found', 404)
    if (path.endsWith('/resources'))
      return ok({
        resources:
          scenario === 'empty'
            ? []
            : field.key.includes('filesystem')
              ? ['system-volume', 'data-volume']
              : field.key.includes('network')
                ? ['en0', 'en1']
                : ['device'],
        nextAfter: null,
        retired: false,
      })
    if (path.endsWith('/health'))
      return ok({
        batches:
          scenario === 'empty'
            ? []
            : [
                {
                  batchId: epoch,
                  receivedAt: count(body['receivedUntil']) - 1_000_000,
                  firstObserved: count(body['receivedFrom']),
                  lastObserved: count(body['receivedUntil']) - 5_000_000,
                  delivery: 'published',
                  qualityCounts: [48, 9, 3],
                },
              ],
        batchesTruncated: scenario === 'partial',
        retention: [],
        retentionTruncated: false,
        qualityOrder: ['valid', 'missing', 'failed'],
        retired: false,
      })
    if (!field.timeSeries) return error('malformed_request', 400)
    const start = count(query['startMicros']),
      end = count(query['endMicros']),
      kind = field.timeSeries.kind
    if (path.endsWith('/aggregate')) {
      const gap = body['maxGapMicros']
      if (
        kind.endsWith('_counter')
          ? typeof gap !== 'number' || !Number.isSafeInteger(gap) || gap <= 0
          : gap !== null
      )
        return error('malformed_request', 400)
      const resolution = count(body['resolutionMicros']),
        total = Math.ceil((end - start) / resolution),
        limit = Math.min(256, total)
      return ok({
        buckets:
          scenario === 'empty'
            ? []
            : Array.from({ length: limit }, (_, i) => ({
                window: {
                  start: start + i * resolution,
                  end: Math.min(end, start + (i + 1) * resolution),
                },
                value:
                  i > limit * 0.33 && i < limit * 0.5
                    ? 'Missing'
                    : body['operation'] === 'rate'
                      ? {
                          Rate: {
                            increase: { F64: 8000 + (i % 9) * 1000 },
                            duration_micros: resolution,
                          },
                        }
                      : { Mean: { sum: { F64: 35 + Math.sin(i / 3) * 20 }, count: 1 } },
                valid_samples: 1,
                covered_micros: kind === 'gauge' ? 0 : resolution,
                completeness: i > limit * 0.33 && i < limit * 0.5 ? ['Gaps'] : [],
              })),
        unavailable: [],
        resolutionMicros: resolution,
        refreshedThrough: end - 1,
        next: null,
      })
    }
    if (path.endsWith('/history')) {
      const basis = JSON.stringify({ ...query, after: null }),
        cursor = query['after'] ? cursors.get(String(query['after'])) : undefined
      if (query['after'] && cursor?.basis !== basis) return error('operation_conflict')
      const total = 60,
        offset = cursor?.offset ?? 0,
        limit = count(query['maxPoints']),
        stop = Math.min(total, offset + limit)
      const rows = Array.from({ length: Math.max(0, stop - offset) }, (_, j) => {
        const i = offset + j,
          at = Math.floor(start + ((i + 0.5) * (end - start)) / total),
          value =
            kind === 'state'
              ? i % 16 < 10
                ? 'running'
                : 'stopped'
              : kind === 'cumulative_counter'
                ? 10000 + i * 1000
                : 35 + Math.sin(i / 3) * 20
        return {
          sample: {
            id: `demo-${field.key}-${i}`,
            sequence: i + 1,
            observedAt: at,
            interval: kind.endsWith('counter') ? { start, end: at } : null,
            reading:
              i >= 20 && i < 30
                ? { quality: i % 2 ? 'missing' : 'failed' }
                : {
                    quality: 'valid',
                    value:
                      kind === 'state'
                        ? { type: 'state', value }
                        : { type: 'number', value: { type: 'f64', value } },
                  },
            stream: {
              scope: { tenant: TENANT, namespace: 'mdm.telemetry' },
              source: registration + ':agent.script',
              generation: epoch,
            },
            series: {
              definition: {
                scope: { tenant: TENANT, namespace: 'mdm.telemetry' },
                key: field.key,
                version: field.version,
                unit: field.unit ?? '1',
                metric:
                  kind === 'state'
                    ? { kind: 'state', members: ['running', 'stopped'] }
                    : kind === 'gauge'
                      ? { kind: 'gauge', number: 'f64' }
                      : { kind: 'counter', number: 'f64', temporality: 'cumulative' },
                dimensions: {
                  allowed: [],
                  required: [],
                  maxCount: 0,
                  maxValueBytes: 0,
                  maxTotalBytes: 0,
                },
              },
              subject: device,
              resource: query['resource'],
              dimensions: {},
            },
          },
          receivedAt: at + 1_000_000,
          ...(query['mode'] === 'latest'
            ? { effectiveSource: true, sourceConflict: false }
            : { liveSource: true }),
        }
      })
      let next: string | null = null
      if (stop < total) {
        next = randomUUID()
        cursors.set(next, { basis, offset: stop })
      }
      while (cursors.size > 256) cursors.delete(cursors.keys().next().value!)
      return ok({
        rows: scenario === 'empty' ? [] : rows,
        unavailable: [],
        next,
        retired: false,
        mode: query['mode'],
      })
    }
    return error('not_found', 404)
  }
  return { handle, reset: () => cursors.clear() }
}
