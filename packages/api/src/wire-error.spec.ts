import { describe, expect, it } from 'vitest'
import { decodeWireError, protocolError } from './wire-error'

const envelope = (overrides: Record<string, unknown> = {}) => ({
  error: {
    code: 'ERR_VALIDATION',
    message: 'server-owned message',
    retryable: false,
    details: [{ field: 'username' }, { limit: 10 }, { active: false }],
    requestId: 'rid-1',
    ...overrides,
  },
})

describe('decodeWireError', () => {
  it('maps a valid 4xx envelope without exposing the server message', () => {
    const error = decodeWireError(400, envelope())
    expect(error).toMatchObject({
      cause: 'wire',
      status: 400,
      code: 'ERR_VALIDATION',
      messageKey: 'errors.ERR_VALIDATION',
      retryable: false,
      requestId: 'rid-1',
      safeDetails: [{ field: 'username' }, { limit: 10 }, { active: false }],
    })
    expect(JSON.stringify(error)).not.toContain('server-owned message')
  })

  it.each([500, 503])('strips hostile details from %s responses', (status) => {
    const error = decodeWireError(
      status,
      envelope({ details: [{ token: 'secret' }], message: 'database password' }),
    )
    expect(error.safeDetails).toEqual([])
    expect(JSON.stringify(error)).not.toContain('secret')
    expect(JSON.stringify(error)).not.toContain('database password')
  })

  it('preserves service-owned retryability and request id', () => {
    expect(
      decodeWireError(429, envelope({ code: 'ERR_TOO_MANY_REQUESTS', retryable: true })),
    ).toMatchObject({ retryable: true, requestId: 'rid-1' })
  })

  it.each([401, 403, 409, 429])('keeps %s as a wire-error coordinate', (status) => {
    expect(decodeWireError(status, envelope())).toMatchObject({ cause: 'wire', status })
  })

  it.each([
    null,
    {},
    { error: {} },
    envelope({ code: 'not-closed' }),
    envelope({ requestId: '' }),
    envelope({ requestId: '   ' }),
    envelope({ retryable: 'true' }),
    envelope({ details: [{ a: 1, b: 2 }] }),
    envelope({ details: [{ nested: { value: 1 } }] }),
    envelope({ extra: true }),
  ])('fails closed for malformed wire input %#', (body) => {
    const error = decodeWireError(400, body)
    expect(error).toMatchObject({
      cause: 'protocol',
      code: 'INVALID_RESPONSE',
      safeDetails: [],
      retryable: false,
    })
    expect(JSON.stringify(error)).not.toContain(JSON.stringify(body))
  })

  it('creates generic protocol errors without a raw body or cause', () => {
    expect(protocolError(502)).toMatchObject({ cause: 'protocol', status: 502 })
    expect(protocolError()).not.toHaveProperty('status')
  })
})
