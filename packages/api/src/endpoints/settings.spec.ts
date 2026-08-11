import { describe, expect, it } from 'vitest'
import { settingsEndpoints } from './settings'

describe('Settings endpoints', () => {
  it('owns the exact three active config coordinates and policies', () => {
    expect(settingsEndpoints.configPublish).toMatchObject({
      method: 'POST',
      path: '/api/v1/settings/configs',
      successStatus: 201,
    })
    expect(settingsEndpoints.configGet).toMatchObject({
      method: 'GET',
      path: '/api/v1/settings/configs/{key}',
      successStatus: 200,
    })
    expect(settingsEndpoints.configDelete).toMatchObject({
      method: 'DELETE',
      path: '/api/v1/settings/configs/{key}',
      successStatus: 204,
    })
    expect(settingsEndpoints.configPublish.errorPolicy?.[413]).toEqual({
      code: 'ERR_CORE_PAYLOAD_TOO_LARGE',
      message: 'payload too large',
      retryable: false,
      details: 'empty',
    })
    expect(Object.isFrozen(settingsEndpoints)).toBe(true)
  })
})
