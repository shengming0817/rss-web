import { isRssApiError } from '@rss/api'
import type { ConfigCoordinate, ConfigEntry, SettingsApi } from '@rss/settings'

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
  | Readonly<{ status: 'unknown'; key: string; error: unknown }>
  | Readonly<{
      status: 'error'
      action: 'read' | 'publish' | 'delete'
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
  reset(): void
  dispose(): void
}

const DEFINITE_PUBLISH = new Set([400, 403, 409, 413, 429, 503])

function publishUnknown(error: unknown): boolean {
  return !(
    isRssApiError(error) &&
    error.cause === 'wire' &&
    error.status !== undefined &&
    DEFINITE_PUBLISH.has(error.status)
  )
}

export function createConfigOperation(api: SettingsApi): ConfigOperation {
  const listeners = new Set<(state: ConfigOperationState) => void>()
  let state: ConfigOperationState = Object.freeze({ status: 'idle' })
  let generation = 0
  let controller: AbortController | undefined

  function publish(next: ConfigOperationState) {
    state = Object.freeze(next)
    for (const listener of [...listeners]) listener(state)
  }

  function abort() {
    generation += 1
    controller?.abort()
    controller = undefined
  }

  async function read(key: string) {
    abort()
    const current = generation
    controller = new AbortController()
    const signal = controller.signal
    publish({ status: 'reading', key })
    try {
      const response = await api.get(key, { signal })
      if (current !== generation || signal.aborted) return
      controller = undefined
      publish({ status: 'ready', entry: response.data })
    } catch (error: unknown) {
      if (current !== generation || signal.aborted) return
      controller = undefined
      publish({ status: 'error', action: 'read', key, error })
    }
  }

  function beginPublish(key: string) {
    if (state.status === 'publishing' || state.status === 'deleting') return false
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
      publish(
        publishUnknown(error)
          ? { status: 'unknown', key, error }
          : { status: 'error', action: 'publish', key, error },
      )
    }
  }

  function beginDelete(key: string) {
    if (state.status === 'publishing' || state.status === 'deleting') return false
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

  function reset() {
    abort()
    publish({ status: 'idle' })
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
    reset,
    dispose() {
      listeners.clear()
      reset()
    },
  })
}
