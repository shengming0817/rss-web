import { isRssApiError } from '@rss/api'
import { isIdentitySessionError } from './errors'

export type PasswordChangeFailureKind =
  | 'policy'
  | 'forbidden'
  | 'session-changed'
  | 'rate-limited'
  | 'service-unavailable'
  | 'aborted'
  | 'outcome-unknown'

export interface PasswordChangeFailureDisposition {
  readonly kind: PasswordChangeFailureKind
  readonly preserveAuthority: boolean
}

const disposition = (
  kind: PasswordChangeFailureKind,
  preserveAuthority: boolean,
): PasswordChangeFailureDisposition => Object.freeze({ kind, preserveAuthority })

const POLICY = disposition('policy', true)
const FORBIDDEN = disposition('forbidden', true)
const SESSION_CHANGED = disposition('session-changed', false)
const RATE_LIMITED = disposition('rate-limited', true)
const SERVICE_UNAVAILABLE = disposition('service-unavailable', true)
const ABORTED = disposition('aborted', false)
const OUTCOME_UNKNOWN = disposition('outcome-unknown', false)

/** Closed product semantics shared by the session owner and Web presentation. */
export function classifyPasswordChangeFailure(error: unknown): PasswordChangeFailureDisposition {
  if (isIdentitySessionError(error)) return SESSION_CHANGED
  if (!isRssApiError(error)) return OUTCOME_UNKNOWN
  if (error.cause === 'aborted') return ABORTED
  if (error.cause !== 'wire') return OUTCOME_UNKNOWN
  if (error.status === 400) return POLICY
  if (error.status === 403) return FORBIDDEN
  if (error.status === 429) return RATE_LIMITED
  if (error.status === 503) return SERVICE_UNAVAILABLE
  if (error.status === 401 || error.status === 404 || error.status === 409) {
    return SESSION_CHANGED
  }
  return OUTCOME_UNKNOWN
}
