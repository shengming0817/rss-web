import { onScopeDispose } from 'vue'
import { useHealthStore } from '../stores/useHealthStore'

/**
 * useHealthPoll — polls the health store on a fixed interval.
 *
 * Calls refresh() immediately on invocation, then repeats every `intervalMs`.
 * Pauses polling while the browser tab is hidden (visibilitychange) to avoid
 * wasted requests; resumes and fires one immediate refresh when the tab
 * becomes visible again.
 *
 * The interval + event listener are cleared in onScopeDispose (component/scope
 * unmount) and can also be stopped manually via the returned `stop` handle.
 *
 * @param intervalMs - Polling interval in milliseconds (default 30 000).
 * @returns          - `{ stop }` for manual teardown before scope disposal.
 */
export function useHealthPoll(intervalMs = 30_000): { stop: () => void } {
  const store = useHealthStore()

  let timerId: ReturnType<typeof setInterval> | null = null

  function startInterval(): void {
    if (timerId !== null) return
    timerId = setInterval(() => {
      void store.refresh()
    }, intervalMs)
  }

  function clearCurrentInterval(): void {
    if (timerId !== null) {
      clearInterval(timerId)
      timerId = null
    }
  }

  function handleVisibilityChange(): void {
    if (document.hidden) {
      clearCurrentInterval()
    } else {
      // Tab became visible: refresh immediately and restart interval.
      void store.refresh()
      startInterval()
    }
  }

  // Fire immediately so the UI has data before the first interval fires.
  void store.refresh()
  startInterval()

  document.addEventListener('visibilitychange', handleVisibilityChange)

  function stop(): void {
    clearCurrentInterval()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }

  onScopeDispose(stop)

  return { stop }
}
