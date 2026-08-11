import type { PolicyGetResponse, PolicyId, PolicyView } from '@rss/identity'

export type PolicyDetailState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly policyId: PolicyId }
  | { readonly status: 'ready'; readonly policy: PolicyView }
  | { readonly status: 'error'; readonly policyId: PolicyId; readonly error: unknown }

type DetailLoader = (policyId: PolicyId, signal: AbortSignal) => Promise<PolicyGetResponse>

export function createPolicyDetail(load: DetailLoader) {
  const listeners = new Set<(state: PolicyDetailState) => void>()
  let state: PolicyDetailState = Object.freeze({ status: 'idle' })
  let generation = 0
  let controller: AbortController | undefined
  let disposed = false

  function publish(next: PolicyDetailState) {
    state = Object.freeze(next)
    for (const listener of listeners) listener(state)
  }

  async function select(policyId: PolicyId) {
    if (disposed) return
    generation += 1
    const current = generation
    controller?.abort()
    controller = new AbortController()
    const requestController = controller
    publish({ status: 'loading', policyId })
    try {
      const response = await load(policyId, requestController.signal)
      if (current === generation && !disposed) publish({ status: 'ready', policy: response.data })
    } catch (error: unknown) {
      if (current === generation && !requestController.signal.aborted && !disposed)
        publish({ status: 'error', policyId, error })
    }
  }

  return Object.freeze({
    getState: () => state,
    subscribe(listener: (state: PolicyDetailState) => void) {
      if (disposed) return () => undefined
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    select,
    reset() {
      generation += 1
      controller?.abort()
      controller = undefined
      if (!disposed) publish({ status: 'idle' })
    },
    dispose() {
      if (disposed) return
      generation += 1
      controller?.abort()
      disposed = true
      listeners.clear()
    },
  })
}
