import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import { array, count, nullable, string, unique, uuid } from '../../../services/decode'
import { candidate } from './candidate'
import {
  requestTarget,
  securityRequest,
  type SecurityRequest,
  type SecurityRequestDefinition,
} from './requests-model'
export interface RequestFilter {
  cursor?: string
  device?: string
  state?: SecurityRequest['state']
}
export function createSecurityRequestsClient(
  transport: HttpTransport,
  tenant: string,
  demo: boolean,
) {
  function read(value: unknown, id: string) {
    const v = candidate(value, tenant, demo, ['request', 'asOf']),
      result = securityRequest(v['request'])
    if (result.id !== id) throw new Error('Wrong security request')
    return { request: result, asOf: count(v['asOf']) }
  }
  return {
    list: (filter: RequestFilter = {}) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/security/requests',
        query: { limit: 20, ...filter },
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, ['items', 'snapshot', 'nextCursor', 'asOf'])
          return {
            items: unique(array(v['items'], securityRequest), (r) => r.id),
            snapshot: uuid(v['snapshot']),
            nextCursor: nullable(v['nextCursor'], string),
            asOf: count(v['asOf']),
          }
        },
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/security/requests/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => read(v, id),
      }),
    create: (body: Operation<SecurityRequestDefinition>) =>
      transport.request({
        method: 'POST',
        path: '/api/mdm-candidate/v1/security/requests',
        body,
        successStatus: 200,
        decode(value) {
          const v = read(value, body.operationId)
          if (
            v.request.operation !== body.operationId ||
            v.request.revision !== 1 ||
            v.request.state !== 'pending' ||
            JSON.stringify(v.request.target) !== JSON.stringify(requestTarget(body.input.target))
          )
            throw new Error('Wrong request acceptance')
          return v
        },
      }),
    decide: (
      id: string,
      action: 'approve' | 'deny' | 'revoke',
      body: Operation<Record<string, never>>,
    ) =>
      transport.request({
        method: 'POST',
        path: '/api/mdm-candidate/v1/security/requests/{id}/{action}',
        pathParams: { id, action },
        body,
        successStatus: 200,
        decode(value) {
          const v = read(value, id),
            state = action === 'approve' ? 'approved' : action === 'deny' ? 'denied' : 'revoked'
          if (
            v.request.operation !== body.operationId ||
            v.request.revision !== body.expectedRevision + 1 ||
            v.request.state !== state
          )
            throw new Error('Wrong request decision receipt')
          return v
        },
      }),
  }
}
