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

const IDENTITY_SESSION: InjectionKey<IdentitySession> = Symbol('rss-identity-session')

export function provideIdentitySession(app: App, session: IdentitySession): void {
  app.provide(IDENTITY_SESSION, session)
}

export function identitySessionPlugin(session: IdentitySession): Plugin {
  return { install: (app) => provideIdentitySession(app, session) }
}

export function useIdentitySession() {
  const session = inject(IDENTITY_SESSION)
  if (session === undefined) throw new Error('Identity session provider is unavailable')
  const state = shallowRef<IdentitySessionState>(session.getState())
  const unsubscribe = session.subscribe((next) => {
    state.value = next
  })
  onScopeDispose(unsubscribe)
  return Object.freeze({ session, state: readonly(state) })
}
