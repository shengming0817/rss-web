import { inject, type InjectionKey } from 'vue'
import type { IdentitySession } from '@rss/auth'
import type { HttpTransport } from '@rss/api/mdm'
import type { createWorkspaceClient } from './services/workspace'
import type { createPolicyClients } from './features/policies/client'
import type { createDeviceClients } from './features/devices/client'
import type { createSoftwareClients } from './features/software/client'
import type { createSecurityClients } from './features/security/client'
import type { createOperationsClients } from './features/operations/client'
import type { createOnboardingClients } from './features/enrollment/client'
export interface MdmRuntime {
  session: IdentitySession
  transport: HttpTransport
  onboarding: ReturnType<typeof createOnboardingClients>
  workspace: ReturnType<typeof createWorkspaceClient>
  devices: ReturnType<typeof createDeviceClients>
  policies: ReturnType<typeof createPolicyClients>
  software: ReturnType<typeof createSoftwareClients>
  security: ReturnType<typeof createSecurityClients>
  operations: ReturnType<typeof createOperationsClients>
  tenant: string
  demo: boolean
}
export const mdmKey: InjectionKey<MdmRuntime> = Symbol('mdm')
export function useMdm() {
  const runtime = inject(mdmKey)
  if (!runtime) throw new Error('MDM bootstrap missing')
  return runtime
}
