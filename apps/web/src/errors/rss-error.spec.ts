import { describe, expect, it } from 'vitest'
import {
  networkErrorForTest,
  protocolErrorForTest,
  timeoutErrorForTest,
  decodeWireErrorForTest,
} from '@rss/api/testing'
import { toSafeErrorPresentation, toSafeReadErrorPresentation } from './rss-error'

function wire(status: number, code: string) {
  return decodeWireErrorForTest(status, {
    error: {
      code,
      message: 'backend message must not render',
      retryable: status === 429 || status >= 500,
      details: [{ secret: 'must-not-render' }],
      requestId: 'request-id',
    },
  })
}

describe('safe RSS error presentation', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'notFound'],
    [409, 'conflict'],
    [429, 'rateLimited'],
    [500, 'serviceUnavailable'],
    [503, 'serviceUnavailable'],
  ] as const)('maps HTTP %s to %s without raw data', (status, kind) => {
    const result = toSafeErrorPresentation(wire(status, `ERR_${status}`))
    expect(result).toEqual({
      kind,
      code: `ERR_${status}`,
      retryable: status === 429 || status >= 500,
      recovery: status === 401 ? 'signIn' : status === 429 || status >= 500 ? 'retry' : 'home',
      requestId: 'request-id',
    })
    expect(result).not.toHaveProperty('message')
    expect(result).not.toHaveProperty('safeDetails')
    expect(JSON.stringify(result)).not.toContain('must-not-render')
  })

  it.each([
    [networkErrorForTest(), 'serviceUnavailable', 'NETWORK_ERROR'],
    [timeoutErrorForTest(), 'serviceUnavailable', 'REQUEST_TIMEOUT'],
    [protocolErrorForTest(), 'invalidResponse', 'INVALID_RESPONSE'],
  ] as const)(
    'maps sanitized transport failures without response internals',
    (error, kind, code) => {
      expect(toSafeErrorPresentation(error)).toEqual({
        kind,
        code,
        retryable: false,
        recovery: 'home',
      })
    },
  )

  it('fails closed for unbranded errors', () => {
    expect(toSafeErrorPresentation(new Error('raw secret'))).toEqual({
      kind: 'unknown',
      code: 'WEB_UNKNOWN',
      retryable: false,
      recovery: 'home',
    })
  })

  it.each([
    networkErrorForTest(),
    timeoutErrorForTest(),
    protocolErrorForTest(502),
    protocolErrorForTest(504),
  ])('offers only user-triggered retry for transient idempotent read failures', (error) => {
    expect(toSafeReadErrorPresentation(error)).toMatchObject({
      retryable: true,
      recovery: 'retry',
    })
  })

  it('does not broaden manual retry to unrelated protocol failures', () => {
    expect(toSafeReadErrorPresentation(protocolErrorForTest(503))).toMatchObject({
      retryable: false,
      recovery: 'home',
    })
  })
})
