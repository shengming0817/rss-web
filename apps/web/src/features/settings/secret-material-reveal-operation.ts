import type { SecretMaterialBase64, SettingsApi } from '@rss/settings'
import type { SafeErrorPresentation } from '@rss/core'
import { toSafeReadErrorPresentation } from '../../errors/rss-error'

export const SECRET_MATERIAL_LEASE_MS = 30_000

export type SecretMaterialClearReason =
  | 'manual'
  | 'expired'
  | 'route'
  | 'hidden'
  | 'pagehide'
  | 'unmount'

export type SecretMaterialRevealState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'confirming' }>
  | Readonly<{ status: 'resolving' }>
  | Readonly<{ status: 'active'; copy: 'idle' | 'copied' | 'failed' }>
  | Readonly<{ status: 'cleared'; reason: SecretMaterialClearReason }>
  | Readonly<{ status: 'error'; error: SafeErrorPresentation }>

export interface SecretMaterialRevealOperation {
  getState(): SecretMaterialRevealState
  subscribe(listener: (state: SecretMaterialRevealState) => void): () => void
  begin(key: string): boolean
  cancel(): void
  confirm(): Promise<void>
  renderActiveInto(target: HTMLElement): boolean
  copy(writeText: (text: SecretMaterialBase64) => Promise<void>): Promise<boolean>
  clear(reason: SecretMaterialClearReason): void
  dispose(): void
}

export function createSecretMaterialRevealOperation(
  api: Pick<SettingsApi, 'resolveSecret'>,
): SecretMaterialRevealOperation {
  const listeners = new Set<(state: SecretMaterialRevealState) => void>()
  let state: SecretMaterialRevealState = Object.freeze({ status: 'idle' })
  let preparedKey: string | undefined
  let activeMaterial: SecretMaterialBase64 | undefined
  let controller: AbortController | undefined
  let leaseTimer: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  let disposed = false

  function publish(next: SecretMaterialRevealState): void {
    if (disposed) return
    state = Object.freeze(next)
    for (const listener of [...listeners]) listener(state)
  }

  function stopLease(): void {
    if (leaseTimer !== undefined) clearTimeout(leaseTimer)
    leaseTimer = undefined
  }

  function release(): void {
    generation += 1
    preparedKey = undefined
    activeMaterial = undefined
    controller?.abort()
    controller = undefined
    stopLease()
  }

  function clear(reason: SecretMaterialClearReason): void {
    const wasIdle = state.status === 'idle'
    release()
    if (!wasIdle) publish({ status: 'cleared', reason })
  }

  function begin(key: string): boolean {
    if (
      disposed ||
      key.length === 0 ||
      state.status === 'confirming' ||
      state.status === 'resolving' ||
      state.status === 'active'
    )
      return false
    release()
    preparedKey = key
    publish({ status: 'confirming' })
    return true
  }

  function cancel(): void {
    if (state.status !== 'confirming') return
    preparedKey = undefined
    publish({ status: 'idle' })
  }

  async function confirm(): Promise<void> {
    if (disposed || state.status !== 'confirming' || preparedKey === undefined) return
    const key = preparedKey
    preparedKey = undefined
    generation += 1
    const current = generation
    controller = new AbortController()
    const signal = controller.signal
    publish({ status: 'resolving' })
    try {
      const response = await api.resolveSecret(key, { signal })
      if (disposed || current !== generation || signal.aborted) return
      controller = undefined
      activeMaterial = response.data.materialBase64
      publish({ status: 'active', copy: 'idle' })
      leaseTimer = setTimeout(() => clear('expired'), SECRET_MATERIAL_LEASE_MS)
    } catch (error: unknown) {
      if (disposed || current !== generation || signal.aborted) return
      controller = undefined
      publish({ status: 'error', error: toSafeReadErrorPresentation(error) })
    }
  }

  function renderActiveInto(target: HTMLElement): boolean {
    if (state.status !== 'active' || activeMaterial === undefined) return false
    target.textContent = activeMaterial
    return true
  }

  function copy(writeText: (text: SecretMaterialBase64) => Promise<void>): Promise<boolean> {
    if (state.status !== 'active' || activeMaterial === undefined) return Promise.resolve(false)
    const current = generation
    if (state.copy !== 'idle') publish({ status: 'active', copy: 'idle' })
    let pending: Promise<void>
    try {
      pending = writeText(activeMaterial)
    } catch {
      if (!disposed && current === generation && state.status === 'active')
        publish({ status: 'active', copy: 'failed' })
      return Promise.resolve(true)
    }
    return pending.then(
      () => {
        if (!disposed && current === generation && state.status === 'active')
          publish({ status: 'active', copy: 'copied' })
        return true
      },
      () => {
        if (!disposed && current === generation && state.status === 'active')
          publish({ status: 'active', copy: 'failed' })
        return true
      },
    )
  }

  return Object.freeze({
    getState: () => state,
    subscribe(listener: (state: SecretMaterialRevealState) => void) {
      if (disposed) return () => undefined
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    begin,
    cancel,
    confirm,
    renderActiveInto,
    copy,
    clear,
    dispose() {
      if (disposed) return
      release()
      disposed = true
      listeners.clear()
      state = Object.freeze({ status: 'idle' })
    },
  })
}
