import type { AxiosError } from 'axios'
import type { GoCellHTTPErrorResponse } from '@gocell/contracts'
import type { GoCellRequestError } from './types'

function isAxiosError(err: unknown): err is AxiosError {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as Record<string, unknown>)['isAxiosError'] === true
  )
}

/**
 * Type guard for caught `unknown` errors originating from the `http` instance.
 * Lets callers narrow before reading `.i18nKey` / `.response` instead of an
 * unchecked `as` cast (every interceptor-rejected error carries `i18nKey`,
 * which is optional on the type, so an AxiosError satisfies GoCellRequestError).
 */
export function isGoCellRequestError(err: unknown): err is GoCellRequestError {
  return isAxiosError(err)
}

function isGoCellErrorEnvelope(data: unknown): data is GoCellHTTPErrorResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as Record<string, unknown>)['error'] === 'object' &&
    (data as Record<string, unknown>)['error'] !== null &&
    typeof (data as GoCellHTTPErrorResponse).error.code === 'string'
  )
}

export function toI18nKey(err: unknown): string {
  if (!isAxiosError(err)) {
    return 'errors.unknown'
  }

  // Network error: no response object
  if (!err.response) {
    return 'errors.network'
  }

  const data: unknown = err.response.data
  if (isGoCellErrorEnvelope(data)) {
    const safeCode = data.error.code.replace(/[^A-Z0-9_]/g, '_')
    return `errors.${safeCode}`
  }

  return 'errors.unknown'
}
