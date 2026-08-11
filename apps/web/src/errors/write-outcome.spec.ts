import {
  abortedErrorForTest,
  decodeWireErrorForTest,
  networkErrorForTest,
  protocolErrorForTest,
  timeoutErrorForTest,
} from '@rss/api/testing'
import { describe, expect, it } from 'vitest'
import { isWriteOutcomeUnknown } from './write-outcome'

function wire(status: number, code: string, retryable = false) {
  return decodeWireErrorForTest(status, {
    error: {
      code,
      message: code === 'ERR_CORE_PROVIDER_UNAVAILABLE' ? 'provider unavailable' : 'reviewed',
      retryable,
      details: [],
      requestId: `write-${status}`,
    },
  })
}

describe('write outcome classification', () => {
  it.each([
    networkErrorForTest(),
    timeoutErrorForTest(),
    abortedErrorForTest(),
    protocolErrorForTest(201),
    wire(500, 'ERR_CORE_INTERNAL'),
    wire(503, 'ERR_CORE_INTERNAL'),
    new Error('unsealed failure'),
  ])('treats commit-unknown failures as unknown', (error) => {
    expect(isWriteOutcomeUnknown(error)).toBe(true)
  })

  it.each([
    wire(400, 'ERR_CORE_VALIDATION'),
    wire(401, 'ERR_CORE_UNAUTHENTICATED'),
    wire(403, 'ERR_CORE_FORBIDDEN'),
    wire(404, 'ERR_CORE_NOT_FOUND'),
    wire(409, 'ERR_CORE_VERSION_CONFLICT', true),
    wire(413, 'ERR_CORE_PAYLOAD_TOO_LARGE'),
    wire(429, 'ERR_CORE_RATE_LIMITED', true),
    wire(503, 'ERR_CORE_PROVIDER_UNAVAILABLE', true),
  ])('keeps reviewed final responses definite', (error) => {
    expect(isWriteOutcomeUnknown(error)).toBe(false)
  })
})
