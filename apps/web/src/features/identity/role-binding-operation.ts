import type { RoleId, RolesApi } from '@rss/identity'

export type RoleBindingAction = 'assign' | 'revoke'
export type RoleBindingOperationState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'confirming'
      readonly action: RoleBindingAction
      readonly roleId: RoleId
      readonly subject: string
    }
  | { readonly status: 'submitting'; readonly action: RoleBindingAction }
  | { readonly status: 'receipt'; readonly action: RoleBindingAction; readonly result: boolean }
  | { readonly status: 'error'; readonly action: RoleBindingAction; readonly error: unknown }

export interface RoleBindingOperation {
  getState(): RoleBindingOperationState
  subscribe(listener: (state: RoleBindingOperationState) => void): () => void
  prepare(action: RoleBindingAction, roleId: RoleId, subject: string): void
  cancel(): void
  confirm(): Promise<void>
  reset(): void
  dispose(): void
}

const IDLE: RoleBindingOperationState = Object.freeze({ status: 'idle' })

type RoleCommandPort = Pick<RolesApi, 'assign' | 'revoke'>

export function createRoleBindingOperation(api: RoleCommandPort): RoleBindingOperation {
  const listeners = new Set<(state: RoleBindingOperationState) => void>()
  let state = IDLE
  let snapshot: { action: RoleBindingAction; roleId: RoleId; subject: string } | undefined
  let controller: AbortController | undefined
  let inFlight: Promise<void> | undefined
  let generation = 0
  let disposed = false

  function publish(next: RoleBindingOperationState) {
    state = Object.freeze(next)
    for (const listener of listeners) listener(state)
  }

  function reset() {
    generation += 1
    controller?.abort()
    controller = undefined
    inFlight = undefined
    snapshot = undefined
    if (!disposed) publish(IDLE)
  }

  return Object.freeze({
    getState: () => state,
    subscribe(listener: (state: RoleBindingOperationState) => void) {
      if (disposed) return () => undefined
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    prepare(action: RoleBindingAction, roleId: RoleId, subject: string) {
      if (disposed || inFlight !== undefined) return
      snapshot = Object.freeze({ action, roleId, subject })
      publish({ status: 'confirming', ...snapshot })
    },
    cancel() {
      if (state.status === 'confirming') reset()
    },
    confirm() {
      if (inFlight !== undefined) return inFlight
      if (state.status !== 'confirming' || snapshot === undefined) return Promise.resolve()
      const request = snapshot
      snapshot = undefined
      const current = generation
      controller = new AbortController()
      const requestController = controller
      publish({ status: 'submitting', action: request.action })
      const pending = (async () => {
        try {
          const result =
            request.action === 'assign'
              ? (
                  await api.assign(
                    request.roleId,
                    { subject: request.subject },
                    { signal: requestController.signal },
                  )
                ).data.assigned
              : (
                  await api.revoke(request.roleId, request.subject, {
                    signal: requestController.signal,
                  })
                ).data.revoked
          if (current !== generation || disposed) return
          publish({ status: 'receipt', action: request.action, result })
        } catch (error: unknown) {
          if (current === generation && !requestController.signal.aborted) {
            publish({ status: 'error', action: request.action, error })
          }
        }
      })()
      inFlight = pending
      void pending.finally(() => {
        if (inFlight === pending) inFlight = undefined
      })
      return pending
    },
    reset,
    dispose() {
      if (disposed) return
      reset()
      disposed = true
      listeners.clear()
    },
  })
}
