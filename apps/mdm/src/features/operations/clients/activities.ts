import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  identifier,
  integer,
  nullable,
  uuid,
} from '../../../services/decode'
import {
  nextCursor,
  pageCursor,
  windowParameters,
  type WindowQuery,
} from '../../../services/directory-query'
import { operationReference } from '../../policies/clients/events'
export interface ActivityQuery extends WindowQuery {
  from?: number
  until?: number
  source?: string
  kind?: string
  status?: string
  policy?: string
  request?: string
  batch?: string
  task?: string
  operation?: string
  related?: string
}
function queryParameters(query: ActivityQuery) {
  const { limit, cursor, ...context } = query

  const result: Record<string, string | number> = windowParameters({ limit, cursor }, 200)
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined) continue
    result[key] = ['from', 'until'].includes(key)
      ? count(value)
      : ['policy', 'request', 'batch', 'task', 'operation'].includes(key)
        ? uuid(value)
        : identifier(value)
  }
  if (query.from !== undefined && query.until !== undefined && query.from >= query.until)
    throw new Error('Invalid activity window')
  return result
}
function links(value: unknown) {
  const ids = [
    'policy',
    'version',
    'batch',
    'member',
    'request',
    'operation',
    'retirement',
    'task',
    'attempt',
  ] as const
  const v = closed(value, [...ids, 'steps', 'operations'])
  const result = Object.fromEntries(ids.map((key) => [key, nullable(v[key], uuid)])) as Record<
    (typeof ids)[number],
    string | null
  >
  const steps = array(v['steps'], identifier)
  return { ...result, steps, operations: array(v['operations'], operationReference) }
}
export function managementActivity(value: unknown, device: string) {
  const v = closed(value, [
    'id',
    'source',
    'kind',
    'phase',
    'recordedAt',
    'observedAt',
    'origin',
    'target',
    'links',
    'delivery',
    'execution',
    'effect',
    'reporting',
    'decision',
    'auditOutcome',
  ])
  const target = nullable(v['target'], (value) => {
    const t = closed(value, ['device', 'registration', 'generation']),
      actual = identifier(t['device'])
    if (actual !== device) throw new Error('Wrong activity device')
    return {
      device: actual,
      registration: uuid(t['registration']),
      generation: count(t['generation']),
    }
  })
  return {
    id: identifier(v['id']),
    source: identifier(v['source']),
    kind: enumeration(v['kind'], [
      'policy',
      'assignment',
      'batch',
      'execution',
      'configuration',
    ] as const),
    phase: enumeration(v['phase'], [
      'changed',
      'assigned',
      'withdrawn',
      'accepted',
      'offered',
      'dispatched',
      'received',
      'started',
      'reporting',
      'result',
      'reconciled',
      'cancelled',
      'decided',
    ] as const),
    recordedAt: integer(v['recordedAt']),
    observedAt: integer(v['observedAt']),
    origin: enumeration(v['origin'], ['system', 'policy', 'human', 'ai'] as const),
    target,
    links: links(v['links']),
    delivery: nullable(v['delivery'], (v) =>
      enumeration(v, ['queued', 'offered', 'dispatched', 'received', 'unknown'] as const),
    ),
    execution: nullable(v['execution'], (v) =>
      enumeration(v, [
        'not_started',
        'running',
        'succeeded',
        'failed',
        'waiting_reboot',
        'unknown',
        'queued',
        'published',
        'received',
        'applied',
        'rejected',
        'timed_out',
        'superseded',
        'cancelled',
      ] as const),
    ),
    effect: nullable(v['effect'], (v) =>
      enumeration(v, [
        'verified',
        'failed',
        'unknown',
        'waiting_reboot',
        'diverged',
        'waiting',
        'unverifiable',
      ] as const),
    ),
    reporting: nullable(v['reporting'], (v) =>
      enumeration(v, ['partial', 'acknowledged'] as const),
    ),
    decision: nullable(v['decision'], (v) =>
      enumeration(v, [
        'pending',
        'accepted',
        'no_change',
        'rejected',
        'expired',
        'cancelled',
        'cancellation_requested',
        'assigned',
        'unavailable',
      ] as const),
    ),
    auditOutcome: identifier(v['auditOutcome']),
  }
}
export type ManagementActivity = ReturnType<typeof managementActivity>
export function createActivitiesClient(transport: HttpTransport) {
  return {
    list: (device: string, query: ActivityQuery = {}) =>
      api.getApiV1DevicesByDeviceManagementActivities(
        transport,
        { pathParams: { device }, query: queryParameters(query) },
        (value) => {
          const v = value
          return {
            items: array(v['items'], (v) => managementActivity(v, device)),
            nextCursor: nextCursor(v['nextCursor']),
            syncCursor: pageCursor(v['syncCursor']),
            asOf: integer(v['asOf']),
            retainedFrom: nullable(v['retainedFrom'], integer),
            coverage: array(v['coverage'], (value) => {
              const c = closed(value, ['source', 'complete', 'reasons'])
              return {
                source: identifier(c['source']),
                complete: boolean(c['complete']),
                reasons: array(c['reasons'], identifier),
              }
            }),
          }
        },
      ),
    read: (device: string, id: string) =>
      api.getApiV1DevicesByDeviceManagementActivitiesById(
        transport,
        { pathParams: { device, id } },
        (value) => {
          const v = value,
            activity = managementActivity(v['activity'], device)
          if (activity.id !== id || v['personal']) throw new Error('Wrong management activity')
          return {
            activity,
            related: array(v['related'], (v) => managementActivity(v, device)),
            relatedCursor: nextCursor(v['relatedCursor']),
            missing: array(v['missing'], identifier),
            asOf: integer(v['asOf']),
          }
        },
      ),
  }
}
