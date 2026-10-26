import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  nullable,
  record,
  unique,
} from '../../../services/decode'
const reasons = [
  'material_not_selected',
  'material_unreadable',
  'material_invalid',
  'trust_conflict',
  'material_revoked',
  'material_version_mismatch',
  'ingress_unavailable',
  'initialization_authorization',
  'initialization_content',
  'initialization_conflict',
  'initialization_telemetry_backend',
  'initializing',
  'stopping',
  'worker_not_running',
  'delivery_retrying',
  'dependency_unavailable',
  'deadline',
  'settlement_unknown',
  'automation_suspended',
  'push_unavailable',
  'certificate_expired',
  'clock_unavailable',
  'unobserved',
  'projection_failed',
  'ownership_lost',
  'work_rejected',
  'observation_limit',
] as const
const reason = (v: unknown) => enumeration(v, reasons)
function run(value: unknown) {
  const v = record(value)
  if (Object.keys(v).some((k) => !['successful', 'reason', 'observedAt'].includes(k)))
    throw new Error('Invalid runtime result')
  return {
    successful: boolean(v['successful']),
    reason: v['reason'] === undefined ? null : reason(v['reason']),
    observedAt: nullable(v['observedAt'], count),
  }
}
export function runtimeSnapshot(value: unknown) {
  const v = closed(value, ['alive', 'ready', 'components', 'channels'])
  return {
    alive: boolean(v['alive']),
    ready: boolean(v['ready']),
    channels: unique(
      array(v['channels'], (value) => {
        const c = closed(value, ['name', 'state', 'reasons', 'mounted', 'loadedMaterials'])
        return {
          name: enumeration(c['name'], [
            'apple',
            'windows',
            'agent',
            'windows_push',
            'agent_bootstrap',
            'signing',
          ] as const),
          state: enumeration(c['state'], ['disabled', 'waiting', 'ready', 'degraded'] as const),
          reasons: array(c['reasons'], reason),
          mounted: boolean(c['mounted']),
          loadedMaterials: Object.fromEntries(
            Object.entries(record(c['loadedMaterials'])).map(([key, value]) => [key, count(value)]),
          ),
        }
      }),
      (c) => c.name,
    ),
    components: unique(
      array(v['components'], (value) => {
        const c = record(value)
        if (
          Object.keys(c).some(
            (k) =>
              ![
                'name',
                'readiness',
                'health',
                'reasons',
                'task',
                'dependencies',
                'queues',
                'progress',
                'bridge',
                'runner',
                'dispatch',
              ].includes(k),
          )
        )
          throw new Error('Invalid runtime component')
        return {
          name: enumeration(c['name'], [
            'initialization',
            'telemetry',
            'inventory',
            'automation',
            'execution_recovery',
          ] as const),
          readiness: enumeration(c['readiness'], ['ready', 'not_ready', 'not_applicable'] as const),
          health: enumeration(c['health'], [
            'healthy',
            'degraded',
            'unknown',
            'not_applicable',
          ] as const),
          reasons: array(c['reasons'], reason),
          task:
            c['task'] === undefined
              ? null
              : enumeration(c['task'], [
                  'unknown',
                  'pending',
                  'running',
                  'cancelled',
                  'completed',
                  'failed',
                ] as const),
          dependencies:
            c['dependencies'] === undefined
              ? []
              : array(c['dependencies'], (value) => {
                  const d = record(value)
                  if (Object.keys(d).some((k) => !['name', 'state', 'reason'].includes(k)))
                    throw new Error('Invalid runtime dependency')
                  return {
                    name: enumeration(d['name'], [
                      'telemetry_storage',
                      'inventory_delivery',
                      'observation_journal',
                      'flow_storage',
                    ] as const),
                    state: enumeration(d['state'], ['available', 'unavailable'] as const),
                    reason: d['reason'] === undefined ? null : reason(d['reason']),
                  }
                }),
          queues:
            c['queues'] === undefined
              ? []
              : array(c['queues'], (value) => {
                  const q = closed(value, ['name', 'count', 'truncated'])
                  return {
                    name: enumeration(q['name'], [
                      'initialization_assets_pending',
                      'initialization_telemetry_pending',
                      'delivery_unknown',
                      'delivery_blocked',
                      'maintenance_pending',
                      'delivery_pending',
                      'pending',
                      'running',
                      'completed',
                      'failed',
                      'superseded',
                      'asset_changes_pending',
                    ] as const),
                    count: nullable(q['count'], count),
                    truncated: nullable(q['truncated'], boolean),
                  }
                }),
          progress:
            c['progress'] === undefined
              ? null
              : (() => {
                  const p = closed(c['progress'], [
                    'state',
                    'confirmedPosition',
                    'sourceHead',
                    'lagging',
                    'invocationAgeMs',
                    'completedPassAgeMs',
                    'sourceObservationAgeMs',
                    'applied',
                  ])
                  return {
                    state: enumeration(p['state'], [
                      'unobserved',
                      'pending',
                      'running',
                      'caught_up',
                      'limited',
                      'failed',
                      'unavailable',
                    ] as const),
                    confirmedPosition: nullable(p['confirmedPosition'], count),
                    sourceHead: nullable(p['sourceHead'], count),
                    lagging: nullable(p['lagging'], boolean),
                    invocationAgeMs: nullable(p['invocationAgeMs'], count),
                    completedPassAgeMs: nullable(p['completedPassAgeMs'], count),
                    sourceObservationAgeMs: nullable(p['sourceObservationAgeMs'], count),
                    applied: nullable(p['applied'], count),
                  }
                })(),
          bridge: c['bridge'] === undefined ? null : run(c['bridge']),
          runner:
            c['runner'] === undefined
              ? null
              : (() => {
                  const r = closed(c['runner'], [
                    'scan',
                    'unresolvedAttempts',
                    'truncated',
                    'latestFailure',
                  ])
                  return {
                    scan: nullable(r['scan'], run),
                    unresolvedAttempts: count(r['unresolvedAttempts']),
                    truncated: boolean(r['truncated']),
                    latestFailure: nullable(r['latestFailure'], (value) => {
                      const f = closed(value, ['stage', 'reason', 'observedAt'])
                      return {
                        stage: enumeration(f['stage'], [
                          'observe',
                          'apply',
                          'renew',
                          'finish',
                        ] as const),
                        reason: reason(f['reason']),
                        observedAt: nullable(f['observedAt'], count),
                      }
                    }),
                  }
                })(),
          dispatch:
            c['dispatch'] === undefined
              ? null
              : (() => {
                  const d = closed(c['dispatch'], ['consumed', 'watermark'])
                  return { consumed: count(d['consumed']), watermark: count(d['watermark']) }
                })(),
        }
      }),
      (c) => c.name,
    ),
  }
}
export function createRuntimeDiagnostics(transport: HttpTransport) {
  return {
    read: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/runtime/diagnostics',
        successStatus: 200,
        decode: runtimeSnapshot,
      }),
  }
}
