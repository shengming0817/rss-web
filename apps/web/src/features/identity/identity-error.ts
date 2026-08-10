import { isRssApiError } from '@rss/api'
import { classifyPasswordChangeFailure, isIdentitySessionError } from '@rss/identity'

export type IdentityErrorKey =
  | 'identity.errors.invalidCredentials'
  | 'identity.errors.forbidden'
  | 'identity.errors.conflict'
  | 'identity.errors.rateLimited'
  | 'identity.errors.serviceUnavailable'
  | 'identity.errors.connection'
  | 'identity.errors.timeout'
  | 'identity.errors.invalidResponse'
  | 'identity.errors.profileVerificationFailed'
  | 'identity.errors.alreadySubmitting'
  | 'identity.errors.unknown'

export type PasswordChangeErrorKey =
  | 'identity.passwordChange.errors.required'
  | 'identity.passwordChange.errors.mismatch'
  | 'identity.passwordChange.errors.policy'
  | 'identity.passwordChange.errors.forbidden'
  | 'identity.passwordChange.errors.sessionChanged'
  | 'identity.passwordChange.errors.rateLimited'
  | 'identity.passwordChange.errors.serviceUnavailable'
  | 'identity.passwordChange.errors.outcomeUnknown'
  | 'identity.passwordChange.errors.unknown'

export function identityErrorKey(error: unknown): IdentityErrorKey | undefined {
  if (isIdentitySessionError(error)) {
    if (error.code === 'SESSION_OPERATION_ABORTED') return undefined
    if (error.code === 'PROFILE_NOT_AUTHORITATIVE') {
      return 'identity.errors.profileVerificationFailed'
    }
    if (error.code === 'SESSION_BUSY') return 'identity.errors.alreadySubmitting'
    return 'identity.errors.unknown'
  }
  if (!isRssApiError(error)) return 'identity.errors.unknown'
  if (error.cause === 'aborted') return undefined
  if (error.cause === 'network') return 'identity.errors.connection'
  if (error.cause === 'timeout') return 'identity.errors.timeout'
  if (error.cause === 'protocol') return 'identity.errors.invalidResponse'
  if (error.status === 401) return 'identity.errors.invalidCredentials'
  if (error.status === 403) return 'identity.errors.forbidden'
  if (error.status === 409) return 'identity.errors.conflict'
  if (error.status === 429) return 'identity.errors.rateLimited'
  if (error.status !== undefined && error.status >= 500) {
    return 'identity.errors.serviceUnavailable'
  }
  return 'identity.errors.unknown'
}

export function passwordChangeErrorKey(error: unknown): PasswordChangeErrorKey | undefined {
  if (isIdentitySessionError(error) && error.code === 'SESSION_BUSY') {
    return 'identity.passwordChange.errors.unknown'
  }
  const keyByKind = {
    policy: 'identity.passwordChange.errors.policy',
    forbidden: 'identity.passwordChange.errors.forbidden',
    'session-changed': 'identity.passwordChange.errors.sessionChanged',
    'rate-limited': 'identity.passwordChange.errors.rateLimited',
    'service-unavailable': 'identity.passwordChange.errors.serviceUnavailable',
    aborted: undefined,
    'outcome-unknown': 'identity.passwordChange.errors.outcomeUnknown',
  } as const satisfies Record<
    ReturnType<typeof classifyPasswordChangeFailure>['kind'],
    PasswordChangeErrorKey | undefined
  >
  return keyByKind[classifyPasswordChangeFailure(error).kind]
}
