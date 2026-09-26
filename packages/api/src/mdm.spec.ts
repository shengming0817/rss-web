import { describe, expect, it } from 'vitest'
import { createMdmTransport, decodeMdmError } from './mdm'
describe('MDM HTTP boundary', () => {
  it('rejects Identity paths, unversioned paths and local tenant/authorization headers', async () => {
    const transport = createMdmTransport()
    for (const path of [
      '/api/v2/tenants/{tenant}/login',
      '/api/private',
      '/api/v4/devices',
      '//other.test/api/v1/devices',
    ]) {
      await expect(
        transport.request({ method: 'GET', path, successStatus: 200, decode: (v) => v }),
      ).rejects.toMatchObject({ cause: 'client' })
    }
    for (const key of ['Authorization', 'X-Tenant-ID']) {
      await expect(
        transport.request({
          method: 'GET',
          path: '/api/v1/devices',
          headers: { [key]: 'secret' },
          successStatus: 200,
          decode: (v) => v,
        }),
      ).rejects.toMatchObject({ cause: 'client' })
    }
  })
  it('sanitizes unknown envelopes and never retains raw errors', () => {
    expect(decodeMdmError(503, { password: 'secret' })).toMatchObject({
      cause: 'protocol',
      code: 'INVALID_RESPONSE',
    })
    expect(String(decodeMdmError(503, { password: 'secret' }))).not.toContain('secret')
  })
})

it('accepts product and embedded authentication errors without exposing server detail', () => {
  expect(decodeMdmError(403, { code: 'csrf_rejected' })).toMatchObject({
    cause: 'wire',
    code: 'csrf_rejected',
  })
  expect(decodeMdmError(503, { code: 'operation_unknown' })).toMatchObject({
    cause: 'wire',
    code: 'operation_unknown',
  })
  expect(
    decodeMdmError(409, { code: 'stale_plan', device: null, stage: 'capability' }),
  ).toMatchObject({ cause: 'wire' })
  expect(decodeMdmError(409, { code: 'stale_plan', device: {}, stage: 'capability' }).cause).toBe(
    'protocol',
  )
  expect(decodeMdmError(401, { code: 'permission_denied' }).cause).toBe('protocol')
})
