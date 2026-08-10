import { isRssApiError } from '@rss/api'
import type {
  AccountStatus,
  AccountStatusApi,
  AccountStatusCallOptions,
  IdentitySession,
} from '@rss/identity'

export type AccountStatusOperationState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'reading'; userId: string }>
  | Readonly<{
      status: 'ready'
      userId: string
      accountStatus: AccountStatus
      changed?: boolean
    }>
  | Readonly<{
      status: 'confirming'
      userId: string
      accountStatus: AccountStatus
      targetStatus: AccountStatus
    }>
  | Readonly<{
      status: 'writing'
      userId: string
      targetStatus: AccountStatus
    }>
  | Readonly<{ status: 'unavailable'; userId: string; error: unknown }>
  | Readonly<{ status: 'expired' }>

export interface AccountStatusOperationConfig {
  readonly get: AccountStatusApi['get']
  readonly set: AccountStatusApi['set']
  readonly invalidate: IdentitySession['invalidateForAccountStatusChange']
}

export interface AccountStatusOperation {
  getState(): AccountStatusOperationState
  subscribe(listener: (state: AccountStatusOperationState) => void): () => void
  read(userId: string): Promise<void>
  beginSet(targetStatus: AccountStatus): boolean
  cancelSet(): void
  confirmSet(): Promise<void>
  reset(): void
  dispose(): void
}

const definiteStatuses = new Set([400, 403, 404, 409, 429, 503])

function commitUnknown(error: unknown): boolean {
  return !(
    isRssApiError(error) &&
    error.cause === 'wire' &&
    error.status !== undefined &&
    definiteStatuses.has(error.status)
  )
}

export function createAccountStatusOperation(
  config: AccountStatusOperationConfig,
): AccountStatusOperation {
  const listeners = new Set<(state: AccountStatusOperationState) => void>()
  let state: AccountStatusOperationState = Object.freeze({ status: 'idle' })
  let generation = 0
  let controller: AbortController | undefined
  let writeCoordinate: Readonly<{ userId: string; targetStatus: AccountStatus }> | undefined

  function publish(next: AccountStatusOperationState): void {
    state = Object.freeze(next)
    for (const listener of [...listeners]) listener(state)
  }

  function abort(invalidateUnknownWrite: boolean): boolean {
    generation += 1
    let expired = false
    if (invalidateUnknownWrite && writeCoordinate !== undefined) {
      expired = config.invalidate(writeCoordinate.userId, writeCoordinate.targetStatus)
    }
    controller?.abort()
    controller = undefined
    writeCoordinate = undefined
    return expired
  }

  async function read(userId: string): Promise<void> {
    if (state.status === 'writing') return
    abort(false)
    const currentGeneration = generation
    controller = new AbortController()
    const signal = controller.signal
    publish({ status: 'reading', userId })
    try {
      const response = await config.get(userId, { signal })
      if (generation !== currentGeneration || signal.aborted) return
      controller = undefined
      publish({ status: 'ready', userId, accountStatus: response.data.status })
    } catch (error: unknown) {
      if (generation !== currentGeneration || signal.aborted) return
      controller = undefined
      publish({ status: 'unavailable', userId, error })
    }
  }

  function beginSet(targetStatus: AccountStatus): boolean {
    if (state.status !== 'ready') return false
    publish({
      status: 'confirming',
      userId: state.userId,
      accountStatus: state.accountStatus,
      targetStatus,
    })
    return true
  }

  function cancelSet(): void {
    if (state.status !== 'confirming') return
    publish({
      status: 'ready',
      userId: state.userId,
      accountStatus: state.accountStatus,
    })
  }

  async function confirmSet(): Promise<void> {
    if (state.status !== 'confirming') return
    const coordinate = Object.freeze({ userId: state.userId, targetStatus: state.targetStatus })
    abort(false)
    const currentGeneration = generation
    controller = new AbortController()
    const signal = controller.signal
    writeCoordinate = coordinate
    publish({ status: 'writing', ...coordinate })
    try {
      const response = await config.set(
        coordinate.userId,
        { targetStatus: coordinate.targetStatus },
        { signal } satisfies AccountStatusCallOptions,
      )
      if (generation !== currentGeneration || signal.aborted) return
      controller = undefined
      writeCoordinate = undefined
      if (config.invalidate(coordinate.userId, response.data.status)) {
        publish({ status: 'expired' })
        return
      }
      publish({
        status: 'ready',
        userId: coordinate.userId,
        accountStatus: response.data.status,
        changed: response.data.changed,
      })
    } catch (error: unknown) {
      if (generation !== currentGeneration || signal.aborted) return
      controller = undefined
      writeCoordinate = undefined
      if (
        coordinate.targetStatus !== 'active' &&
        commitUnknown(error) &&
        config.invalidate(coordinate.userId, coordinate.targetStatus)
      ) {
        publish({ status: 'expired' })
        return
      }
      publish({ status: 'unavailable', userId: coordinate.userId, error })
    }
  }

  function reset(): void {
    publish(abort(true) ? { status: 'expired' } : { status: 'idle' })
  }

  function dispose(): void {
    listeners.clear()
    publish(abort(true) ? { status: 'expired' } : { status: 'idle' })
  }

  return Object.freeze({
    getState: () => state,
    subscribe(listener: (state: AccountStatusOperationState) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    read,
    beginSet,
    cancelSet,
    confirmSet,
    reset,
    dispose,
  })
}
