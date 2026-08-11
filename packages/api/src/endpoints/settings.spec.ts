import { describe, expect, it } from 'vitest'
import { settingsEndpoints } from './settings'

describe('Settings endpoints', () => {
  it('owns the exact four active config coordinates and policies', () => {
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
    expect(settingsEndpoints.configRollback).toMatchObject({
      method: 'POST',
      path: '/api/v1/settings/configs/{key}/rollbacks',
      successStatus: 201,
    })
    expect(settingsEndpoints.configRollback.errorPolicy).toEqual({
      400: expect.objectContaining({ code: 'ERR_CORE_VALIDATION' }),
      404: expect.objectContaining({ code: 'ERR_CORE_NOT_FOUND' }),
      409: expect.arrayContaining([
        expect.objectContaining({ code: 'ERR_CORE_VERSION_CONFLICT' }),
        expect.objectContaining({ code: 'ERR_CORE_OUTBOX_FACT_CONFLICT' }),
      ]),
      413: expect.objectContaining({ code: 'ERR_CORE_PAYLOAD_TOO_LARGE' }),
      500: expect.objectContaining({ code: 'ERR_CORE_INTERNAL' }),
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
