import {
  createCredentialHttpTransport,
  createSessionHttpTransport,
  type SessionCredential,
  type SessionTransportHooks,
} from '@rss/api/session'
import { createIdentityApi } from '../api/client'
import type { LoginData, ProfileData, RefreshData } from '../api/types'
import { sessionError } from './errors'
import { classifyPasswordChangeFailure } from './password-change-failure'
import type {
  IdentitySession,
  IdentitySessionConfig,
  IdentitySessionListener,
  IdentitySessionState,
  SessionOperationOptions,
  VerifiedProfile,
} from './types'

interface Secrets {
  readonly accessToken: string
  readonly refreshToken: string
  readonly accessExpiresAt: number
  readonly sessionExpiresAt: number
  readonly generation: number
}

const TENANT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const NIL_TENANT = '00000000-0000-0000-0000-000000000000'

function validDeadline(value: number, now: number): boolean {
  return Number.isSafeInteger(value) && value > now
}

function validLogin(data: LoginData, now: number): boolean {
  return (
    data.sessionId.trim().length > 0 &&
    data.accessToken.trim().length > 0 &&
    data.refreshToken.trim().length > 0 &&
    validDeadline(data.expiresAt, now) &&
    validDeadline(data.accessExpiresAt, now) &&
    data.accessExpiresAt <= data.expiresAt
  )
}

function validRotation(data: RefreshData, previous: Secrets, now: number): boolean {
  return (
    data.accessToken.trim().length > 0 &&
    data.refreshToken.trim().length > 0 &&
    data.accessToken !== previous.accessToken &&
    data.refreshToken !== previous.refreshToken &&
    validDeadline(data.accessExpiresAt, now) &&
    data.accessExpiresAt <= previous.sessionExpiresAt
  )
}

function verifyProfile(data: ProfileData): VerifiedProfile {
  if (
    data.subject.trim().length === 0 ||
    data.subject === '<redacted>' ||
    !TENANT_ID.test(data.tenantId) ||
    data.tenantId === NIL_TENANT ||
    data.kind === 'anonymous'
  ) {
    throw sessionError('PROFILE_NOT_AUTHORITATIVE')
  }
  return Object.freeze({
    subject: data.subject,
    tenantId: data.tenantId,
    kind: data.kind,
  }) as VerifiedProfile
}

function signalOption(
  options?: SessionOperationOptions,
  operationLifecycle?: AbortSignal,
): { signal?: AbortSignal } {
  const caller = options?.signal
  if (operationLifecycle === undefined) return caller === undefined ? {} : { signal: caller }
  return {
    signal:
      caller === undefined ? operationLifecycle : AbortSignal.any([caller, operationLifecycle]),
  }
}

function waitForCredential(
  promise: Promise<SessionCredential>,
  signal?: AbortSignal,
): Promise<SessionCredential> {
  if (signal === undefined) return promise
  if (signal.aborted) return Promise.reject(sessionError('SESSION_OPERATION_ABORTED'))
  return new Promise((resolve, reject) => {
    const aborted = () => reject(sessionError('SESSION_OPERATION_ABORTED'))
    signal.addEventListener('abort', aborted, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted))
  })
}

