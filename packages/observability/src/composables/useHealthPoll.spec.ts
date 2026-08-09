import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useHealthPoll } from './useHealthPoll'

// Mock onScopeDispose to avoid "getCurrentInstance is null" warning in test env
// (same pattern as useGlobalShortcuts.spec.ts)
vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>()
  return {
    ...actual,
    onScopeDispose: vi.fn(),
  }
})

// Mock the health store so we can spy on refresh()
vi.mock('../stores/useHealthStore', () => {
  const mockRefresh = vi.fn().mockResolvedValue(undefined)
  const mockStore = { refresh: mockRefresh }
  return {
    useHealthStore: vi.fn(() => mockStore),
  }
})

// Pull these after mock setup to get the mocked versions
import { onScopeDispose } from 'vue'
import { useHealthStore } from '../stores/useHealthStore'

/** Helper: simulate document.hidden and dispatch visibilitychange event. */
function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, writable: true, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useHealthPoll', () => {
  // Track stop handles to clean up event listeners after each test, since
  // the mocked onScopeDispose doesn't actually invoke stop().
  let stopFns: Array<() => void> = []

  function poll(intervalMs?: number) {
    const handle = intervalMs !== undefined ? useHealthPoll(intervalMs) : useHealthPoll()
    stopFns.push(handle.stop)
    return handle
  }

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    stopFns = []
    // Ensure tab starts visible
    setHidden(false)
  })

  afterEach(() => {
    // Clean up all active event listeners and intervals from this test
    for (const stop of stopFns) stop()
    stopFns = []
    vi.useRealTimers()
    setHidden(false)
  })

  it('calls refresh() immediately on invocation', () => {
    const store = useHealthStore()
    poll()
    expect(store.refresh).toHaveBeenCalledOnce()
  })

  it('calls refresh() again after the interval elapses', () => {
    const store = useHealthStore()
    poll(5_000)
    expect(store.refresh).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(5_000)
    expect(store.refresh).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(5_000)
    expect(store.refresh).toHaveBeenCalledTimes(3)
  })

  it('uses default interval of 30 000 ms', () => {
    const store = useHealthStore()
    poll()
    expect(store.refresh).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(29_999)
    expect(store.refresh).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    expect(store.refresh).toHaveBeenCalledTimes(2)
  })

  it('registers onScopeDispose for cleanup', () => {
    poll()
    expect(onScopeDispose).toHaveBeenCalledOnce()
    expect(onScopeDispose).toHaveBeenCalledWith(expect.any(Function))
  })

  it('stop() prevents further refresh calls after being called', () => {
    const store = useHealthStore()
    const { stop } = poll(5_000)
    expect(store.refresh).toHaveBeenCalledTimes(1)

    stop()
    vi.advanceTimersByTime(10_000)
    // No additional calls after stop()
    expect(store.refresh).toHaveBeenCalledTimes(1)
  })

  it('returns { stop } handle', () => {
    const result = poll()
    expect(result).toHaveProperty('stop')
    expect(typeof result.stop).toBe('function')
  })

  it('stop() is the same function registered with onScopeDispose', () => {
    const { stop } = poll()
    const disposeFn = vi.mocked(onScopeDispose).mock.calls[0]?.[0]
    expect(disposeFn).toBe(stop)
  })

  // ─── visibility pause / resume ────────────────────────────────────────────

  it('pauses polling when tab becomes hidden', () => {
    const store = useHealthStore()
    poll(5_000)
    expect(store.refresh).toHaveBeenCalledTimes(1)

    // Tab goes hidden: interval should be cleared
    setHidden(true)
    vi.advanceTimersByTime(10_000)
    // No additional ticks while hidden
    expect(store.refresh).toHaveBeenCalledTimes(1)
  })

  it('fires an immediate refresh and resumes polling when tab becomes visible again', () => {
    const store = useHealthStore()
    poll(5_000)
    expect(store.refresh).toHaveBeenCalledTimes(1)

    // Hide tab then show it again
    setHidden(true)
    vi.advanceTimersByTime(10_000)
    setHidden(false) // dispatches visibilitychange with hidden=false

    // Immediate refresh on visibility-resume
    expect(store.refresh).toHaveBeenCalledTimes(2)

    // And interval polling resumes
    vi.advanceTimersByTime(5_000)
    expect(store.refresh).toHaveBeenCalledTimes(3)
  })

  it('stop() removes the visibilitychange listener', () => {
    const store = useHealthStore()
    const { stop } = poll(5_000)

    // stop() should also remove the listener — remove it from stopFns to avoid double-call
    stopFns = stopFns.filter((fn) => fn !== stop)
    stop()
    setHidden(false)
    expect(store.refresh).toHaveBeenCalledTimes(1) // only the initial call
  })
})
