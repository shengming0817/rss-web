import type { RouteLocationRaw } from 'vue-router'
import { inject, type InjectionKey } from 'vue'
import type { IdentitySession } from './services/session'
import type { IdentityApi } from './services/api'
import type { createFlows } from './services/flow'
export interface HostLogin {
  path: string
  tenant: string
  brand: string
  descriptionKey: string
  origin: string
  switchHref: string
  switchLabelKey: string
}
export function loginTarget(tenant: string | null, host?: HostLogin): RouteLocationRaw {
  return host ? { name: 'login' } : { name: 'login', params: { tenant } }
}
export interface Runtime {
  landingTarget?: (tenant: string) => RouteLocationRaw
  hostLogin?: HostLogin
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
