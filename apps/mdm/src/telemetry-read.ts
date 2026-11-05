import { createContext, useContext, useEffect } from 'react'
import { codeOf, useRead } from './AdminUi'
export const TelemetryDenied = createContext<() => void>(() => {})
/** A server denial clears all sibling telemetry facts, not just the failed result. */
export function useTelemetryRead<T>(key: string, load: () => Promise<T>) {
  const state = useRead(key, load),
    deny = useContext(TelemetryDenied)
  useEffect(() => {
    const e = state.error
    if (
      e &&
      typeof e === 'object' &&
      (('status' in e && (e.status === 401 || e.status === 403)) ||
        ['forbidden', 'permission_denied', 'insufficient_privilege'].includes(codeOf(e)))
    )
      deny()
  }, [state.error, deny])
  return state
}
