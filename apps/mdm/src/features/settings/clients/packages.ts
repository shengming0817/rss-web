import type { HttpTransport } from '@rss/api/mdm'
import { array, uuid, unique } from '../../../services/decode'
import { installer } from '../../enrollment/clients/packages'
export function createManagedPackages(transport: HttpTransport, tenant: string) {
  return {
    read: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/agent-packages',
        successStatus: 200,
        decode: (v) =>
          unique(
            array(v, (item) => installer(item, tenant)),
            (p) => p.releaseId,
          ),
      }),
    withdraw: (id: string, release: string) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/agent-packages/{id}/withdraw',
        pathParams: { id: uuid(release) },
        body: { operationId: uuid(id) },
        successStatus: 204,
      }),
  }
}
