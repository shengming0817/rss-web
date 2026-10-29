import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// A local selector fence only. Original requests and recovery remain in their owning panels.
export const SelectionGuard = createContext<(panel: symbol, pending: boolean) => void>(() => {})
export function useSelectionGuard() {
  const [panels, setPanels] = useState<ReadonlySet<symbol>>(() => new Set())
  const register = useCallback((panel: symbol, pending: boolean) => {
    setPanels((current) => {
      if (current.has(panel) === pending) return current
      const next = new Set(current)
      if (pending) next.add(panel)
      else next.delete(panel)
      return next
    })
  }, [])
  return { locked: panels.size !== 0, register }
}
export function usePendingSelection(pending: boolean) {
  const register = useContext(SelectionGuard),
    panel = useRef(Symbol())
  useEffect(() => {
    register(panel.current, pending)
    return () => register(panel.current, false)
  }, [pending, register])
}
