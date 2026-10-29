import * as api from '@rss/api/mdm-operations'
import * as wireSchemas from '@rss/api/mdm-schemas'
import type { HttpTransport } from '@rss/api/mdm'
import { record, string, uuid } from './decode'
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
export function decodeWorkspace(value: unknown) {
  if (!wireSchemas.getApiV1MdmCandidateWorkspaceResponse.validateRoot(value))
    throw new Error('Invalid workspace')
  if (new Set(value.modules.map((module) => module.id)).size !== value.modules.length)
    throw new Error('Duplicate module')
  return value
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
    async read(): Promise<Workspace> {
      return api.getApiV1MdmCandidateWorkspace(transport, {}, decodeWorkspace)
    },
  }
}
