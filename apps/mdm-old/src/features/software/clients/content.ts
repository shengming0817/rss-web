import * as api from '@rss/api/mdm-operations'
/** Private, admitted software bytes through the sole authenticated executor. */
import type { HttpTransport } from '@rss/api/mdm'

import type { UploadTarget } from '../../policies/clients/resources'
export function createSoftwareContentClient(transport: HttpTransport) {
  return {
    read: (id: string, target: UploadTarget, signal?: AbortSignal) =>
      api.getApiV1SoftwareResourcesByIdVersionsByVersionContent(
        transport,
        {
          pathParams: { id, version: target.version },
          query: {
            platform: target.platform,
            architecture: target.architecture,
            variant: target.variant,
            artifact: target.artifact,
          },
          ...(signal ? { signal } : {}),
        },
        (value) => {
          const v = value
          if (!(v['bytes'] instanceof ArrayBuffer)) throw new Error('Invalid software content')
          return v['bytes']
        },
      ),
  }
}
