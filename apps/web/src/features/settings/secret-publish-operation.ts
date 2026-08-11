import type { SettingsApi } from '@rss/settings'
import { isWriteOutcomeUnknown } from '../../errors/write-outcome'

type PublishSecret = SettingsApi['publishSecret']
type SecretPublishRequest = Parameters<PublishSecret>[0]
type SecretPublishReceipt = Awaited<ReturnType<PublishSecret>>['data']

export type SecretPublishOperationState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'confirming' }>
  | Readonly<{ status: 'publishing' }>
  | Readonly<{ status: 'published'; receipt: SecretPublishReceipt }>
  | Readonly<{ status: 'error'; error: unknown }>
  | Readonly<{ status: 'unknown'; error: unknown }>

export interface SecretPublishOperation {
  getState(): SecretPublishOperationState
  subscribe(listener: (state: SecretPublishOperationState) => void): () => void
  begin(): boolean
  cancel(): void
  confirm(request: SecretPublishRequest): Promise<void>
  dispose(): void
}

export function createSecretPublishOperation(
  api: Pick<SettingsApi, 'publishSecret'>,
): SecretPublishOperation {
  const listeners = new Set<(state: SecretPublishOperationState) => void>()
  let state: SecretPublishOperationState = Object.freeze({ status: 'idle' })
  let generation = 0
  let controller: AbortController | undefined

  function publish(next: SecretPublishOperationState) {
    state = Object.freeze(next)
    for (const listener of [...listeners]) listener(state)
  }

  function begin() {
    if (
      state.status === 'publishing' ||
      state.status === 'confirming' ||
      state.status === 'unknown'
    )
      return false
    publish({ status: 'confirming' })
    return true
  }

  function cancel() {
    if (state.status === 'confirming') publish({ status: 'idle' })
  }

  async function confirm(request: SecretPublishRequest) {
    if (state.status !== 'confirming') return
    generation += 1
    const current = generation
    controller = new AbortController()
    const signal = controller.signal
    publish({ status: 'publishing' })
    try {
      const response = await api.publishSecret(request, { signal })
      if (current !== generation || signal.aborted) return
      controller = undefined
      publish({ status: 'published', receipt: response.data })
    } catch (error: unknown) {
      if (current !== generation || signal.aborted) return
      controller = undefined
      publish(
        isWriteOutcomeUnknown(error) ? { status: 'unknown', error } : { status: 'error', error },
      )
    }
  }

  return Object.freeze({
    getState: () => state,
    subscribe(listener: (state: SecretPublishOperationState) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    begin,
    cancel,
    confirm,
    dispose() {
      generation += 1
      controller?.abort()
      controller = undefined
      listeners.clear()
      state = Object.freeze({ status: 'idle' })
    },
  })
}
