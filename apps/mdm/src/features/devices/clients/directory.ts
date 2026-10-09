import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
  closed,
  count,
  identifier,
  integer,
  nullable,
  unique,
  uuid,
} from '../../../services/decode'
import { endpoint, endpointDetail } from './endpoint-model'
import { cursor } from './asset-model'
export function decodeDirectory(value: unknown) {
  const v = closed(value, ['items', 'statistics', 'asOf', 'nextCursor']),
    s = closed(v['statistics'], ['total', 'pending', 'active', 'revoked'])
  return {
    items: unique(
      array(v['items'], (x) => {
        const d = closed(x, [
          'id',
          'status',
          'primaryMdmRegistration',
          'channels',
          'enrollments',
          'inventoryAvailable',
        ])
        return { ...endpoint(d), inventoryAvailable: boolean(d['inventoryAvailable']) }
      }),
      (d) => d.id,
    ),
    statistics: {
      total: count(s['total']),
      pending: count(s['pending']),
      active: count(s['active']),
      revoked: count(s['revoked']),
    },
    asOf: integer(v['asOf']),
    nextCursor: cursor(v['nextCursor']),
  }
}
function timeline(value: unknown) {
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
      target: nullable(e['target'], identifier),
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
export function createDirectoryClient(transport: HttpTransport) {
  return {
    list: (after?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/devices',
        query: { limit: 20, after },
        successStatus: 200,
        decode: decodeDirectory,
      }),
    detail: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/devices/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => endpointDetail(v, id),
      }),
    history: (id: string, next?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/devices/{id}/timeline',
        pathParams: { id },
        query: { limit: 20, cursor: next },
        successStatus: 200,
        decode: timeline,
      }),
  }
}
