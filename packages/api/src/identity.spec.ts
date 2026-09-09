import { describe, expect, it } from 'vitest'
import { decodeIdentityError } from './identity'
describe('Identity errors never fall back to the RSS bearer wire', () => {
  it('distinguishes permissions from expired credentials', () => {
    expect(decodeIdentityError(403, { code: 'insufficient_privilege' }, false).code).toBe(
      'insufficient_privilege',
    )
    expect(decodeIdentityError(401, { code: 'invalid_credential' }, false).status).toBe(401)
  })
  it('rejects unknown, mismatched and legacy responses', () => {
    for (const value of [
      { code: 'unknown' },
      { code: 'invalid_credential', password: 'private' },
      { error: { code: 'ERR_CORE_FORBIDDEN' } },
    ]) {
      expect(decodeIdentityError(403, value, false).cause).toBe('protocol')
    }
    expect(decodeIdentityError(200, { code: 'identity_unavailable' }, false).cause).toBe('protocol')
  })
})
