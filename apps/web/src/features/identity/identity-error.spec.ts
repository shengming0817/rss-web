import { describe, expect, it } from 'vitest'
import {
  abortedErrorForTest,
  decodeWireErrorForTest,
  networkErrorForTest,
  protocolErrorForTest,
  timeoutErrorForTest,
} from '@rss/api/testing'
import { identityErrorKey } from './identity-error'

function wire(status: number, code = 'ERR_CORE_UNAUTHENTICATED') {
  return decodeWireErrorForTest(status, {
    error: {
      code,
      message: 'must never reach the UI',
      retryable: false,
      details: [],
      requestId: 'request-id',
    },
  })
}

describe('identity UI safe error mapping', () => {
  it.each([
    [wire(401), 'identity.errors.invalidCredentials'],
    [wire(403), 'identity.errors.forbidden'],
    [wire(409), 'identity.errors.conflict'],
    [wire(429), 'identity.errors.rateLimited'],
    [wire(500), 'identity.errors.serviceUnavailable'],
    [wire(503), 'identity.errors.serviceUnavailable'],
  ])('maps status without exposing backend text', (error, key) => {
    expect(identityErrorKey(error)).toBe(key)
    expect(identityErrorKey(error)).not.toContain('must never reach')
  })

  it('maps unknown failures to a closed generic key', () => {
    expect(identityErrorKey(new Error('secret-bearing failure'))).toBe('identity.errors.unknown')
  })

  it.each([
    [networkErrorForTest(), 'identity.errors.connection'],
    [timeoutErrorForTest(), 'identity.errors.timeout'],
    [protocolErrorForTest(200), 'identity.errors.invalidResponse'],
    [abortedErrorForTest(), undefined],
  ])('maps safe transport causes without using error text', (error, key) => {
    expect(identityErrorKey(error)).toBe(key)
  })
})
