import { describe, expect, it } from 'vitest'
import { identityEndpoints } from './identity'

describe('Identity endpoint coordinates', () => {
  it('defines each selected contract exactly once', () => {
    expect(identityEndpoints).toEqual({
      login: { method: 'POST', path: '/api/v1/identity/login', successStatus: 201 },
      refresh: { method: 'POST', path: '/api/v1/identity/refresh', successStatus: 201 },
      profile: { method: 'GET', path: '/api/v1/identity/profile', successStatus: 200 },
      logout: { method: 'POST', path: '/api/v1/identity/logout', successStatus: 200 },
      logoutAll: { method: 'POST', path: '/api/v1/identity/logout-all', successStatus: 200 },
      passwordChange: {
        method: 'POST',
        path: '/api/v1/identity/password/change',
        successStatus: 200,
        errorPolicy: {
          400: {
            code: 'ERR_CORE_VALIDATION',
            message: 'validation failed',
            retryable: false,
            details: 'public',
          },
          404: {
            code: 'ERR_CORE_NOT_FOUND',
            message: 'not found',
            retryable: false,
            details: 'empty',
          },
          409: {
            code: 'ERR_CORE_VERSION_CONFLICT',
            message: 'version conflict',
            retryable: false,
            details: 'empty',
          },
          500: {
            code: 'ERR_CORE_INTERNAL',
            message: 'internal error',
            retryable: false,
            details: 'empty',
          },
        },
      },
    })
    expect(Object.isFrozen(identityEndpoints)).toBe(true)
    for (const coordinate of Object.values(identityEndpoints)) {
      expect(Object.isFrozen(coordinate)).toBe(true)
    }
  })
})
