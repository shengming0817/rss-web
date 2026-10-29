import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
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
  if (!wireSchemas.getApiV1RuntimeDiagnosticsResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    alive: v['alive'],
    ready: v['ready'],
    channels: unique(
      array(v['channels'], (value) => {
        const c = value
        return {
          name: c['name'],
          state: c['state'],
          reasons: array(c['reasons'], reason),
          mounted: c['mounted'],
          loadedMaterials: Object.fromEntries(
            Object.entries(c['loadedMaterials']).map(([key, value]) => [key, count(value)]),
          ),
        }
      }),
      (c) => c.name,
    ),
    components: unique(
      array(v['components'], (value) => {
        const c = value

        return {
          name: c['name'],
          readiness: c['readiness'],
          health: c['health'],
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
                  const d = value

                  return {
                    name: d['name'],
                    state: d['state'],
                    reason: d['reason'] === undefined ? null : reason(d['reason']),
                  }
                }),
          queues:
            c['queues'] === undefined
              ? []
              : array(c['queues'], (value) => {
                  const q = value
                  return {
                    name: q['name'],
                    count: nullable(q['count'], count),
                    truncated: nullable(q['truncated'], boolean),
                  }
                }),
          progress:
            c['progress'] === undefined
              ? null
              : (() => {
                  if (
                    !wireSchemas.getApiV1RuntimeDiagnosticsResponse.validateProgress(c['progress'])
                  )
                    throw new Error('Invalid runtime observation')
                  const p = c['progress']
                  return {
                    state: p['state'],
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
                  if (!wireSchemas.getApiV1RuntimeDiagnosticsResponse.validateRunner(c['runner']))
                    throw new Error('Invalid runtime observation')
                  const r = c['runner']
                  return {
                    scan: nullable(r['scan'], run),
                    unresolvedAttempts: count(r['unresolvedAttempts']),
                    truncated: r['truncated'],
                    latestFailure: nullable(r['latestFailure'], (value) => {
                      if (
                        !wireSchemas.getApiV1RuntimeDiagnosticsResponse.validateAttemptFailure(
                          value,
                        )
                      )
                        throw new Error('Invalid runtime attempt')
                      const f = value
                      return {
                        stage: f['stage'],
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
                  if (
                    !wireSchemas.getApiV1RuntimeDiagnosticsResponse.validateDispatch(c['dispatch'])
                  )
                    throw new Error('Invalid runtime observation')
                  const d = c['dispatch']
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
    read: () => api.getApiV1RuntimeDiagnostics(transport, {}, runtimeSnapshot),
  }
}
