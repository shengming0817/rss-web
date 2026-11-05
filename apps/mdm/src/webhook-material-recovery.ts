import type { SessionOwner } from '@rss/auth-core'
import { freeze } from '@rss/mdm-inventory'
import type { MaterialIntent, MaterialTransition } from '@rss/mdm-webhooks'

export type PendingMaterial =
  | {
      readonly kind: 'prepare'
      readonly operationId: string
      readonly input: MaterialIntent
      readonly fingerprint: string | null
    }
  | {
      readonly kind: 'transition'
      readonly operationId: string
      readonly input: MaterialTransition
    }
export type MaterialOutcome = 'none' | 'unknown' | 'confirmed' | 'rejected'
export interface MaterialRecoveryState {
  readonly pending: PendingMaterial
  readonly outcome: MaterialOutcome
}

/** One ephemeral public intent across this explicit reauthentication's session rotation.
 * No credentials, authority, receipt, storage, transport, or automatic write replay.
 */
export function createWebhookMaterialRecovery(owner: SessionOwner) {
  type Saved = {
    source: string
    user: string
    state: MaterialRecoveryState
    target: string | null
    done: Promise<boolean>
    finish: (success: boolean) => void
    timer: ReturnType<typeof setTimeout>
  }
  let saved: Saved | null = null
  function scope() {
    const current = owner.getSnapshot()
    if (
      current.status !== 'authenticated' ||
      !current.tenant ||
      !current.identity ||
      !current.session
    )
      return null
    return {
      user: `${current.tenant}/${current.identity.principalId}`,
      binding: `${current.tenant}/${current.identity.principalId}/${current.session.id}`,
    }
  }
  function clear() {
    const previous = saved
    saved = null
    if (previous) {
      clearTimeout(previous.timer)
      previous.finish(false)
    }
  }
  owner.subscribe(() => {
    if (saved && scope()?.user !== saved.user) clear()
  })
  function available(binding: string) {
    const current = scope()
    return (
      !!saved &&
      current?.user === saved.user &&
      current.binding === binding &&
      binding !== saved.source
    )
  }
  return {
    available,
    async reauthenticate(password: string, state: MaterialRecoveryState | null) {
      clear()
      const source = scope()
      if (!source) throw { cause: 'client', code: 'session_required' }
      let entry: Saved | null = null
      if (state) {
        let finish!: (success: boolean) => void
        const done = new Promise<boolean>((resolve) => {
          finish = resolve
        })
        entry = {
          source: source.binding,
          user: source.user,
          state: freeze(state),
          target: null,
          done,
          finish,
          timer: setTimeout(clear, 120000),
        }
        saved = entry
      }
      try {
        await owner.reauthenticate(password)
        const current = scope()
        if (!current || current.user !== source.user)
          throw { cause: 'client', code: 'session_changed' }
        if (entry && saved === entry) {
          if (current.binding === source.binding) clear()
          else {
            entry.target = current.binding
            entry.finish(true)
          }
        }
      } catch (error) {
        if (saved === entry) clear()
        throw error
      }
    },
    async take(
      binding: string,
      receive: (state: MaterialRecoveryState) => boolean,
    ): Promise<boolean> {
      if (!available(binding) || !saved) return false
      const entry = saved
      if (
        !(await entry.done) ||
        saved !== entry ||
        scope()?.binding !== binding ||
        entry.target !== binding
      )
        return false
      if (!receive(entry.state)) return false
      clear()
      return true
    },
  }
}
export type WebhookMaterialRecovery = ReturnType<typeof createWebhookMaterialRecovery>
