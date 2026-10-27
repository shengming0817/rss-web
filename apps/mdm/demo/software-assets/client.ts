/** This client is imported only by the explicit demo composition. No production API is implied. */
import type { HttpTransport } from '@rss/api/mdm'
import { detail, receipt, result, snapshot, type Change, type Filters, type Mode } from './model'
const path = '/api/v1/mdm-candidate/software/assets-demo'
export function createSoftwareAssetsDemoClient(transport: HttpTransport) {
  return {
    read: () => transport.request({ method: 'GET', path, successStatus: 200, decode: snapshot }),
    change: (operationId: string, change: Change) =>
      transport.request({
        method: 'POST',
        path: `${path}/changes`,
        body: { operationId, change },
        successStatus: 200,
        decode(value) {
          const r = receipt(value)
          if (r.operationId !== operationId || r.target !== change.id || r.kind !== change.kind)
            throw new Error('Wrong mock receipt')
          return r
        },
      }),
    receipt: (operationId: string) =>
      transport.request({
        method: 'GET',
        path: `${path}/receipts/{operationId}`,
        pathParams: { operationId },
        successStatus: 200,
        decode(value) {
          const r = receipt(value)
          if (r.operationId !== operationId) throw new Error('Wrong mock receipt')
          return r
        },
      }),
    collection: (mode: Mode) =>
      transport.request({
        method: 'POST',
        path: `${path}/collection`,
        body: { mode },
        successStatus: 200,
        decode: snapshot,
      }),
    query: (filters: Filters) =>
      transport.request({
        method: 'POST',
        path: `${path}/queries`,
        query: { limit: 2 },
        body: filters,
        successStatus: 200,
        decode: result,
      }),
    page: (id: string, cursor?: string) =>
      transport.request({
        method: 'GET',
        path: `${path}/queries/{id}`,
        pathParams: { id },
        query: { cursor, limit: 2 },
        successStatus: 200,
        decode(value) {
          const r = result(value)
          if (r.id !== id) throw new Error('Wrong mock query')
          return r
        },
      }),
    details: (id: string, bucket: string, cursor?: string) =>
      transport.request({
        method: 'GET',
        path: `${path}/queries/{id}/buckets/{bucket}`,
        pathParams: { id, bucket },
        query: { cursor, limit: 1 },
        successStatus: 200,
        decode(value) {
          const d = detail(value)
          if (d.queryId !== id || d.bucketId !== bucket) throw new Error('Wrong mock detail')
          return d
        },
      }),
  }
}
