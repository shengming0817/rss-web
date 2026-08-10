import { describe, expect, it } from 'vitest'
import { auditEndpoints } from './audit'

describe('Audit endpoint coordinates', () => {
  it('owns the ambient and explicit-target list coordinates', () => {
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
    expect(auditEndpoints.listTenantEntries).toEqual({
      method: 'GET',
      path: '/api/v1/audit/tenants/{tenantId}/entries',
      successStatus: 200,
    })
    expect(Object.isFrozen(auditEndpoints.listTenantEntries)).toBe(true)
  })
})
