import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import { array, nullable, string, unique, uuid } from '../../../services/decode'
import { alert, candidate, type Alert } from './model'
export interface AlertFilter {
  cursor?: string
  device?: string
  state?: Alert['state']
}
export function createAlertsClient(transport: HttpTransport, tenant: string, demo: boolean) {
  function read(value: unknown, id: string) {
    const result = alert(candidate(value, tenant, demo, ['alert'])['alert'])
    if (result.id !== id) throw new Error('Wrong alert')
    return result
  }
  return {
    list: (filter: AlertFilter = {}) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/operations/alerts',
        query: { limit: 20, ...filter },
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, ['items', 'snapshot', 'nextCursor'])
          return {
            items: unique(array(v['items'], alert), (v) => v.id),
            snapshot: uuid(v['snapshot']),
            nextCursor: nullable(v['nextCursor'], string),
          }
        },
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/operations/alerts/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => read(v, id),
      }),
    acknowledge: (id: string, body: Operation<Record<string, never>>) =>
      transport.request({
        method: 'POST',
        path: '/api/mdm-candidate/v1/operations/alerts/{id}/acknowledge',
        pathParams: { id },
        body,
        successStatus: 200,
        decode(value) {
          const result = read(value, id)
          if (
            result.operation !== body.operationId ||
            result.revision !== body.expectedRevision + 1 ||
            result.acknowledgment === null
          )
            throw new Error('Wrong acknowledgment')
          return result
        },
      }),
  }
}
