import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
/** Safe formal FactView, shared by audit queries and path-bound device timelines. */
import type { HttpTransport } from '@rss/api/mdm'
import {
  enumeration,
  array,
  count,
  identifier,
  integer,
  nullable,
  uuid,
  string,
} from '../../../services/decode'
const cursor = (v: unknown) =>
  nullable(v, (value) => {
    const token = string(value)
    if (!token) throw new Error('Invalid cursor')
    return token
  })
export interface AuditQuery {
  targetId?: string
  targetType?: string
  device?: string
  operationId?: string
  actor?: string
  action?: string
  outcome?: 'succeeded' | 'denied' | 'failed' | 'unknown'
  from?: number
  until?: number
  limit?: number
  cursor?: string
}
export function auditQuery(query: AuditQuery): AuditQuery {
  if (!wireSchemas.getApiV1AuditEventsQuery.validateRoot(query))
    throw new Error('Invalid audit query')
  for (const text of [query.targetId, query.targetType, query.device, query.actor, query.action])
    if (text !== undefined) identifier(text)
  if (query.operationId !== undefined) uuid(query.operationId)
  if (query.outcome !== undefined)
    enumeration(query.outcome, ['succeeded', 'denied', 'failed', 'unknown'] as const)
  if (query.from !== undefined) count(query.from)
  if (query.until !== undefined) count(query.until)
  if (query.from !== undefined && query.until !== undefined && query.from >= query.until)
    throw new Error('Invalid recorded time range')
  if (query.limit !== undefined && (count(query.limit) < 1 || query.limit > 200))
    throw new Error('Invalid page size')
  if (query.cursor !== undefined) string(query.cursor)
  return { ...query }
}
export function timelinePage(value: unknown) {
  if (!wireSchemas.getApiV1AuditEventsResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value,
    coverage = v['coverage']
  const items = array(v['items'], (x) => {
    const e = x
    return {
      source: identifier(e['source']),
      eventId: identifier(e['eventId']),
      position: count(e['position']),
      recordedAt: integer(e['recordedAt']),
      observedAt: integer(e['observedAt']),
      actorKind: identifier(e['actorKind']),
      actor: identifier(e['actor']),
      action: identifier(e['action']),
      target: (() => {
        const target = e['target']
        return { type: identifier(target['type']), id: identifier(target['id']) }
      })(),
      deviceId: nullable(e['deviceId'], identifier),
      operationId: nullable(e['operationId'], uuid),
      relatedOperationIds: array(e['relatedOperationIds'], uuid),
      requestId: nullable(e['requestId'], uuid),
      registrationId: nullable(e['registrationId'], uuid),
      registrationRequestId: nullable(e['registrationRequestId'], uuid),
      instanceId: nullable(e['instanceId'], uuid),
      auditOutcome: identifier(e['auditOutcome']),
      phase: identifier(e['phase']),
      executionState: nullable(e['executionState'], identifier),
      effect: identifier(e['effect']),
      requestWriteOutcome: nullable(e['requestWriteOutcome'], identifier),
      supported: e['supported'],
    }
  })
  return {
    items,
    nextCursor: cursor(v['nextCursor']),
    coverage: {
      complete: coverage['complete'],
    },
  }
}

export type AuditPage = ReturnType<typeof timelinePage>
export type AuditFact = AuditPage['items'][number]
export function createAuditClient(transport: HttpTransport) {
  return {
    list: (filter: AuditQuery = {}) =>
      api.getApiV1AuditEvents(
        transport,
        { query: { ...auditQuery(filter), limit: filter.limit ?? 20 } },
        timelinePage,
      ),
  }
}
