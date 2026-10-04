import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import { array, count, nullable, string, unique, uuid } from '../../../services/decode'
import { candidate } from './candidate'
import { securityAction } from './actions-model'
export function createSecurityActionsClient(
  transport: HttpTransport,
  tenant: string,
  demo: boolean,
) {
  function read(value: unknown, id: string) {
    const v = candidate(value, tenant, demo, ['action', 'asOf']),
      action = securityAction(v['action'])
    if (action.id !== id) throw new Error('Wrong security action')
    return { action, asOf: count(v['asOf']) }
  }
  return {
    list: (filter: { device?: string; request?: string; cursor?: string } = {}) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/security/actions',
        query: { limit: 20, ...filter },
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, ['items', 'snapshot', 'nextCursor', 'asOf'])
          const items = unique(array(v['items'], securityAction), (a) => a.id)
          if (
            items.some(
              (a) =>
                (filter.device && a.target.device !== filter.device) ||
                (filter.request && a.request !== filter.request),
            )
          )
            throw new Error('Wrong security action filter')
          return {
            items,
            snapshot: uuid(v['snapshot']),
            nextCursor: nullable(v['nextCursor'], string),
            asOf: count(v['asOf']),
          }
        },
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/security/actions/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => read(v, id),
      }),
    dispatch: (id: string, body: Operation<Record<string, never>>) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/mdm-candidate/security/requests/{id}/dispatch',
        pathParams: { id },
        body,
        successStatus: 200,
        decode(value) {
          const v = read(value, body.operationId)
          if (
            v.action.operation !== body.operationId ||
            v.action.request !== id ||
            v.action.revision !== 1
          )
            throw new Error('Wrong dispatch receipt')
          return v
        },
      }),
  }
}
