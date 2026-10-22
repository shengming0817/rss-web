/** Private, admitted software bytes through the sole authenticated executor. */
import type { HttpTransport } from '@rss/api/mdm'
import { record } from '../../../services/decode'
import type { UploadTarget } from '../../policies/clients/resources'
export function createSoftwareContentClient(transport: HttpTransport) {
  return {
    read: (id: string, target: UploadTarget, signal?: AbortSignal) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/software/resources/{id}/versions/{version}/content',
        pathParams: { id, version: target.version },
        query: {
          platform: target.platform,
          architecture: target.architecture,
          variant: target.variant,
          artifact: target.artifact,
        },
        responseType: 'arraybuffer',
        successStatus: 200,
        ...(signal ? { signal } : {}),
        decode(value) {
          const v = record(value)
          if (!(v['bytes'] instanceof ArrayBuffer)) throw new Error('Invalid software content')
          return v['bytes']
        },
      }),
  }
}
