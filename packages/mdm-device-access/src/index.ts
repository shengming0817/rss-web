import type { DirectoryQuery, Page } from '@rss/mdm-devices'
import { uuid } from '@rss/mdm-inventory'
export interface Binding {
  readonly id: string
  readonly operationId: string
  readonly device: string
  readonly registration: string
  readonly registrationGeneration: number
  readonly bindingGeneration: number
  readonly factorGeneration: number
  readonly revision: number
  readonly serverState: 'pending' | 'active' | 'revoked'
  readonly policy: string
  readonly policyVersion: string
  readonly receivedRevision: number | null
  readonly appliedRevision: number | null
  readonly effect: 'applied' | 'whfb_retired' | 'unbound' | 'unknown' | 'failed' | null
}
export interface EnterpriseRecord {
  readonly id: string
  readonly kind: 'relying_party' | 'subject' | 'windows_key'
  readonly revision: number
  readonly enabled: boolean | null
  readonly reference: string
}
export interface DeviceAccessPort {
  bindings(device: string, query: DirectoryQuery): Promise<Page<Binding>>
  binding(device: string, id: string): Promise<Binding>
  operation(device: string, id: string): Promise<Binding>
  enterprise(query: DirectoryQuery): Promise<Page<EnterpriseRecord>>
}
function device(value: string) {
  if (!value || value.length > 512 || /\p{Cc}/u.test(value)) throw new Error('Invalid device')
  return value
}
export function createDeviceAccess(port: DeviceAccessPort) {
  return Object.freeze({
    bindings: (id: string, query: DirectoryQuery = {}) => port.bindings(device(id), query),
    async binding(target: string, id: string) {
      const value = await port.binding(device(target), uuid(id))
      if (value.device !== target || value.id !== id) throw new Error('Wrong binding')
      return value
    },
    async operation(target: string, id: string) {
      const value = await port.operation(device(target), uuid(id))
      if (value.device !== target || value.operationId !== id)
        throw new Error('Wrong binding operation')
      return value
    },
    enterprise: (query: DirectoryQuery = {}) => port.enterprise(query),
  })
}
