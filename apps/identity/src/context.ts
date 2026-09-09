import { inject, type InjectionKey } from 'vue'
import type { IdentitySession } from './services/session'
import type { IdentityApi } from './services/api'
import type { createFlows } from './services/flow'
export interface Runtime {
  session: IdentitySession
  api: IdentityApi
  flows: ReturnType<typeof createFlows>
}
export const runtimeKey: InjectionKey<Runtime> = Symbol('identity-runtime')
export function useIdentity() {
  const value = inject(runtimeKey)
  if (!value) throw new Error('Identity bootstrap missing')
  return value
}
