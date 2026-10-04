import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import { array, count, nullable, string, unique, uuid } from '../../../services/decode'
import { candidate } from './candidate'
import { baseline, baselineDevice, type BaselineDefinition } from './governance-model'
export function createGovernanceClient(transport: HttpTransport, tenant: string, demo: boolean) {
  function read(value: unknown, id: string) {
    const v = candidate(value, tenant, demo, ['baseline', 'asOf']),
      result = baseline(v['baseline'])
    if (result.id !== id) throw new Error('Wrong baseline')
    return { baseline: result, asOf: count(v['asOf']) }
  }
  return {
    list: (cursor?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/security/baselines',
        query: { limit: 20, cursor },
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, ['items', 'snapshot', 'nextCursor', 'asOf'])
          return {
            items: unique(array(v['items'], baseline), (r) => r.id),
            snapshot: uuid(v['snapshot']),
            nextCursor: nullable(v['nextCursor'], string),
            asOf: count(v['asOf']),
          }
        },
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/security/baselines/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => read(v, id),
      }),
    put: (id: string, body: Operation<BaselineDefinition>) =>
      transport.request({
        method: 'PUT',
        path: '/api/v1/mdm-candidate/security/baselines/{id}',
        pathParams: { id },
        body,
        successStatus: 200,
        decode(value) {
          const v = read(value, id)
          if (
            v.baseline.operation !== body.operationId ||
            v.baseline.revision !== body.expectedRevision + 1
          )
            throw new Error('Wrong baseline write receipt')
          return v
        },
      }),
    devices: (id: string, revision: number, cursor?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/security/baselines/{id}/devices',
        pathParams: { id },
        query: { revision, limit: 20, cursor },
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, [
            'baseline',
            'revision',
            'items',
            'snapshot',
            'nextCursor',
            'asOf',
          ])
          if (uuid(v['baseline']) !== id || count(v['revision']) !== revision)
            throw new Error('Wrong baseline projection')
          return {
            baseline: id,
            revision,
            items: unique(array(v['items'], baselineDevice), (r) => r.device),
            snapshot: uuid(v['snapshot']),
            nextCursor: nullable(v['nextCursor'], string),
            asOf: count(v['asOf']),
          }
        },
      }),
  }
}
