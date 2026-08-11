import { isRssApiError } from '@rss/api'

export function isWriteOutcomeUnknown(error: unknown): boolean {
  if (!isRssApiError(error)) return true
  return (
    error.cause === 'network' ||
    error.cause === 'timeout' ||
    error.cause === 'protocol' ||
    error.cause === 'aborted' ||
    (error.cause === 'wire' &&
      (error.status === 500 ||
        (error.status === 503 && error.code !== 'ERR_CORE_PROVIDER_UNAVAILABLE')))
  )
}
