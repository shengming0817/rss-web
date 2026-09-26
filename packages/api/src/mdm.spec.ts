import { describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import AxiosMockAdapter from 'axios-mock-adapter'
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

it('rejects oversized UTF-8 JSON before dispatch and recognizes ingress 413 without raw body', async () => {
  const instance = axios.create()
  const mock = new AxiosMockAdapter(instance)
  mock.onAny().reply(200, {})
  const spy = vi.spyOn(axios, 'create').mockReturnValueOnce(instance)
  const transport = createMdmTransport()
  spy.mockRestore()
  await expect(
    transport.request({
      method: 'POST',
      path: '/api/v2/groups/{id}',
      pathParams: { id: 'group' },
      body: { value: '界'.repeat(6000) },
      successStatus: 200,
      decode: (v) => v,
    }),
  ).rejects.toMatchObject({ status: 413, cause: 'wire', code: 'request_too_large' })
  expect(mock.history.post).toHaveLength(0)
  expect(decodeMdmError(413, '<html>private upstream body</html>')).toMatchObject({
    status: 413,
    cause: 'wire',
    code: 'request_too_large',
  })
})

it('counts the complete encoded JSON body at the inclusive 16 KiB boundary', async () => {
  const instance = axios.create()
  const mock = new AxiosMockAdapter(instance)
  mock.onAny().reply(200, {})
  const spy = vi.spyOn(axios, 'create').mockReturnValueOnce(instance)
  const transport = createMdmTransport()
  spy.mockRestore()
  const request = (length: number) =>
    transport.request({
      method: 'PUT',
      path: '/api/v2/groups/group',
      body: { value: 'a'.repeat(length) },
      successStatus: 200,
      decode: (v) => v,
    })
  await expect(request(16_384 - 12)).resolves.toEqual({})
  await expect(request(16_384 - 11)).rejects.toMatchObject({ status: 413, cause: 'wire' })
  expect(mock.history.put).toHaveLength(1)
  expect(new TextEncoder().encode(mock.history.put[0]!.data).byteLength).toBe(16_384)
})
