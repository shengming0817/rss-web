import { describe, expect, it } from 'vitest'
import { decodeEndpointError, decodeWireError, protocolError } from './wire-error'
import { auditEndpoints } from './endpoints/audit'
import { identityEndpoints } from './endpoints/identity'

const envelope = (overrides: Record<string, unknown> = {}) => ({
  error: {
    code: 'ERR_CORE_VALIDATION',
    message: 'server-owned message',
    retryable: false,
    details: [{ field: 'username' }, { limit: 10 }, { active: false }],
    requestId: 'rid-1',
    ...overrides,
  },
})

describe('decodeEndpointError', () => {
  const policy = {
    500: {
      code: 'ERR_CORE_INTERNAL',
      message: 'internal error',
      retryable: false,
      details: 'empty',
    },
    503: {
      code: 'ERR_CORE_PROVIDER_UNAVAILABLE',
      message: 'provider unavailable',
      retryable: true,
      details: 'empty',
    },
  } as const

  it('accepts only an endpoint-declared error coordinate', () => {
    expect(
      decodeEndpointError(
        503,
        envelope({
          code: 'ERR_CORE_PROVIDER_UNAVAILABLE',
          message: 'provider unavailable',
          retryable: true,
          details: [],
        }),
        policy,
      ),
    ).toMatchObject({ cause: 'wire', status: 503, code: 'ERR_CORE_PROVIDER_UNAVAILABLE' })
  })

  it.each([
    [502, envelope({ details: [] })],
    [503, envelope({ code: 'ERR_CORE_INTERNAL', retryable: true, details: [] })],
    [
      503,
      envelope({
        code: 'ERR_CORE_PROVIDER_UNAVAILABLE',
        message: 'drifted',
        retryable: true,
        details: [],
      }),
    ],
    [503, envelope({ code: 'ERR_CORE_PROVIDER_UNAVAILABLE', retryable: false, details: [] })],
    [503, envelope({ code: 'ERR_CORE_PROVIDER_UNAVAILABLE', retryable: true })],
  ] as const)('fails closed for undeclared or drifting endpoint errors %#', (status, body) => {
    expect(decodeEndpointError(status, body, policy)).toMatchObject({ cause: 'protocol', status })
  })

  it.each([401, 403])('preserves the shared authenticated %s path', (status) => {
    expect(decodeEndpointError(status, envelope(), policy)).toMatchObject({
      cause: 'wire',
      status,
    })
  })

  it.each([
    [400, 'ERR_CORE_VALIDATION', 'validation error', false, [{ field: 'newPassword' }]],
    [404, 'ERR_CORE_NOT_FOUND', 'not found', false, []],
    [409, 'ERR_CORE_VERSION_CONFLICT', 'version conflict', true, []],
    [500, 'ERR_CORE_INTERNAL', 'internal error', false, []],
  ] as const)(
    'accepts the pinned password-change %s coordinate',
    (status, code, message, retryable, details) => {
      expect(
        decodeEndpointError(
          status,
          envelope({ code, message, retryable, details }),
          identityEndpoints.passwordChange.errorPolicy,
        ),
      ).toMatchObject({ cause: 'wire', status, code, retryable })
    },
  )

  it.each([
    [400, envelope({ message: 'validation failed' })],
    [409, envelope({ code: 'ERR_CORE_VERSION_CONFLICT', message: 'version conflict' })],
    [418, envelope({ details: [] })],
  ] as const)('fails closed for drifting password-change coordinates %#', (status, body) => {
    expect(
      decodeEndpointError(status, body, identityEndpoints.passwordChange.errorPolicy),
    ).toMatchObject({ cause: 'protocol', status })
  })

  it.each([
    [400, 'ERR_CORE_VALIDATION', 'validation error'],
    [500, 'ERR_CORE_INTERNAL', 'internal error'],
    [501, 'ERR_CORE_NOT_IMPLEMENTED', 'not implemented'],
  ] as const)('accepts the reviewed target Audit %s coordinate', (status, code, message) => {
    expect(
      decodeEndpointError(
        status,
        envelope({ code, message, retryable: false, details: [] }),
        auditEndpoints.listTenantEntries.errorPolicy,
      ),
    ).toMatchObject({ cause: 'wire', status, code })
  })

  it.each([
    [418, envelope({ details: [] })],
    [400, envelope({ code: 'ERR_CORE_INTERNAL', message: 'validation error', details: [] })],
    [500, envelope({ code: 'ERR_CORE_INTERNAL', message: 'drifted', details: [] })],
    [
      501,
      envelope({
        code: 'ERR_CORE_NOT_IMPLEMENTED',
        message: 'not implemented',
        retryable: true,
        details: [],
      }),
    ],
    [501, envelope({ code: 'ERR_CORE_NOT_IMPLEMENTED', message: 'not implemented' })],
  ] as const)('fails closed for target Audit undeclared or drifting errors %#', (status, body) => {
    expect(
      decodeEndpointError(status, body, auditEndpoints.listTenantEntries.errorPolicy),
    ).toMatchObject({ cause: 'protocol', status })
  })

  it('preserves only the canonical shared rate-limit coordinate', () => {
    const canonical = envelope({
      code: 'ERR_CORE_TOO_MANY_REQUESTS',
      message: 'too many requests',
      retryable: true,
      details: [],
    })
    expect(decodeEndpointError(429, canonical, policy)).toMatchObject({
      cause: 'wire',
      status: 429,
      code: 'ERR_CORE_TOO_MANY_REQUESTS',
      retryable: true,
    })
  })

  it('preserves only the canonical shared request-budget coordinate', () => {
    const canonical = envelope({
      code: 'ERR_CORE_UNAVAILABLE',
      message: 'service unavailable',
      retryable: false,
      details: [],
    })
    expect(decodeEndpointError(503, canonical)).toMatchObject({
      cause: 'wire',
      status: 503,
      code: 'ERR_CORE_UNAVAILABLE',
      retryable: false,
    })
    for (const error of [
      { ...canonical.error, code: 'ERR_CORE_PROVIDER_UNAVAILABLE' },
      { ...canonical.error, message: 'drifted' },
      { ...canonical.error, retryable: true },
      { ...canonical.error, details: [{ leaked: true }] },
    ]) {
      expect(decodeEndpointError(503, { error })).toMatchObject({
        cause: 'protocol',
        status: 503,
      })
    }
  })

  it.each([
    envelope({
      code: 'ERR_TOO_MANY_REQUESTS',
      message: 'too many requests',
      retryable: true,
      details: [],
    }),
    envelope({
      code: 'ERR_CORE_TOO_MANY_REQUESTS',
      message: 'drifted',
      retryable: true,
      details: [],
    }),
    envelope({
      code: 'ERR_CORE_TOO_MANY_REQUESTS',
      message: 'too many requests',
      retryable: false,
      details: [],
    }),
    envelope({
      code: 'ERR_CORE_TOO_MANY_REQUESTS',
      message: 'too many requests',
      retryable: true,
      details: [{ retryAfter: 1 }],
    }),
  ])('fails closed for a drifting shared 429 coordinate %#', (body) => {
    expect(decodeEndpointError(429, body, policy)).toMatchObject({
      cause: 'protocol',
      status: 429,
    })
  })
})

describe('decodeWireError', () => {
  it('maps a valid 4xx envelope without exposing the server message', () => {
    const error = decodeWireError(400, envelope())
    expect(error).toMatchObject({
      cause: 'wire',
      status: 400,
      code: 'ERR_CORE_VALIDATION',
      messageKey: 'errors.validation',
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

  it('maps only reviewed wire codes and falls back safely for unknown codes', () => {
    expect(decodeWireError(400, envelope()).messageKey).toBe('errors.validation')
    expect(decodeWireError(500, envelope({ code: 'ERR_CORE_INTERNAL' })).messageKey).toBe(
      'errors.unknown',
    )
    expect(decodeWireError(409, envelope({ code: 'ERR_FUTURE_CODE' })).messageKey).toBe(
      'errors.unknown',
    )
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
    envelope({ requestId: 'x'.repeat(129) }),
    envelope({ requestId: 'request\nid' }),
    envelope({ requestId: 'request\u202eid' }),
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
