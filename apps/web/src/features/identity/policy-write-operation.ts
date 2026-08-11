import { isRssApiError } from '@rss/api'
import {
  parsePolicyCreateRequest,
  parsePolicyUpdateRequest,
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
      request: Readonly<{ expectedVersion: number }>
      [commandBrand]: true
    }>

export type PolicyWriteResult = PolicyView | PolicyDeactivateResponse['data']
export type PolicyWriteState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'confirming'; command: PolicyWriteCommand }>
  | Readonly<{ status: 'submitting'; command: PolicyWriteCommand }>
  | Readonly<{ status: 'success'; action: PolicyWriteCommand['action']; result: PolicyWriteResult }>
  | Readonly<{
      status: 'conflict' | 'unknown' | 'error'
      command: PolicyWriteCommand
      error: unknown
    }>

type Execute = (command: PolicyWriteCommand, signal: AbortSignal) => Promise<PolicyWriteResult>

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
    request: parsePolicyUpdateRequest({ expectedVersion: snapshot.version, ...fields }),
  }) as PolicyWriteCommand
}

export function createPolicyDeactivateCommand(snapshot: PolicyView): PolicyWriteCommand {
  return Object.freeze({
    action: 'deactivate',
    policyId: snapshot.policyId,
    request: Object.freeze({ expectedVersion: snapshot.version }),
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
      if (disposed || state.status === 'submitting') return
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
        const result = await execute(command, controller.signal)
        if (current === generation && !disposed)
          publish({ status: 'success', action: command.action, result })
      } catch (error: unknown) {
        if (current === generation && !disposed) {
          publish({ status: classifyPolicyWriteFailure(error), command, error })
        }
      }
    },
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
