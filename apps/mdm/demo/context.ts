import { inject, type InjectionKey } from 'vue'
import type { MdmRuntime } from '../src/context'
import type { createPolicyClients } from './features/policies/client'
import type { createSecurityClients } from './features/security/client'
import type { createOperationsClients } from './features/operations/client'
export interface DemoRuntime extends Omit<MdmRuntime, 'policies' | 'security' | 'operations'> {
  policies: ReturnType<typeof createPolicyClients>
  security: ReturnType<typeof createSecurityClients>
  operations: ReturnType<typeof createOperationsClients>
}
export const demoKey: InjectionKey<DemoRuntime> = Symbol('mdm-demo')
export function useDemo() {
  const runtime = inject(demoKey)
  if (!runtime) throw new Error('Explicit demo composition missing')
  return runtime
}
