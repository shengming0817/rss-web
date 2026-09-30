import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import { array, count, nullable, string, unique, uuid } from '../../../services/decode'
import { candidate } from './candidate'
import { certificate } from './certificates-model'
export function createCertificatesClient(transport: HttpTransport, tenant: string, demo: boolean) {
  function detail(value: unknown, id: string) {
    const v = candidate(value, tenant, demo, ['certificate', 'asOf']),
      c = certificate(v['certificate']),
      asOf = count(v['asOf'])
    if (c.id !== id || c.evaluatedAt > asOf) throw new Error('Wrong certificate response')
    return { certificate: c, asOf }
  }
  return {
    list: (device?: string, cursor?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/security/certificates',
        query: { device, limit: 20, cursor },
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, ['items', 'snapshot', 'nextCursor', 'asOf']),
            asOf = count(v['asOf']),
            items = unique(array(v['items'], certificate), (c) => c.id)
          if (items.some((c) => (device && c.device !== device) || c.evaluatedAt > asOf))
            throw new Error('Wrong certificate page')
          return {
            items,
            snapshot: uuid(v['snapshot']),
            nextCursor: nullable(v['nextCursor'], string),
            asOf,
          }
        },
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/security/certificates/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => detail(v, id),
      }),
    issue: (id: string, body: Operation<Record<string, never>>) =>
      transport.request({
        method: 'POST',
        path: '/api/mdm-candidate/v1/security/certificates/{id}/issue',
        pathParams: { id },
        body,
        successStatus: 200,
        decode(value) {
          const result = detail(value, id),
            c = result.certificate
          if (
            c.revision !== body.expectedRevision + 1 ||
            c.issuance?.operation !== body.operationId ||
            c.issuance.state !== 'requested'
          )
            throw new Error('Wrong issuance receipt')
          return result
        },
      }),
  }
}
