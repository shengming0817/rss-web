import type { HttpTransport } from '@rss/api/mdm'
import { moduleIds, type Workspace } from '../src/services/workspace'
import { array, enumeration, record } from '../src/services/decode'
export function decodeDemoWorkspace(value: unknown): Workspace {
  const modules = array(record(value)['modules'], (item) => {
    const m = record(item)
    if (m['source'] !== 'mock' || (m['available'] !== null && typeof m['available'] !== 'boolean'))
      throw new Error('Invalid synthetic navigation')
    return {
      id: enumeration(m['id'], moduleIds),
      source: 'mock' as const,
      available: m['available'],
    }
  })
  if (new Set(modules.map((m) => m.id)).size !== modules.length) throw new Error('Duplicate module')
  return { modules }
}
/** Unpublished synthetic navigation remains exclusively in the explicit demo composition. */
export function createDemoWorkspaceClient(transport: HttpTransport) {
  return {
    read: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/workspace',
        successStatus: 200,
        decode(value) {
          const workspace = decodeDemoWorkspace(value)
          if (workspace.modules.some((module) => module.source !== 'mock'))
            throw new Error('Explicit synthetic workspace required')
          return workspace
        },
      }),
  }
}
