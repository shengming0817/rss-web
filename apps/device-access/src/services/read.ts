import { useCallback, useEffect, useRef, useState } from 'react'
import { identityKey, useDa, useIdentity } from '../context'
import { errorMessage } from './status'
/** Requests and exposed data are bound to the current session and object, including before effect cleanup. */
export function useRead<T>(
  load: (signal: AbortSignal) => Promise<T>,
  dependency = '',
  enabled = true,
) {
  const r = useDa()
  useIdentity()
  const scope = `${identityKey(r.session)}/${dependency}`
  const current = useRef({ scope, load, enabled })
  current.current = { scope, load, enabled }
  const request = useRef<{ controller: AbortController; epoch: number } | null>(null)
  const epoch = useRef(0)
  const [state, setState] = useState<{
    scope: string
    data: T | undefined
    busy: boolean
    error: string
  }>({ scope, data: undefined, busy: false, error: '' })
  const reset = useCallback(() => {
    epoch.current++
    request.current?.controller.abort()
    request.current = null
    setState({ scope: current.current.scope, data: undefined, busy: false, error: '' })
  }, [])
  const reload = useCallback(async () => {
    reset()
    const start = current.current,
      version = epoch.current,
      identity = identityKey(r.session)
    if (!identityKey(r.session)) return
    const controller = new AbortController()
    request.current = { controller, epoch: version }
    setState({ scope: start.scope, data: undefined, busy: true, error: '' })
    const valid = () =>
      version === epoch.current &&
      current.current.scope === start.scope &&
      identity !== null &&
      identityKey(r.session) === identity &&
      !controller.signal.aborted
    try {
      const data = await start.load(controller.signal)
      if (valid()) {
        setState({ scope: start.scope, data, busy: false, error: '' })
        return data
      }
    } catch (error) {
      if (valid())
        setState({ scope: start.scope, data: undefined, busy: false, error: errorMessage(error) })
    }
    return undefined
  }, [r, reset])
  useEffect(() => {
    if (enabled) void reload()
    else reset()
    return () => {
      epoch.current++
      request.current?.controller.abort()
    }
  }, [scope, enabled, reload])
  return {
    data: state.scope === scope ? state.data : undefined,
    busy: state.scope === scope && state.busy,
    error: state.scope === scope ? state.error : '',
    reload,
    reset,
  }
}
