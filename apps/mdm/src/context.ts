import { inject, type InjectionKey } from 'vue'
import type { IdentitySession } from '@rss/auth'
import type { HttpTransport } from '@rss/api/mdm'
import type { createWorkspaceClient } from './services/workspace'
import type { createPolicyClients } from './features/policies/client'
import type { createDeviceClients } from './features/devices/client'
export interface MdmRuntime {
  session: IdentitySession
  transport: HttpTransport
  workspace: ReturnType<typeof createWorkspaceClient>
  devices: ReturnType<typeof createDeviceClients>
  policies: ReturnType<typeof createPolicyClients>
  tenant: string
  demo: boolean
}
export const mdmKey: InjectionKey<MdmRuntime> = Symbol('mdm')
export function useMdm() {
  const runtime = inject(mdmKey)
  if (!runtime) throw new Error('MDM bootstrap missing')
  return runtime
}
