import { describe, expect, it } from 'vitest'
import { auditEndpoints } from './audit'

describe('Audit endpoint coordinates', () => {
  it('owns only the ambient-tenant list coordinate for this slice', () => {
    expect(auditEndpoints.listEntries).toEqual({
      method: 'GET',
      path: '/api/v1/audit/entries',
      successStatus: 200,
      errorPolicy: {
        400: {
          code: 'ERR_CORE_VALIDATION',
          message: 'validation error',
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
    })
    expect(Object.isFrozen(auditEndpoints.listEntries)).toBe(true)
  })
})
