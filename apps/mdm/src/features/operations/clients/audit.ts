import type { HttpTransport } from '@rss/api/mdm'
import { array, nullable, string, unique, uuid } from '../../../services/decode'
import { auditEntry, candidate, type AuditEntry } from './model'
export interface AuditFilter {
  cursor?: string
  device?: string
  action?: AuditEntry['action']
  from?: number
  until?: number
}
export function createAuditClient(transport: HttpTransport, tenant: string, demo: boolean) {
  return {
    list: (filter: AuditFilter = {}) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/operations/audit',
        query: { limit: 20, ...filter },
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, ['items', 'snapshot', 'nextCursor'])
          return {
            items: unique(array(v['items'], auditEntry), (v) => v.id),
            snapshot: uuid(v['snapshot']),
            nextCursor: nullable(v['nextCursor'], string),
          }
        },
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/operations/audit/{id}',
        pathParams: { id },
        successStatus: 200,
        decode(value) {
          const result = auditEntry(candidate(value, tenant, demo, ['entry'])['entry'])
          if (result.id !== id) throw new Error('Wrong audit entry')
          return result
        },
      }),
  }
}
