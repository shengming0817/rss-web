import {
  queryParameters,
  projectedPage,
  type DirectoryQuery,
} from '../../../services/directory-query'
import type { HttpTransport } from '@rss/api/mdm'
import { boolean, closed, count, integer } from '../../../services/decode'
import { endpointDirectoryFields, endpointDetail } from './endpoint-model'
import { timelinePage, auditQuery, type AuditQuery } from '../../operations/clients/audit'
const directoryFields = { ...endpointDirectoryFields, inventoryAvailable: boolean }
export function decodeDirectory(value: unknown) {
  return projectedPage(value, directoryFields)
}
export function createDirectoryClient(transport: HttpTransport) {
  return {
    list: <F extends keyof typeof directoryFields = keyof typeof directoryFields>(
      query: DirectoryQuery<F> = {},
    ) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/devices',
        query: queryParameters({ limit: 20, ...query }),
        successStatus: 200,
        decode: (value) => projectedPage(value, directoryFields, query.fields, ['id']),
      }),
    statistics: (filter?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/devices/statistics',
        query: queryParameters({ filter }),
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['statistics', 'asOf']),
            stats = closed(v['statistics'], ['total', 'pending', 'active', 'revoked'])
          return {
            statistics: {
              total: count(stats['total']),
              pending: count(stats['pending']),
              active: count(stats['active']),
              revoked: count(stats['revoked']),
            },
            asOf: integer(v['asOf']),
          }
        },
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
