import type { HttpTransport } from '@rss/api/mdm'
import { inject, type InjectionKey } from 'vue'
import type { MdmRuntime } from '../src/context'
import type { createSecurityClients } from './features/security/client'
import type { createOperationsClients } from './features/operations/client'
export interface DemoRuntime extends Omit<MdmRuntime, 'security' | 'operations'> {
  transport: HttpTransport
  security: ReturnType<typeof createSecurityClients>
  operations: ReturnType<typeof createOperationsClients>
}
export const demoKey: InjectionKey<DemoRuntime> = Symbol('mdm-demo')
export function useDemo() {
  const runtime = inject(demoKey)
  if (!runtime) throw new Error('Explicit demo composition missing')
  return runtime
}
