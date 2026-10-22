/** Safe formal FactView, shared by audit queries and path-bound device timelines. */
import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
  closed,
  count,
  identifier,
  integer,
  nullable,
  uuid,
  string,
  enumeration,
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
  closed(
    query,
    [],
    [
      'targetId',
      'targetType',
      'device',
      'operationId',
      'actor',
      'action',
      'outcome',
      'from',
      'until',
      'limit',
      'cursor',
    ],
  )
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
  const v = closed(value, ['items', 'nextCursor', 'coverage']),
    coverage = closed(v['coverage'], ['indexedThrough', 'sourceThrough', 'complete'])
  const items = array(v['items'], (x) => {
    const e = closed(x, [
      'source',
      'eventId',
      'position',
      'recordedAt',
      'observedAt',
      'actorKind',
      'actor',
      'action',
      'target',
      'deviceId',
      'operationId',
      'relatedOperationIds',
      'requestId',
      'registrationId',
      'registrationRequestId',
      'instanceId',
      'auditOutcome',
      'phase',
      'executionState',
      'effect',
      'requestWriteOutcome',
      'supported',
    ])
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
        const target = closed(e['target'], ['type', 'id'])
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
      supported: boolean(e['supported']),
    }
  })
  return {
    items,
    nextCursor: cursor(v['nextCursor']),
    coverage: {
      indexedThrough: nullable(coverage['indexedThrough'], count),
      sourceThrough: nullable(coverage['sourceThrough'], count),
      complete: boolean(coverage['complete']),
    },
  }
}

export type AuditPage = ReturnType<typeof timelinePage>
export type AuditFact = AuditPage['items'][number]
export function createAuditClient(transport: HttpTransport) {
  return {
    list: (filter: AuditQuery = {}) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/audit-events',
        query: { ...auditQuery(filter), limit: filter.limit ?? 20 },
        successStatus: 200,
        decode: timelinePage,
      }),
  }
}
