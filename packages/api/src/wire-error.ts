import type {
  RssApiError,
  RssApiErrorCause,
  RssApiErrorInit,
  RssApiMessageKey,
  SafeDetail,
  EndpointErrorPolicy,
  EndpointErrorRule,
} from './types'

const WIRE_ERROR_KEYS = ['code', 'details', 'message', 'requestId', 'retryable'] as const
const ERROR_CODE = /^ERR_[A-Z0-9_]+$/
const REQUEST_ID = /^[\x21-\x7e]{1,128}$/
const WIRE_MESSAGE_KEYS: Readonly<Record<string, RssApiMessageKey>> = {
  ERR_CORE_VALIDATION: 'errors.validation',
  ERR_CORE_INTERNAL: 'errors.unknown',
}
const SHARED_RATE_LIMIT = {
  code: 'ERR_CORE_TOO_MANY_REQUESTS',
  message: 'too many requests',
  retryable: true,
  details: 'empty',
} as const
const SHARED_REQUEST_BUDGET = {
  code: 'ERR_CORE_UNAVAILABLE',
  message: 'service unavailable',
  retryable: false,
  details: 'empty',
} as const

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

class RssApiErrorImpl extends Error implements RssApiError {
  override readonly name = 'RssApiError' as const
  override readonly cause: RssApiErrorCause
  readonly code: string
  readonly messageKey: RssApiMessageKey
  readonly retryable: boolean
  readonly safeDetails: readonly SafeDetail[]
  declare readonly status?: number
  declare readonly requestId?: string

  constructor(init: RssApiErrorInit) {
    super(init.messageKey)
    this.cause = init.cause
    this.code = init.code
    this.messageKey = init.messageKey
    this.retryable = init.retryable
    this.safeDetails = Object.freeze([...(init.safeDetails ?? [])])
    if (init.status !== undefined) this.status = init.status
    if (init.requestId !== undefined) this.requestId = init.requestId
  }
}

export function isRssApiError(value: unknown): value is RssApiError {
  return value instanceof RssApiErrorImpl
}

function genericError(
  cause: RssApiErrorCause,
  code: string,
  messageKey: RssApiMessageKey,
  status?: number,
) {
  return new RssApiErrorImpl({
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
    !REQUEST_ID.test(requestId) ||
    safeDetails === null
  ) {
    return protocolError(status)
  }

  return new RssApiErrorImpl({
    cause: 'wire',
    code,
    messageKey: WIRE_MESSAGE_KEYS[code] ?? 'errors.unknown',
    retryable,
    status,
    requestId,
    safeDetails: status >= 500 ? [] : safeDetails,
  })
}

export function decodeEndpointError(
  status: number,
  value: unknown,
  policy?: EndpointErrorPolicy,
): RssApiError {
  if (status === 429) return decodeAgainstRule(status, value, SHARED_RATE_LIMIT)
  if (status === 503) {
    const budget = decodeAgainstRule(status, value, SHARED_REQUEST_BUDGET)
    if (budget.cause === 'wire') return budget
  }
  if (status === 401 || (status === 403 && policy?.[status] === undefined))
    return decodeWireError(status, value)
  if (policy === undefined)
    return status === 503 ? protocolError(status) : decodeWireError(status, value)
  const rule = policy[status]
  if (rule === undefined) return protocolError(status)
  const rules = Array.isArray(rule) ? rule : [rule]
  for (const candidate of rules) {
    const decoded = decodeAgainstRule(status, value, candidate)
    if (decoded.cause === 'wire') return decoded
  }
  return protocolError(status)
}

function decodeAgainstRule(status: number, value: unknown, rule: EndpointErrorRule): RssApiError {
  const decoded = decodeWireError(status, value)
  if (
    decoded.cause !== 'wire' ||
    decoded.code !== rule.code ||
    decoded.retryable !== rule.retryable ||
    !isRecord(value) ||
    !isRecord(value.error) ||
    value.error.message !== rule.message
  )
    return protocolError(status)
  const wire = isRecord(value) && isRecord(value.error) ? value.error : undefined
  if (rule.details === 'empty' && (!Array.isArray(wire?.details) || wire.details.length !== 0))
    return protocolError(status)
  return decoded
}
