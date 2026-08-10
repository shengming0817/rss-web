import {
  inject,
  onScopeDispose,
  readonly,
  shallowRef,
  type App,
  type InjectionKey,
  type Plugin,
} from 'vue'
import type { IdentitySession, IdentitySessionState } from '@rss/identity'

export type SignOutNotice = 'signed-out' | 'logout-unconfirmed'

interface IdentityContext {
  readonly session: IdentitySession
  readonly signOutPending: Readonly<ReturnType<typeof shallowRef<boolean>>>
  readonly signOutNotice: Readonly<ReturnType<typeof shallowRef<SignOutNotice | undefined>>>
  signOut(all: boolean): Promise<void>
}

const IDENTITY_CONTEXT: InjectionKey<IdentityContext> = Symbol('rss-identity-context')

function createIdentityContext(session: IdentitySession): IdentityContext {
  const signOutPending = shallowRef(false)
  const signOutNotice = shallowRef<SignOutNotice>()
  let operationEpoch = 0

  async function signOut(all: boolean): Promise<void> {
    if (signOutPending.value) return
    const epoch = ++operationEpoch
    signOutPending.value = true
    signOutNotice.value = undefined
    try {
      await (all ? session.logoutAll() : session.logout())
      if (epoch === operationEpoch) signOutNotice.value = 'signed-out'
    } catch {
      if (epoch === operationEpoch) signOutNotice.value = 'logout-unconfirmed'
    } finally {
      if (epoch === operationEpoch) signOutPending.value = false
    }
  }

  return Object.freeze({
    session,
    signOutPending: readonly(signOutPending),
    signOutNotice: readonly(signOutNotice),
    signOut,
  })
}

export function provideIdentitySession(app: App, session: IdentitySession): void {
  app.provide(IDENTITY_CONTEXT, createIdentityContext(session))
}

export function identitySessionPlugin(session: IdentitySession): Plugin {
  return { install: (app) => provideIdentitySession(app, session) }
}

export function useIdentitySession() {
  const context = inject(IDENTITY_CONTEXT)
  if (context === undefined) throw new Error('Identity session provider is unavailable')
  const { session } = context
  const state = shallowRef<IdentitySessionState>(session.getState())
  const unsubscribe = session.subscribe((next) => {
    state.value = next
  })
  onScopeDispose(unsubscribe)
  return Object.freeze({
    session,
    state: readonly(state),
    signOut: context.signOut,
    signOutPending: context.signOutPending,
    signOutNotice: context.signOutNotice,
  })
}
