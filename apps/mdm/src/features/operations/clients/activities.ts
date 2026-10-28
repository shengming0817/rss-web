import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import { array, count, identifier, integer, nullable, uuid } from '../../../services/decode'
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
  if (!wireSchemas.getApiV1DevicesByDeviceManagementActivitiesResponse.validateActivityLinks(value))
    throw new Error('Invalid contract value')

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
  const v = value
  const result = Object.fromEntries(ids.map((key) => [key, nullable(v[key], uuid)])) as Record<
    (typeof ids)[number],
    string | null
  >
  const steps = array(v['steps'], identifier)
  return { ...result, steps, operations: array(v['operations'], operationReference) }
}
export function managementActivity(value: unknown, device: string) {
  if (
    !wireSchemas.getApiV1DevicesByDeviceManagementActivitiesResponse.validateManagementActivity(
      value,
    )
  )
    throw new Error('Invalid contract value')

  const v = value
  const target = nullable(v['target'], (value) => {
    const t = value,
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
    kind: v['kind'],
    phase: v['phase'],
    recordedAt: integer(v['recordedAt']),
    observedAt: integer(v['observedAt']),
    origin: v['origin'],
    target,
    links: links(v['links']),
    delivery: nullable(v['delivery'], (v) => v),
    execution: nullable(v['execution'], (v) => v),
    effect: nullable(v['effect'], (v) => v),
    reporting: nullable(v['reporting'], (v) => v),
    decision: nullable(v['decision'], (v) => v),
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
              const c = value
              return {
                source: identifier(c['source']),
                complete: c['complete'],
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
