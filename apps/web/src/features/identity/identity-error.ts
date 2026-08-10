import { isRssApiError } from '@rss/api'
import { isIdentitySessionError } from '@rss/identity'

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
