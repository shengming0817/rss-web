import { describe, expect, it } from 'vitest'
import { runtimeEndpoints } from './runtime'

describe('Runtime endpoint coordinates', () => {
  it('owns the exact authenticated Admin inventory coordinate', () => {
    expect(runtimeEndpoints.inventory).toEqual({
      method: 'GET',
      path: '/api/v1/runtime/inventory',
      successStatus: 200,
    })
    expect(Object.isFrozen(runtimeEndpoints.inventory)).toBe(true)
  })
})
