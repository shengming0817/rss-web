import { isRssApiError } from '@rss/api'
import type { SafeErrorKind, SafeErrorPresentation } from '@rss/core'

function kindFor(error: { readonly cause: string; readonly status?: number }): SafeErrorKind {
  switch (error.status) {
    case 401:
      return 'unauthorized'
    case 403:
      return 'forbidden'
    case 404:
      return 'notFound'
    case 409:
      return 'conflict'
    case 429:
      return 'rateLimited'
    default:
      if (error.status !== undefined && error.status >= 500) return 'serviceUnavailable'
      if (error.cause === 'network' || error.cause === 'timeout') return 'serviceUnavailable'
      if (error.cause === 'protocol') return 'invalidResponse'
      return 'unknown'
  }
}

export function toSafeErrorPresentation(error: unknown): SafeErrorPresentation {
  if (!isRssApiError(error)) {
    return Object.freeze({
      kind: 'unknown',
      code: 'WEB_UNKNOWN',
      retryable: false,
      recovery: 'home',
    })
  }
  const base = {
    kind: kindFor(error),
    code: error.code,
    retryable: error.retryable,
    recovery:
      error.status === 401
        ? ('signIn' as const)
        : error.retryable
          ? ('retry' as const)
          : ('home' as const),
  }
  return Object.freeze(
    error.requestId === undefined ? base : { ...base, requestId: error.requestId },
  )
}
