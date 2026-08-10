import { describe, expect, it } from 'vitest'
import { auditEndpoints } from './audit'

describe('Audit endpoint coordinates', () => {
  it('owns only the ambient-tenant list coordinate for this slice', () => {
    expect(auditEndpoints.listEntries).toEqual({
      method: 'GET',
      path: '/api/v1/audit/entries',
      successStatus: 200,
    })
    expect(Object.isFrozen(auditEndpoints.listEntries)).toBe(true)
  })
})
