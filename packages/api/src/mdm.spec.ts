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

it('sends raw resource content unchanged only through the explicit content route', async () => {
  const instance = axios.create()
  const mock = new AxiosMockAdapter(instance)
  const spy = vi.spyOn(axios, 'create').mockReturnValueOnce(instance)
  const transport = createMdmTransport()
  spy.mockRestore()
  const bytes = new Uint8Array([0, 255, 128, 10]).buffer
  mock.onPost('/api/v3/resources/script/content').reply((config) => {
    expect(config.data).toBe(bytes)
    expect(config.headers?.['Content-Type']).toBe('application/octet-stream')
    return [201, '']
  })
  await expect(
    transport.request({
      method: 'POST',
      path: '/api/v3/resources/{id}/content',
      pathParams: { id: 'script' },
      headers: { 'Content-Type': 'application/octet-stream' },
      body: bytes,
      successStatus: 201,
      decode: (v) => {
        if (v !== '') throw new Error('Unexpected body')
      },
    }),
  ).resolves.toBeUndefined()
  await expect(
    transport.request({
      method: 'POST',
      path: '/api/v2/groups/group',
      body: bytes,
      successStatus: 200,
      decode: (v) => v,
    }),
  ).rejects.toMatchObject({ cause: 'client' })
  await expect(
    transport.request({
      method: 'GET',
      path: '/api/v3/resources/{id}/content',
      pathParams: { id: 'script' },
      body: bytes,
      successStatus: 200,
      decode: (v) => v,
    }),
  ).rejects.toMatchObject({ cause: 'client' })
  expect(mock.history.post).toHaveLength(1)
})

it('enforces the exact resource content byte budget without widening JSON routes', async () => {
  const instance = axios.create()
  const mock = new AxiosMockAdapter(instance)
  mock.onPost().reply(201, '')
  const spy = vi.spyOn(axios, 'create').mockReturnValueOnce(instance)
  const transport = createMdmTransport()
  spy.mockRestore()
  const upload = (body: unknown) =>
    transport.request({
      method: 'POST',
      path: '/api/v3/resources/{id}/content',
      pathParams: { id: 'script' },
      body,
      successStatus: 201,
      decode: (v) => v,
    })
  await expect(upload(new ArrayBuffer(16_777_216))).resolves.toBe('')
  await expect(upload(new ArrayBuffer(16_777_217))).rejects.toMatchObject({
    status: 413,
    cause: 'wire',
  })
  await expect(upload(new Uint8Array([1]).subarray(0, 1))).rejects.toMatchObject({
    cause: 'client',
  })
  await expect(upload({ text: 'wrong format' })).rejects.toMatchObject({ cause: 'client' })
  await expect(upload(new ArrayBuffer(0))).rejects.toMatchObject({ cause: 'client' })
  expect(mock.history.post).toHaveLength(1)
})

it('allows the published software catalog and candidate console without widening Identity or admitting arbitrary APIs', async () => {
  const instance = axios.create(),
    mock = new AxiosMockAdapter(instance)
  mock.onGet().reply(200, {})
  const spy = vi.spyOn(axios, 'create').mockReturnValueOnce(instance)
  const transport = createMdmTransport()
  spy.mockRestore()
  for (const path of [
    '/api/v3/software/sources/private/revisions/1',
    '/api/v3/software/resources/app/versions/1',
    '/api/mdm-candidate/v1/software/catalog',
  ])
    await expect(
      transport.request({ method: 'GET', path, successStatus: 200, decode: (v) => v }),
    ).resolves.toEqual({})
  await expect(
    transport.request({
      method: 'GET',
      path: '/api/v3/software-admin/secrets',
      successStatus: 200,
      decode: (v) => v,
    }),
  ).rejects.toMatchObject({ cause: 'client' })
  expect(mock.history.get).toHaveLength(3)
})

it('decodes a missing native software task through the transport as a definite not-found', async () => {
  const instance = axios.create()
  const mock = new AxiosMockAdapter(instance)
  const spy = vi.spyOn(axios, 'create').mockReturnValueOnce(instance)
  const transport = createMdmTransport()
  spy.mockRestore()
  mock.onGet('/api/v2/policies/policy/runs/missing').reply(404, { code: 'task_not_found' })
  await expect(
    transport.request({
      method: 'GET',
      path: '/api/v2/policies/policy/runs/missing',
      successStatus: 200,
      decode: (v) => v,
    }),
  ).rejects.toMatchObject({ cause: 'wire', status: 404, code: 'task_not_found' })
  expect(decodeMdmError(409, { code: 'task_not_found' }).cause).toBe('protocol')
})

it('dispatches native compliance routes through the product boundary with no path rewriting', async () => {
  const instance = axios.create(),
    mock = new AxiosMockAdapter(instance)
  mock.onAny().reply(200, {})
  const spy = vi.spyOn(axios, 'create').mockReturnValueOnce(instance),
    transport = createMdmTransport()
  spy.mockRestore()
  for (const path of [
    '/api/v2/compliance-rules',
    '/api/v2/compliance-rules/rule/versions/1',
    '/api/v2/compliance-rules/rule/tasks/task',
    '/api/v2/devices/device-01/compliance/history',
  ])
    await expect(
      transport.request({ method: 'GET', path, successStatus: 200, decode: (v) => v }),
    ).resolves.toEqual({})
  expect(mock.history.get.map((v) => v.url)).toEqual([
    '/api/v2/compliance-rules',
    '/api/v2/compliance-rules/rule/versions/1',
    '/api/v2/compliance-rules/rule/tasks/task',
    '/api/v2/devices/device-01/compliance/history',
  ])
  await expect(
    transport.request({
      method: 'GET',
      path: '/api/v2/compliance-rules-admin',
      successStatus: 200,
      decode: (v) => v,
    }),
  ).rejects.toMatchObject({ cause: 'client' })
})

it('bounds raw upload chunks to PATCH sessions and decodes offset conflict without exposing raw fields', async () => {
  const instance = axios.create(),
    mock = new AxiosMockAdapter(instance)
  const spy = vi.spyOn(axios, 'create').mockReturnValueOnce(instance)
  const transport = createMdmTransport()
  spy.mockRestore()
  const path = '/api/v3/resources/app/uploads/session',
    bytes = new Uint8Array([1, 2]).buffer
  mock.onPatch(path).reply(409, { code: 'upload_offset_conflict', offset: 2 })
  await expect(
    transport.request({
      method: 'PATCH',
      path,
      query: { offset: 0 },
      body: bytes,
      headers: { 'Content-Type': 'application/octet-stream' },
      successStatus: 200,
      decode: (v) => v,
    }),
  ).rejects.toMatchObject({ cause: 'wire', code: 'upload_offset_conflict', status: 409 })
  expect(mock.history.patch[0]?.data).toBe(bytes)
  expect(decodeMdmError(409, { code: 'upload_offset_conflict', offset: -1 }).cause).toBe('protocol')
  expect(
    decodeMdmError(409, { code: 'upload_offset_conflict', offset: 0, secret: 'hidden' }).cause,
  ).toBe('protocol')
  await expect(
    transport.request({ method: 'POST', path, body: bytes, successStatus: 200, decode: (v) => v }),
  ).rejects.toMatchObject({ cause: 'client' })
})