export function createIdentitySession(config: IdentitySessionConfig): IdentitySession {
  const nowEpochSeconds = config.nowEpochSeconds ?? (() => Math.floor(Date.now() / 1_000))
  const rawIdentity = createIdentityApi(config.transport)
  const listeners = new Set<IdentitySessionListener>()
  const notifications: IdentitySessionState[] = []
  let notifying = false
  let state: IdentitySessionState = Object.freeze({ status: 'anonymous' })
  let secrets: Secrets | undefined
  let epoch = 0
  let lifecycle = new AbortController()
  let refreshFlight: Promise<SessionCredential> | undefined
  let passwordChangeFlight: Promise<void> | undefined

  function publish(next: IdentitySessionState): void {
    const published = Object.freeze(next)
    state = published
    notifications.push(published)
    if (notifying) return
    notifying = true
    try {
      while (notifications.length > 0) {
        const notification = notifications.shift()!
        for (const listener of [...listeners]) {
          try {
            listener(notification)
          } catch (error: unknown) {
            void error
          }
        }
      }
    } finally {
      notifying = false
    }
  }

  function credential(current: Secrets): SessionCredential {
    return {
      bearer: current.accessToken,
      generation: current.generation,
      lifecycleSignal: lifecycle.signal,
    }
  }

  function clear(next: 'anonymous' | 'expired', reason?: 'password-change-outcome-unknown'): void {
    if (state.status === next && secrets === undefined && refreshFlight === undefined) return
    epoch += 1
    lifecycle.abort()
    lifecycle = new AbortController()
    secrets = undefined
    refreshFlight = undefined
    passwordChangeFlight = undefined
    publish(
      next === 'expired' && reason !== undefined ? { status: next, reason } : { status: next },
    )
  }

  function beginAuthentication(): { authenticationEpoch: number; operationLifecycle: AbortSignal } {
    epoch += 1
    lifecycle.abort()
    lifecycle = new AbortController()
    secrets = undefined
    refreshFlight = undefined
    passwordChangeFlight = undefined
    const authenticationEpoch = epoch
    const operationLifecycle = lifecycle.signal
    publish({ status: 'authenticating' })
    return { authenticationEpoch, operationLifecycle }
  }

  async function rotate(failedGeneration: number): Promise<SessionCredential> {
    const current = secrets
    if (current === undefined) throw sessionError('SESSION_UNAVAILABLE')
    if (current.generation !== failedGeneration) return credential(current)
    if (refreshFlight !== undefined) return refreshFlight

    const rotationEpoch = epoch
    const operationLifecycle = lifecycle
    const priorState = state
    if (priorState.status !== 'authenticated' && priorState.status !== 'refreshing') {
      throw sessionError('SESSION_UNAVAILABLE')
    }
    const flight = Promise.resolve().then(async () => {
      try {
        if (
          epoch !== rotationEpoch ||
          secrets !== current ||
          lifecycle !== operationLifecycle ||
          operationLifecycle.signal.aborted
        ) {
          throw sessionError('SESSION_INVALIDATED')
        }
        publish({
          status: 'refreshing',
          profile: priorState.profile,
          sessionExpiresAt: current.sessionExpiresAt,
          accessExpiresAt: current.accessExpiresAt,
        })
        if (
          epoch !== rotationEpoch ||
          secrets !== current ||
          lifecycle !== operationLifecycle ||
          operationLifecycle.signal.aborted
        ) {
          throw sessionError('SESSION_INVALIDATED')
        }
        const response = await rawIdentity.refresh(
          { refreshToken: current.refreshToken },
          { signal: operationLifecycle.signal },
        )
        if (epoch !== rotationEpoch || secrets !== current || lifecycle !== operationLifecycle) {
          throw sessionError('SESSION_INVALIDATED')
        }
        const now = nowEpochSeconds()
        if (!validRotation(response.data, current, now)) {
          throw sessionError('SESSION_INVALIDATED')
        }
        const next: Secrets = {
          accessToken: response.data.accessToken,
          refreshToken: response.data.refreshToken,
          accessExpiresAt: response.data.accessExpiresAt,
          sessionExpiresAt: current.sessionExpiresAt,
          generation: current.generation + 1,
        }
        secrets = next
        publish({
          status: 'authenticated',
          profile: priorState.profile,
          sessionExpiresAt: next.sessionExpiresAt,
          accessExpiresAt: next.accessExpiresAt,
        })
        if (epoch !== rotationEpoch || secrets !== next || lifecycle !== operationLifecycle) {
          throw sessionError('SESSION_INVALIDATED')
        }
        return credential(next)
      } catch (error: unknown) {
        if (epoch === rotationEpoch) clear('expired')
        throw error
      }
    })
    refreshFlight = flight
    const clearFlight = () => {
      if (refreshFlight === flight) refreshFlight = undefined
    }
    void flight.then(clearFlight, clearFlight)
    return flight
  }

  const hooks: SessionTransportHooks = {
    async authorize(waiterSignal) {
      if (refreshFlight !== undefined) return waitForCredential(refreshFlight, waiterSignal)
      const current = secrets
      if (current === undefined || state.status !== 'authenticated') {
        throw sessionError('SESSION_UNAVAILABLE')
      }
      const now = nowEpochSeconds()
      if (!validDeadline(current.sessionExpiresAt, now)) {
        clear('expired')
        throw sessionError('SESSION_UNAVAILABLE')
      }
      if (!validDeadline(current.accessExpiresAt, now)) {
        return waitForCredential(rotate(current.generation), waiterSignal)
      }
      return credential(current)
    },
    recover(failedGeneration, waiterSignal) {
      return waitForCredential(rotate(failedGeneration), waiterSignal)
    },
    invalidate(failedGeneration) {
      if (secrets?.generation === failedGeneration) clear('expired')
    },
  }
  const transport = createSessionHttpTransport(config.transport, hooks)

  async function login(
    request: Parameters<IdentitySession['login']>[0],
    options?: SessionOperationOptions,
  ): Promise<VerifiedProfile> {
    if (state.status !== 'anonymous' && state.status !== 'expired') {
      throw sessionError('SESSION_BUSY')
    }
    const { authenticationEpoch: loginEpoch, operationLifecycle } = beginAuthentication()
    try {
      if (epoch !== loginEpoch || lifecycle.signal !== operationLifecycle) {
        throw sessionError('SESSION_INVALIDATED')
      }
      const response = await rawIdentity.login(request, signalOption(options, operationLifecycle))
      if (epoch !== loginEpoch || lifecycle.signal !== operationLifecycle) {
        throw sessionError('SESSION_INVALIDATED')
      }
      const now = nowEpochSeconds()
      if (!validLogin(response.data, now)) throw sessionError('SESSION_INVALIDATED')
      const candidate: Secrets = {
        accessToken: response.data.accessToken,
        refreshToken: response.data.refreshToken,
        accessExpiresAt: response.data.accessExpiresAt,
        sessionExpiresAt: response.data.expiresAt,
        generation: 1,
      }
      secrets = candidate
      publish({ status: 'verifying' })
      if (
        epoch !== loginEpoch ||
        secrets !== candidate ||
        lifecycle.signal !== operationLifecycle
      ) {
        throw sessionError('SESSION_INVALIDATED')
      }
      const profileResponse = await createIdentityApi(
        createCredentialHttpTransport(config.transport, credential(candidate)),
      ).profile(signalOption(options, operationLifecycle))
      if (
        epoch !== loginEpoch ||
        secrets !== candidate ||
        lifecycle.signal !== operationLifecycle
      ) {
        throw sessionError('SESSION_INVALIDATED')
      }
      const profile = verifyProfile(profileResponse.data)
      publish({
        status: 'authenticated',
        profile,
        sessionExpiresAt: candidate.sessionExpiresAt,
        accessExpiresAt: candidate.accessExpiresAt,
      })
      if (
        epoch !== loginEpoch ||
        secrets !== candidate ||
        lifecycle.signal !== operationLifecycle
      ) {
        throw sessionError('SESSION_INVALIDATED')
      }
      return profile
    } catch (error: unknown) {
      if (epoch === loginEpoch) clear(secrets === undefined ? 'anonymous' : 'expired')
      throw error
    }
  }

  async function endSession(all: boolean, options?: SessionOperationOptions): Promise<void> {
    const captured = secrets === undefined ? undefined : credential(secrets)
    clear('anonymous')
    if (captured === undefined) return
    const remoteCredential: SessionCredential = {
      ...captured,
      lifecycleSignal: new AbortController().signal,
    }
    const remote = createIdentityApi(
      createCredentialHttpTransport(config.transport, remoteCredential),
    )
    if (all) await remote.logoutAll(signalOption(options))
    else await remote.logout(signalOption(options))
  }

  function changePassword(
    request: Parameters<IdentitySession['changePassword']>[0],
    options?: SessionOperationOptions,
  ): Promise<void> {
    if (passwordChangeFlight !== undefined) return Promise.reject(sessionError('SESSION_BUSY'))
    if (state.status !== 'authenticated' || secrets === undefined) {
      return Promise.reject(sessionError('SESSION_UNAVAILABLE'))
    }
    const operationEpoch = epoch
    const operationLifecycle = lifecycle
    const flight = Promise.resolve().then(async () => {
      try {
        const response = await createIdentityApi(transport).changePassword(
          request,
          signalOption(options, operationLifecycle.signal),
        )
        if (
          epoch !== operationEpoch ||
          lifecycle !== operationLifecycle ||
          operationLifecycle.signal.aborted
        ) {
          throw sessionError('SESSION_INVALIDATED')
        }
        if (!response.data.changed) throw sessionError('SESSION_INVALIDATED')
        clear('anonymous')
      } catch (error: unknown) {
        const failure = classifyPasswordChangeFailure(error)
        if (epoch === operationEpoch && !failure.preserveAuthority) {
          clear(
            'expired',
            failure.kind === 'outcome-unknown' || failure.kind === 'aborted'
              ? 'password-change-outcome-unknown'
              : undefined,
          )
        }
        throw error
      }
    })
    passwordChangeFlight = flight
    const release = () => {
      if (passwordChangeFlight === flight) passwordChangeFlight = undefined
    }
    void flight.then(release, release)
    return flight
  }

  return Object.freeze({
    transport,
    getState: () => state,
    subscribe(listener: IdentitySessionListener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    login,
    logout: (options?: SessionOperationOptions) => endSession(false, options),
    logoutAll: (options?: SessionOperationOptions) => endSession(true, options),
    changePassword,
  })
}
