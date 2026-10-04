import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import { array, closed, nullable, uuid } from '../../../services/decode'
import { decodePolicy, type PolicyChange, type PolicyDefinition } from './model'
export function createPoliciesClient(transport: HttpTransport) {
  return {
    list: (after?: string, action?: PolicyDefinition['action']['kind']) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/policies',
        query: { after, action, limit: 20 },
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['items', 'nextCursor'])
          return {
            items: array(v['items'], (item) => decodePolicy(item)),
            nextCursor: nullable(v['nextCursor'], uuid),
          }
        },
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/policies/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => decodePolicy(v, id),
      }),
    change: (id: string, body: Operation<PolicyChange>) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/policies/{id}',
        pathParams: { id },
        body,
        successStatus: 200,
        decode: (v) => decodePolicy(v, id),
      }),
  }
}
