import { createContext, useContext, useSyncExternalStore, type ComponentType } from 'react'
import type { SessionOwner, AuthenticationFlows } from '@rss/auth-core'
import type { DeviceAccessClient, SecurityClient } from '@rss/device-access/client'
import type { Source } from '@rss/device-access/model'
import type { DaHost } from './config'
export interface WriteState {
  id: string
  state: 'idle' | 'busy' | 'unknown' | 'accepted'
  message: string
  proof: boolean
  review: boolean
}
export interface DaRuntime {
  session: SessionOwner
  flows: AuthenticationFlows
  client: DeviceAccessClient
  security: SecurityClient
  host: DaHost
  source: Source
  controls: ComponentType | null
  writes: Map<string, WriteState>
}
export const DaContext = createContext<DaRuntime | null>(null)
export function useDa() {
  const value = useContext(DaContext)
  if (!value) throw new Error('DA composition missing')
  return value
}
export function identityKey(session: SessionOwner) {
  const s = session.getSnapshot()
  return s.status === 'authenticated'
    ? [s.tenant, s.identity?.principalId, s.session?.id].join('/')
    : null
}
export function useIdentity() {
  const r = useDa()
  return useSyncExternalStore(r.session.subscribe, r.session.getSnapshot)
}
