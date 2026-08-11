import { isRssApiError } from '@rss/api'
import type {
  ConfigCoordinate,
  ConfigEntry,
  ConfigRollbackReceipt,
  SettingsApi,
} from '@rss/settings'

type ConfigUnknownState =
  | Readonly<{ status: 'unknown'; action: 'publish'; key: string; error: unknown }>
  | Readonly<{
      status: 'unknown'
      action: 'rollback'
      key: string
      toVersion: number
      error: unknown
    }>

export type ConfigOperationState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'reading'; key: string }>
  | Readonly<{ status: 'ready'; entry: ConfigEntry }>
  | Readonly<{ status: 'confirming-publish'; key: string }>
  | Readonly<{ status: 'publishing'; key: string }>
  | Readonly<{ status: 'published'; coordinate: ConfigCoordinate }>
  | Readonly<{ status: 'confirming-delete'; key: string }>
  | Readonly<{ status: 'deleting'; key: string }>
  | Readonly<{ status: 'deleted'; key: string }>
  | Readonly<{ status: 'confirming-rollback'; key: string; toVersion: number }>
  | Readonly<{ status: 'rolling-back'; key: string; toVersion: number }>
  | Readonly<{ status: 'rolled-back'; receipt: ConfigRollbackReceipt }>
  | ConfigUnknownState
  | Readonly<{
      status: 'error'
      action: 'read' | 'publish' | 'delete' | 'rollback'
      key: string
      error: unknown
    }>

export interface ConfigOperation {
  getState(): ConfigOperationState
  subscribe(listener: (state: ConfigOperationState) => void): () => void
  read(key: string): Promise<void>
  beginPublish(key: string): boolean
  cancelPublish(): void
  confirmPublish(value: string): Promise<void>
  beginDelete(key: string): boolean
  cancelDelete(): void
  confirmDelete(): Promise<void>
  beginRollback(key: string, toVersion: number): boolean
  cancelRollback(): void
  confirmRollback(): Promise<void>
  reset(): boolean
  dispose(): void
}

function writeOutcomeUnknown(error: unknown): boolean {
  if (!isRssApiError(error)) return true
  if (
    error.cause === 'network' ||
    error.cause === 'timeout' ||
    error.cause === 'protocol' ||
    error.cause === 'aborted'
  )
    return true
  if (error.cause !== 'wire') return false
  return (
    error.status === 500 || (error.status === 503 && error.code !== 'ERR_CORE_PROVIDER_UNAVAILABLE')
  )
}

type ConfigOperationApi = Pick<SettingsApi, 'get' | 'publish' | 'delete' | 'rollback'>

export function createConfigOperation(api: ConfigOperationApi): ConfigOperation {
  const listeners = new Set<(state: ConfigOperationState) => void>()
  let state: ConfigOperationState = Object.freeze({ status: 'idle' })
  let generation = 0
  let controller: AbortController | undefined
  let unresolved: ConfigUnknownState | undefined

  function publish(next: ConfigOperationState) {
    state = Object.freeze(next)
    for (const listener of [...listeners]) listener(state)
  }

  function abort() {
    generation += 1
    controller?.abort()
    controller = undefined
  }

  function writesLocked() {
    return (
      state.status === 'publishing' ||
      state.status === 'deleting' ||
      state.status === 'rolling-back' ||
      unresolved !== undefined
    )
  }

  async function read(key: string) {
    const pendingUnresolved = unresolved
    const reconciling = pendingUnresolved !== undefined
    if (reconciling && key !== pendingUnresolved.key) return
    abort()
    const current = generation
    controller = new AbortController()
    const signal = controller.signal
    publish({ status: 'reading', key })
    try {
      const response = await api.get(key, { signal })
      if (current !== generation || signal.aborted) return
      controller = undefined
      if (reconciling) unresolved = undefined
      publish({ status: 'ready', entry: response.data })
    } catch (error: unknown) {
      if (current !== generation || signal.aborted) return
      controller = undefined
      publish(
        pendingUnresolved
          ? { ...pendingUnresolved, error }
          : { status: 'error', action: 'read', key, error },
      )
    }
  }

  function beginPublish(key: string) {
    if (writesLocked()) return false
    publish({ status: 'confirming-publish', key })
    return true
  }

  function cancelPublish() {
    if (state.status === 'confirming-publish') publish({ status: 'idle' })
  }

  async function confirmPublish(value: string) {
    if (state.status !== 'confirming-publish') return
    const key = state.key
    abort()
    const current = generation
    controller = new AbortController()
    const signal = controller.signal
    publish({ status: 'publishing', key })
    try {
      const response = await api.publish({ key, value }, { signal })
      if (current !== generation || signal.aborted) return
      controller = undefined
      publish({ status: 'published', coordinate: response.data })
    } catch (error: unknown) {
      if (current !== generation) return
      controller = undefined
      const unknown = writeOutcomeUnknown(error)
      const next: ConfigOperationState = unknown
        ? { status: 'unknown', action: 'publish', key, error }
        : { status: 'error', action: 'publish', key, error }
      if (next.status === 'unknown') unresolved = next
      publish(next)
    }
  }

  function beginDelete(key: string) {
    if (writesLocked()) return false
    publish({ status: 'confirming-delete', key })
    return true
  }

  function cancelDelete() {
    if (state.status === 'confirming-delete') publish({ status: 'idle' })
  }

  async function confirmDelete() {
    if (state.status !== 'confirming-delete') return
    const key = state.key
    abort()
    const current = generation
    controller = new AbortController()
    const signal = controller.signal
    publish({ status: 'deleting', key })
    try {
      await api.delete(key, { signal })
      if (current !== generation || signal.aborted) return
      controller = undefined
      publish({ status: 'deleted', key })
    } catch (error: unknown) {
      if (current !== generation || signal.aborted) return
      controller = undefined
      publish({ status: 'error', action: 'delete', key, error })
    }
  }

  function beginRollback(key: string, toVersion: number) {
    if (!Number.isSafeInteger(toVersion) || toVersion < 1 || writesLocked()) return false
    publish({ status: 'confirming-rollback', key, toVersion })
    return true
  }

  function cancelRollback() {
    if (state.status === 'confirming-rollback') publish({ status: 'idle' })
  }

  async function confirmRollback() {
    if (state.status !== 'confirming-rollback') return
    const { key, toVersion } = state
    abort()
    const current = generation
    controller = new AbortController()
    const signal = controller.signal
    publish({ status: 'rolling-back', key, toVersion })
    try {
      const response = await api.rollback(key, { toVersion }, { signal })
      if (current !== generation || signal.aborted) return
      controller = undefined
      publish({ status: 'rolled-back', receipt: response.data })
    } catch (error: unknown) {
      if (current !== generation) return
      controller = undefined
      const unknown = writeOutcomeUnknown(error)
      const next: ConfigOperationState = unknown
        ? { status: 'unknown', action: 'rollback', key, toVersion, error }
        : { status: 'error', action: 'rollback', key, error }
      if (next.status === 'unknown') unresolved = next
      publish(next)
    }
  }

  function reset() {
    if (unresolved !== undefined) return false
    abort()
    publish({ status: 'idle' })
    return true
  }

  return Object.freeze({
    getState: () => state,
    subscribe(listener: (state: ConfigOperationState) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    read,
    beginPublish,
    cancelPublish,
    confirmPublish,
    beginDelete,
    cancelDelete,
    confirmDelete,
    beginRollback,
    cancelRollback,
    confirmRollback,
    reset,
    dispose() {
      listeners.clear()
      abort()
      unresolved = undefined
      state = Object.freeze({ status: 'idle' })
    },
  })
}
