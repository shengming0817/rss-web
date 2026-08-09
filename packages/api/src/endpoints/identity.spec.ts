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
    })
    expect(Object.isFrozen(identityEndpoints)).toBe(true)
    for (const coordinate of Object.values(identityEndpoints)) {
      expect(Object.isFrozen(coordinate)).toBe(true)
    }
  })
})
