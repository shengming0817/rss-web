import * as api from '@rss/api/mdm-operations'
import {
  queryParameters,
  projectedPage,
  type DirectoryQuery,
} from '../../../services/directory-query'
import type { HttpTransport } from '@rss/api/mdm'
import { boolean, count, integer } from '../../../services/decode'
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
      api.getApiV1Devices(transport, { query: queryParameters({ limit: 20, ...query }) }, (value) =>
        projectedPage(value, directoryFields, query.fields, ['id']),
      ),
    statistics: (filter?: string) =>
      api.getApiV1DevicesStatistics(transport, { query: queryParameters({ filter }) }, (value) => {
        const v = value,
          stats = v['statistics']
        return {
          statistics: {
            total: count(stats['total']),
            pending: count(stats['pending']),
            active: count(stats['active']),
            revoked: count(stats['revoked']),
          },
          asOf: integer(v['asOf']),
        }
      }),
    detail: (id: string) =>
      api.getApiV1DevicesByDevice(transport, { pathParams: { device: id } }, (v) =>
        endpointDetail(v, id),
      ),
    history: (id: string, filter: Omit<AuditQuery, 'device'> = {}) => {
      if ('device' in filter) throw new Error('Device timeline is path-bound')
      return api.getApiV1DevicesByDeviceTimeline(
        transport,
        { pathParams: { device: id }, query: { ...auditQuery(filter), limit: filter.limit ?? 20 } },
        timelinePage,
      )
    },
  }
}
