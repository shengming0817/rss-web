import type { RssApiErrorCause, RssApiErrorInit, SafeDetail } from './types'

const WIRE_ERROR_KEYS = ['code', 'details', 'message', 'requestId', 'retryable'] as const
const ERROR_CODE = /^ERR_[A-Z0-9_]+$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function decodeDetails(value: unknown): SafeDetail[] | null {
  if (!Array.isArray(value)) return null
  const details: SafeDetail[] = []
  for (const item of value) {
    if (!isRecord(item) || Object.keys(item).length !== 1) return null
    const detailValue = Object.values(item)[0]
    if (
      typeof detailValue !== 'string' &&
      typeof detailValue !== 'boolean' &&
      !(typeof detailValue === 'number' && Number.isFinite(detailValue))
    ) {
      return null
    }
    details.push(Object.freeze({ ...item }) as SafeDetail)
  }
  return details
}

export class RssApiError extends Error {
  override readonly cause: RssApiErrorCause
  readonly code: string
  readonly messageKey: string
  readonly retryable: boolean
  readonly safeDetails: readonly SafeDetail[]
  declare readonly status?: number
  declare readonly requestId?: string

  constructor(init: RssApiErrorInit) {
    super(init.messageKey)
    this.name = 'RssApiError'
    this.cause = init.cause
    this.code = init.code
    this.messageKey = init.messageKey
    this.retryable = init.retryable
    this.safeDetails = Object.freeze([...(init.safeDetails ?? [])])
    if (init.status !== undefined) this.status = init.status
    if (init.requestId !== undefined) this.requestId = init.requestId
  }
}

function genericError(cause: RssApiErrorCause, code: string, messageKey: string, status?: number) {
  return new RssApiError({
    cause,
    code,
    messageKey,
    retryable: false,
    ...(status === undefined ? {} : { status }),
  })
}

export function protocolError(status?: number): RssApiError {
  return genericError('protocol', 'INVALID_RESPONSE', 'errors.invalidResponse', status)
}

export function clientError(): RssApiError {
  return genericError('client', 'INVALID_REQUEST', 'errors.invalidRequest')
}

export function abortedError(): RssApiError {
  return genericError('aborted', 'REQUEST_ABORTED', 'errors.requestAborted')
}

export function timeoutError(): RssApiError {
  return genericError('timeout', 'REQUEST_TIMEOUT', 'errors.requestTimeout')
}

export function networkError(): RssApiError {
  return genericError('network', 'NETWORK_ERROR', 'errors.network')
}

export function decodeWireError(status: number, value: unknown): RssApiError {
  if (!isRecord(value) || !hasExactKeys(value, ['error']) || !isRecord(value.error)) {
    return protocolError(status)
  }
  const error = value.error
  if (!hasExactKeys(error, WIRE_ERROR_KEYS)) return protocolError(status)

  const { code, message, retryable, details, requestId } = error
  const safeDetails = decodeDetails(details)
  if (
    typeof code !== 'string' ||
    !ERROR_CODE.test(code) ||
    typeof message !== 'string' ||
    typeof retryable !== 'boolean' ||
    typeof requestId !== 'string' ||
    requestId.trim().length === 0 ||
    safeDetails === null
  ) {
    return protocolError(status)
  }

  return new RssApiError({
    cause: 'wire',
    code,
    messageKey: `errors.${code}`,
    retryable,
    status,
    requestId,
    safeDetails: status >= 500 ? [] : safeDetails,
  })
}
