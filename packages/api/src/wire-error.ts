import type { RssApiError, RssApiErrorCause } from './types'

class RssApiErrorImpl extends Error implements RssApiError {
  override readonly name = 'RssApiError' as const
  declare readonly status?: number
  constructor(
    override readonly cause: RssApiErrorCause,
    readonly code: string,
    status?: number,
  ) {
    super(code)
    if (status !== undefined) this.status = status
  }
}

export function isRssApiError(value: unknown): value is RssApiError {
  return value instanceof RssApiErrorImpl
}
export function protocolError(status?: number): RssApiError {
  return new RssApiErrorImpl('protocol', 'INVALID_RESPONSE', status)
}
export function clientError(): RssApiError {
  return new RssApiErrorImpl('client', 'INVALID_REQUEST')
}
export function abortedError(): RssApiError {
  return new RssApiErrorImpl('aborted', 'REQUEST_ABORTED')
}
export function timeoutError(): RssApiError {
  return new RssApiErrorImpl('timeout', 'REQUEST_TIMEOUT')
}
export function networkError(): RssApiError {
  return new RssApiErrorImpl('network', 'NETWORK_ERROR')
}
export function identityWireFailure(status: number, code: string): RssApiError {
  return new RssApiErrorImpl('wire', code, status)
}
