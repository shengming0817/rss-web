import { inject, type Component, type InjectionKey } from 'vue'
import type { IdentitySession } from '@rss/auth'
import type { DeviceAccessClient, SecurityClient } from '@rss/device-access/client'
import type { Source } from '@rss/device-access/model'
import type { DaHost } from './config'
import type { WriteState } from './services/mutation'
export interface DaRuntime {
  session: IdentitySession
  client: DeviceAccessClient
  security: SecurityClient
  host: DaHost
  source: Source
  controls: Component | null
  writes: Map<string, WriteState>
}
export const daKey: InjectionKey<DaRuntime> = Symbol('device-access')
export function useDa() {
  const r = inject(daKey)
  if (!r) throw new Error('DA composition missing')
  return r
}
export function identityKey(session: IdentitySession) {
  const s = session.state.value
  return s.status === 'authenticated'
    ? [s.tenant, s.identity?.principalId, s.session?.id].join('/')
    : null
}
