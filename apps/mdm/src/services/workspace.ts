import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import { array, enumeration, record, string, uuid } from './decode'
export const moduleIds = ['devices', 'policies', 'software', 'security', 'operations'] as const
export type ModuleId = (typeof moduleIds)[number]
export type Source = 'real' | 'mock'
export interface ModuleState {
  id: ModuleId
  source: Source
  available: boolean | null
}
export interface Workspace {
  modules: ModuleState[]
}
export function decodeWorkspace(value: unknown): Workspace {
  const v = record(value)
  const modules = array(v['modules'], (item) => {
    const m = record(item)
    if (m['available'] !== null && typeof m['available'] !== 'boolean')
      throw new Error('Invalid navigation')
    return {
      id: enumeration(m['id'], moduleIds),
      source: enumeration(m['source'], ['real', 'mock'] as const),
      available: m['available'],
    }
  })
  if (new Set(modules.map((m) => m.id)).size !== modules.length) throw new Error('Duplicate module')
  return { modules }
}
export function decodeMdmConfig(value: unknown, origin: string) {
  const v = record(value)
  if (Object.keys(v).sort().join() !== 'canonicalOrigin,managementTenant,serviceId,tenant')
    throw new Error('Invalid config')
  const canonicalOrigin = string(v['canonicalOrigin'])
  if (canonicalOrigin !== origin || new URL(canonicalOrigin).protocol !== 'https:')
    throw new Error('Invalid origin')
  const tenant = uuid(v['tenant']),
    managementTenant = uuid(v['managementTenant'])
  if (tenant === managementTenant) throw new Error('Invalid tenant binding')
  return { canonicalOrigin, tenant, managementTenant, serviceId: uuid(v['serviceId']) }
}
export function createWorkspaceClient(transport: HttpTransport) {
  return {
    async read() {
      return api.getApiV1MdmCandidateWorkspace(transport, {}, (value) => {
        const workspace = decodeWorkspace(value)
        if (workspace.modules.some((m) => m.source !== 'real'))
          throw new Error('Unexpected simulated data')
        return workspace
      })
    },
  }
}
