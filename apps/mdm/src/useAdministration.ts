import { useMemo } from 'react'
import type { Runtime } from './runtime'
/** App keys the authenticated feature subtree by tenant, principal and session. */
export function useAdministration(runtime: Runtime) {
  return useMemo(() => runtime.administration(), [runtime])
}
