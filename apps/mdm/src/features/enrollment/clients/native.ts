import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import { uuid } from '../../../services/decode'
import { attachment } from './binary'
export function createNativeClient(transport: HttpTransport) {
  return {
    profile: (id: string, password: string) =>
      api.postApiV1EnrollmentsByIdProfile(
        transport,
        { pathParams: { id: uuid(id) }, body: { password } },
        (v) =>
          attachment(
            v,
            'application/x-apple-aspen-config',
            'RSS-MDM.mobileconfig',
            4 * 1024 * 1024,
          ),
      ),
  }
}
