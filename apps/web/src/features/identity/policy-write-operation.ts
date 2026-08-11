import { isRssApiError } from '@rss/api'
import {
  createPolicyDeactivateRequest,
  createPolicyUpdateRequest,
  parsePolicyCreateRequest,
  type PolicyCreateRequest,
  type PolicyDeactivateResponse,
  type PolicyId,
  type PolicyUpdateRequest,
  type PolicyView,
  type PolicyWriteFields,
} from '@rss/identity'

declare const commandBrand: unique symbol

export type PolicyWriteCommand =
  | Readonly<{
      action: 'create'
      request: PolicyCreateRequest
      [commandBrand]: true
    }>
  | Readonly<{
      action: 'update'
      policyId: PolicyId
      request: PolicyUpdateRequest
      [commandBrand]: true
    }>
  | Readonly<{
      action: 'deactivate'
      policyId: PolicyId
      request: ReturnType<typeof createPolicyDeactivateRequest>
      [commandBrand]: true
    }>

export type PolicyWriteReceipt =
  | Readonly<{
      action: 'create'
      command: Extract<PolicyWriteCommand, { action: 'create' }>
      result: PolicyView
    }>
  | Readonly<{
      action: 'update'
      command: Extract<PolicyWriteCommand, { action: 'update' }>
      result: PolicyView
    }>
  | Readonly<{
      action: 'deactivate'
      command: Extract<PolicyWriteCommand, { action: 'deactivate' }>
      result: PolicyDeactivateResponse['data']
    }>
export type PolicyWriteState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'confirming'; command: PolicyWriteCommand }>
  | Readonly<{ status: 'submitting'; command: PolicyWriteCommand }>
  | (Readonly<{ status: 'success' }> & PolicyWriteReceipt)
  | Readonly<{
      status: 'conflict' | 'unknown' | 'error'
      command: PolicyWriteCommand
      error: unknown
    }>

type Execute = (command: PolicyWriteCommand, signal: AbortSignal) => Promise<PolicyWriteReceipt>

export function createPolicyCreateCommand(value: unknown): PolicyWriteCommand {
  return Object.freeze({
    action: 'create',
    request: parsePolicyCreateRequest(value),
  }) as PolicyWriteCommand
}

export function createPolicyUpdateCommand(
  snapshot: PolicyView,
  fields: PolicyWriteFields,
): PolicyWriteCommand {
  return Object.freeze({
    action: 'update',
    policyId: snapshot.policyId,
    request: createPolicyUpdateRequest(snapshot, fields),
  }) as PolicyWriteCommand
}

export function createPolicyDeactivateCommand(snapshot: PolicyView): PolicyWriteCommand {
  return Object.freeze({
    action: 'deactivate',
    policyId: snapshot.policyId,
    request: createPolicyDeactivateRequest(snapshot),
  }) as PolicyWriteCommand
}

export function classifyPolicyWriteFailure(error: unknown): 'conflict' | 'unknown' | 'error' {
  if (!isRssApiError(error)) return 'unknown'
  if (error.cause === 'wire' && error.status === 409) return 'conflict'
  if (
    error.cause === 'network' ||
    error.cause === 'timeout' ||
    error.cause === 'protocol' ||
    error.cause === 'aborted' ||
    (error.cause === 'wire' &&
      (error.status === 500 ||
        (error.status === 503 && error.code !== 'ERR_CORE_PROVIDER_UNAVAILABLE')))
  ) {
    return 'unknown'
  }
  return 'error'
}

export function createPolicyWriteOperation(execute: Execute) {
  const listeners = new Set<(state: PolicyWriteState) => void>()
  let state: PolicyWriteState = Object.freeze({ status: 'idle' })
  let generation = 0
  let controller: AbortController | undefined
  let disposed = false

  function publish(next: PolicyWriteState) {
    state = Object.freeze(next)
    for (const listener of listeners) listener(state)
  }

  return Object.freeze({
    getState: () => state,
    subscribe(listener: (state: PolicyWriteState) => void) {
      if (disposed) return () => undefined
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    prepare(command: PolicyWriteCommand) {
      if (
        disposed ||
        state.status === 'submitting' ||
        state.status === 'conflict' ||
        state.status === 'unknown'
      )
        return
      publish({ status: 'confirming', command })
    },
    cancel() {
      if (state.status === 'confirming') publish({ status: 'idle' })
    },
    async submit() {
      if (disposed || state.status !== 'confirming') return
      const command = state.command
      const current = ++generation
      controller = new AbortController()
      publish({ status: 'submitting', command })
      try {
        const receipt = await execute(command, controller.signal)
        if (current === generation && !disposed) publish({ status: 'success', ...receipt })
      } catch (error: unknown) {
        if (current === generation && !disposed) {
          publish({ status: classifyPolicyWriteFailure(error), command, error })
        }
      }
    },
    reconciled(command: PolicyWriteCommand) {
      if (
        (state.status === 'conflict' || state.status === 'unknown') &&
        state.command === command
      ) {
        publish({ status: 'idle' })
      }
    },
    reset() {
      if (
        state.status === 'submitting' ||
        state.status === 'conflict' ||
        state.status === 'unknown'
      )
        return false
      generation += 1
      controller?.abort()
      controller = undefined
      if (!disposed) publish({ status: 'idle' })
      return true
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
