import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import { array, count, nullable, string, unique, uuid } from '../../../services/decode'
import { candidate } from './candidate'
import { risk, riskAssessment } from './risks-model'
export function createRisksClient(transport: HttpTransport, tenant: string, demo: boolean) {
  function assessment(value: unknown, id: string, device: string) {
    const result = riskAssessment(value)
    if (result.risk !== id || result.device !== device) throw new Error('Wrong risk assessment')
    return result
  }
  function page<T>(value: unknown, decode: (v: unknown) => T, key: (v: T) => string) {
    const v = candidate(value, tenant, demo, ['items', 'snapshot', 'nextCursor', 'asOf'])
    return {
      items: unique(array(v['items'], decode), key),
      snapshot: uuid(v['snapshot']),
      nextCursor: nullable(v['nextCursor'], string),
      asOf: count(v['asOf']),
    }
  }
  return {
    list: (cursor?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/security/risks',
        query: { limit: 20, cursor },
        successStatus: 200,
        decode: (v) => page(v, risk, (r) => r.id),
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/security/risks/{id}',
        pathParams: { id },
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, ['risk', 'asOf']),
            result = risk(v['risk'])
          if (result.id !== id) throw new Error('Wrong risk')
          return { risk: result, asOf: count(v['asOf']) }
        },
      }),
    devices: (id: string, cursor?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/security/risks/{id}/devices',
        pathParams: { id },
        query: { limit: 20, cursor },
        successStatus: 200,
        decode: (v) =>
          page(
            v,
            (value) => {
              const a = riskAssessment(value)
              if (a.risk !== id) throw new Error('Wrong risk')
              return a
            },
            (a) => a.device,
          ),
      }),
    current: (id: string, device: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/security/risks/{id}/devices/{device}',
        pathParams: { id, device },
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, ['assessment', 'asOf'])
          return { assessment: assessment(v['assessment'], id, device), asOf: count(v['asOf']) }
        },
      }),
    history: (id: string, device: string, cursor?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/security/risks/{id}/devices/{device}/history',
        pathParams: { id, device },
        query: { limit: 20, cursor },
        successStatus: 200,
        decode: (v) =>
          page(
            v,
            (value) => assessment(value, id, device),
            (a) => a.id,
          ),
      }),
    reassess: (id: string, device: string, body: Operation<Record<string, never>>) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/mdm-candidate/security/risks/{id}/devices/{device}/reassess',
        pathParams: { id, device },
        body,
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, ['assessment', 'operation', 'asOf']),
            a = assessment(v['assessment'], id, device)
          if (uuid(v['operation']) !== body.operationId || a.version !== body.expectedRevision + 1)
            throw new Error('Wrong risk reassessment receipt')
          return { assessment: a, asOf: count(v['asOf']) }
        },
      }),
  }
}
