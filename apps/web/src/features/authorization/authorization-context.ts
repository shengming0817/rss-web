import {
  computed,
  inject,
  onScopeDispose,
  shallowRef,
  toValue,
  type App,
  type InjectionKey,
  type MaybeRefOrGetter,
  type Plugin,
} from 'vue'
import { isRssApiError } from '@rss/api'
import type { AuthorizationHint, AuthorizationIntent, AuthorizationPort } from '@rss/authorization'
import type { IdentitySession, IdentitySessionState } from '@rss/identity'

export type AuthorizationOutcome =
  | { readonly status: 'idle' }
  | { readonly status: 'forbidden'; readonly requestId: string }

export interface AuthorizationExperience {
  getHint(intent: AuthorizationIntent): AuthorizationHint
  getOutcome(intent: AuthorizationIntent): AuthorizationOutcome
  execute<T>(intent: AuthorizationIntent, operation: () => Promise<T>): Promise<T>
  subscribe(listener: () => void): () => void
  dispose(): void
}

interface AuthorizationExperienceOptions {
  readonly port: AuthorizationPort
  readonly session: IdentitySession
}

interface IntentState {
  readonly intent: AuthorizationIntent
  generation: number
  forbidden?: { readonly requestId: string }
}

const IDLE: AuthorizationOutcome = Object.freeze({ status: 'idle' })
const AUTHORIZATION_EXPERIENCE: InjectionKey<AuthorizationExperience> = Symbol(
  'rss-authorization-experience',
)

function authorityCoordinate(state: IdentitySessionState): string | undefined {
  if (state.status !== 'authenticated' && state.status !== 'refreshing') return undefined
  return JSON.stringify([state.profile.subject, state.profile.tenantId, state.profile.kind])
}

function isFinalForbidden(error: unknown): error is { readonly requestId: string } {
  return (
    isRssApiError(error) &&
    error.cause === 'wire' &&
    error.status === 403 &&
    error.code === 'ERR_CORE_FORBIDDEN' &&
    error.requestId !== undefined
  )
}

export function createAuthorizationExperience({
  port,
  session,
}: AuthorizationExperienceOptions): AuthorizationExperience {
  const listeners = new Set<() => void>()
  let authority = authorityCoordinate(session.getState())
  let authorityEpoch = 0
  let disposed = false
  let intentStates: IntentState[] = []

  function emit(): void {
    for (const listener of listeners) {
      try {
        listener()
      } catch {
        // Observers cannot alter a completed server operation or session transition.
      }
    }
  }

  function findState(intent: AuthorizationIntent): IntentState | undefined {
    return intentStates.find((state) => port.matches(state.intent, intent))
  }

  function stateFor(intent: AuthorizationIntent): IntentState | undefined {
    if (!port.matches(intent, intent)) return undefined
    const existing = findState(intent)
    if (existing !== undefined) return existing
    const state: IntentState = {
      intent: Object.freeze({ ...intent }),
      generation: 0,
    }
    intentStates.push(state)
    return state
  }

  function removeState(state: IntentState): void {
    intentStates = intentStates.filter((candidate) => candidate !== state)
  }

  const unsubscribeSession = session.subscribe((state) => {
    const nextAuthority = authorityCoordinate(state)
    if (nextAuthority !== authority) {
      authority = nextAuthority
      authorityEpoch += 1
      port.reset()
      intentStates = []
      emit()
    }
  })

  return Object.freeze({
    getHint: (intent: AuthorizationIntent) => port.preview(intent),
    getOutcome(intent: AuthorizationIntent) {
      const state = findState(intent)
      if (state?.forbidden === undefined) return IDLE
      return Object.freeze({ status: 'forbidden', requestId: state.forbidden.requestId })
    },
    async execute<T>(intent: AuthorizationIntent, operation: () => Promise<T>): Promise<T> {
      const capturedEpoch = authorityEpoch
      const state = stateFor(intent)
      const generation = state === undefined ? undefined : ++state.generation
      const canCommit = () =>
        !disposed &&
        capturedEpoch === authorityEpoch &&
        state !== undefined &&
        findState(intent) === state &&
        state.generation === generation
      try {
        const value = await port.execute(intent, operation)
        if (state !== undefined && canCommit()) {
          const changed = state.forbidden !== undefined
          removeState(state)
          if (changed) emit()
        }
        return value
      } catch (error: unknown) {
        if (state !== undefined && canCommit() && isFinalForbidden(error)) {
          port.invalidate(intent)
          state.forbidden = Object.freeze({ requestId: error.requestId })
          emit()
        } else if (state !== undefined && canCommit() && state.forbidden === undefined) {
          removeState(state)
        }
        throw error
      }
    },
    subscribe(listener: () => void) {
      if (disposed) return () => undefined
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose() {
      if (disposed) return
      disposed = true
      authorityEpoch += 1
      unsubscribeSession()
      listeners.clear()
      intentStates = []
      port.reset()
    },
  })
}

export function authorizationExperiencePlugin(experience: AuthorizationExperience): Plugin {
  return {
    install(app: App) {
      app.provide(AUTHORIZATION_EXPERIENCE, experience)
      app.onUnmount(() => experience.dispose())
    },
  }
}

export function useAuthorizationExperience(): AuthorizationExperience {
  const experience = inject(AUTHORIZATION_EXPERIENCE, undefined)
  if (experience === undefined) throw new Error('Authorization experience provider is unavailable')
  return experience
}

export function useAuthorizationIntent(intent: MaybeRefOrGetter<AuthorizationIntent>) {
  const experience = useAuthorizationExperience()
  const revision = shallowRef(0)
  const unsubscribe = experience.subscribe(() => {
    revision.value += 1
  })
  onScopeDispose(unsubscribe)
  const hint = computed(() => {
    void revision.value
    return experience.getHint(toValue(intent))
  })
  const outcome = computed(() => {
    void revision.value
    return experience.getOutcome(toValue(intent))
  })
  return Object.freeze({
    hint,
    outcome,
    execute: <T>(operation: () => Promise<T>) => experience.execute(toValue(intent), operation),
  })
}
