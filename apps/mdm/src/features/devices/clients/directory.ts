import type { HttpTransport } from '@rss/api/mdm'
import { array, boolean, closed, count, integer, unique } from '../../../services/decode'
import { endpoint, endpointDetail } from './endpoint-model'
import { cursor } from './asset-model'
import { timelinePage, auditQuery, type AuditQuery } from '../../operations/clients/audit'
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
    history: (id: string, filter: Omit<AuditQuery, 'device'> = {}) => {
      if ('device' in filter) throw new Error('Device timeline is path-bound')
      return transport.request({
        method: 'GET',
        path: '/api/v1/devices/{id}/timeline',
        pathParams: { id },
        query: { ...auditQuery(filter), limit: filter.limit ?? 20 },
        successStatus: 200,
        decode: timelinePage,
      })
    },
  }
}
