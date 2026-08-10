import { describe, expect, it } from 'vitest'
import { runtimeEndpoints } from './runtime'

describe('Runtime endpoint coordinates', () => {
  it('owns the exact authenticated Admin inventory coordinate', () => {
    expect(runtimeEndpoints.inventory).toEqual({
      method: 'GET',
      path: '/api/v1/runtime/inventory',
      successStatus: 200,
      errorPolicy: {
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
      },
    })
    expect(Object.isFrozen(runtimeEndpoints.inventory)).toBe(true)
    expect(Object.isFrozen(runtimeEndpoints.inventory.errorPolicy)).toBe(true)
  })
})
