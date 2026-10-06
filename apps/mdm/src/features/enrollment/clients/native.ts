import type { HttpTransport } from '@rss/api/mdm'
import { uuid } from '../../../services/decode'
import { attachment } from './binary'
export function createNativeClient(transport: HttpTransport) {
  return {
    profile: (id: string, password: string) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/enrollments/{id}/profile',
        pathParams: { id: uuid(id) },
        body: { password },
        responseType: 'arraybuffer',
        successStatus: 200,
        decode: (v) =>
          attachment(
            v,
            'application/x-apple-aspen-config',
            'RSS-MDM.mobileconfig',
            4 * 1024 * 1024,
          ),
      }),
  }
}
