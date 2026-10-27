import type { HttpTransport } from '@rss/api/mdm'
import { decodeWorkspace } from '../src/services/workspace'
/** Unpublished synthetic navigation remains exclusively in the explicit demo composition. */
export function createDemoWorkspaceClient(transport: HttpTransport) {
  return {
    read: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/workspace',
        successStatus: 200,
        decode(value) {
          const workspace = decodeWorkspace(value)
          if (workspace.modules.some((module) => module.source !== 'mock'))
            throw new Error('Explicit synthetic workspace required')
          return workspace
        },
      }),
  }
}
