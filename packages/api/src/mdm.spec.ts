import { describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import AxiosMockAdapter from 'axios-mock-adapter'
import { createMdmTransport, decodeMdmError, decodeAgentError } from './mdm'
describe('MDM HTTP boundary', () => {
  it('rejects Identity paths, unversioned paths and local tenant/authorization headers', async () => {
    const transport = createMdmTransport()
    for (const path of [
      '/api/v1/identity/tenants/{tenant}/login',
      '/api/private',
      '/api/v2/devices',
      '/api/v3/resources',
      '/api/v4/devices',
      '/api/mdm-candidate/v1/workspace',
      '/api/mdm-host/v1/config.json',
      '/api/v1/agent/runtime/tasks',
      '/api/v1/unknown',
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
      path: '/api/v1/groups/{id}',
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
      path: '/api/v1/groups/group',
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
  mock.onPost('/api/v1/resources/script/content').reply((config) => {
    expect(config.data).toBe(bytes)
    expect(config.headers?.['Content-Type']).toBe('application/octet-stream')
    return [201, '']
  })
  await expect(
    transport.request({
      method: 'POST',
      path: '/api/v1/resources/{id}/content',
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
      path: '/api/v1/groups/group',
      body: bytes,
      successStatus: 200,
      decode: (v) => v,
    }),
  ).rejects.toMatchObject({ cause: 'client' })
  await expect(
    transport.request({
      method: 'GET',
      path: '/api/v1/resources/{id}/content',
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
      path: '/api/v1/resources/{id}/content',
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
    '/api/v1/software/sources/private/revisions/1',
    '/api/v1/software/resources/app/versions/1',
    '/api/v1/mdm-candidate/software/catalog',
  ])
    await expect(
      transport.request({ method: 'GET', path, successStatus: 200, decode: (v) => v }),
    ).resolves.toEqual({})
  await expect(
    transport.request({
      method: 'GET',
      path: '/api/v1/software-admin/secrets',
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
  mock.onGet('/api/v1/policies/policy/runs/missing').reply(404, { code: 'task_not_found' })
  await expect(
    transport.request({
      method: 'GET',
      path: '/api/v1/policies/policy/runs/missing',
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
    '/api/v1/compliance-rules',
    '/api/v1/compliance-rules/rule/versions/1',
    '/api/v1/compliance-rules/rule/tasks/task',
    '/api/v1/devices/device-01/compliance/history',
  ])
    await expect(
      transport.request({ method: 'GET', path, successStatus: 200, decode: (v) => v }),
    ).resolves.toEqual({})
  expect(mock.history.get.map((v) => v.url)).toEqual([
    '/api/v1/compliance-rules',
    '/api/v1/compliance-rules/rule/versions/1',
    '/api/v1/compliance-rules/rule/tasks/task',
    '/api/v1/devices/device-01/compliance/history',
  ])
  await expect(
    transport.request({
      method: 'GET',
      path: '/api/v1/compliance-rules-admin',
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
  const path = '/api/v1/resources/app/uploads/session',
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

it('dispatches exact authorization JSON at 2 MiB while rejecting overflow and other methods', async () => {
  const instance = axios.create(),
    mock = new AxiosMockAdapter(instance)
  mock.onAny().reply(200, {})
  vi.spyOn(axios, 'create').mockReturnValueOnce(instance)
  const transport = createMdmTransport()
  vi.restoreAllMocks()
  const request = (method: 'PUT' | 'POST', length: number) =>
    transport.request({
      method,
      path: '/api/v1/authorization/user-groups/{id}',
      pathParams: { id: '11111111-1111-4111-8111-111111111111' },
      body: { value: 'a'.repeat(length) },
      successStatus: 200,
      decode: (v) => v,
    })
  await expect(request('PUT', 2 * 1024 * 1024 - 12)).resolves.toEqual({})
  await expect(request('PUT', 2 * 1024 * 1024 - 11)).rejects.toMatchObject({ status: 413 })
  await expect(request('POST', 20000)).rejects.toMatchObject({ status: 413 })
  expect(mock.history.put).toHaveLength(1)
  expect(mock.history.post).toHaveLength(0)
})

it('uses shared binary execution only for published attachment endpoints and decodes bounded failures', async () => {
  const instance = axios.create(),
    mock = new AxiosMockAdapter(instance)
  const spy = vi.spyOn(axios, 'create').mockReturnValueOnce(instance)
  const transport = createMdmTransport()
  spy.mockRestore()
  const bytes = new Uint8Array([1, 2, 3]).buffer
  mock.onPost('/api/v1/enrollments/test/profile').reply(200, bytes, {
    'content-type': 'application/x-apple-aspen-config',
    'content-disposition': 'attachment; filename=RSS-MDM.mobileconfig',
  })
  const options = {
    method: 'POST' as const,
    path: '/api/v1/enrollments/{id}/profile',
    pathParams: { id: 'test' },
    body: { password: 'fixture' },
    responseType: 'arraybuffer' as const,
    successStatus: 200 as const,
    decode: (v: unknown) => v,
  }
  await expect(transport.request(options)).resolves.toMatchObject({
    bytes,
    contentType: 'application/x-apple-aspen-config',
  })
  mock
    .onPost('/api/v1/enrollments/test/profile')
    .reply(403, new TextEncoder().encode('{"code":"permission_denied"}').buffer)
  await expect(transport.request(options)).rejects.toMatchObject({
    code: 'permission_denied',
    cause: 'wire',
  })
  await expect(transport.request({ ...options, path: '/api/v1/devices' })).rejects.toMatchObject({
    cause: 'client',
  })
  for (const path of [
    '/api/v1/self-enrollments/agent',
    '/api/v1/agent-grants/{id}',
    '/api/v1/agent/enroll/packages/latest',
  ])
    await expect(
      transport.request({ method: 'GET', path, successStatus: 200, decode: (v) => v }),
    ).rejects.toMatchObject({ cause: 'client' })
})
it('dispatches formal device views and associations through the shared boundary without retries', async () => {
  const instance = axios.create(),
    mock = new AxiosMockAdapter(instance)
  mock.onGet('/api/v1/device-views').reply(409, { code: 'device_view_cursor_invalidated' })
  mock.onPost('/api/v1/device-associations').reply(503, { code: 'operation_unknown' })
  const spy = vi.spyOn(axios, 'create').mockReturnValueOnce(instance),
    transport = createMdmTransport()
  spy.mockRestore()
  await expect(
    transport.request({
      method: 'GET',
      path: '/api/v1/device-views',
      successStatus: 200,
      decode: (v) => v,
    }),
  ).rejects.toMatchObject({ cause: 'wire', status: 409, code: 'device_view_cursor_invalidated' })
  await expect(
    transport.request({
      method: 'POST',
      path: '/api/v1/device-associations',
      body: { operationId: 'opaque' },
      successStatus: 200,
      decode: (v) => v,
    }),
  ).rejects.toMatchObject({ cause: 'wire', status: 503, code: 'operation_unknown' })
  expect(mock.history.get).toHaveLength(1)
  expect(mock.history.post).toHaveLength(1)
})

it('dispatches the formal operations directory with its exact filters and rejects invented detail routes', async () => {
  const instance = axios.create(),
    mock = new AxiosMockAdapter(instance)
  mock.onGet('/api/v1/operations').reply(200, { items: [] })
  mock.onGet('/api/v1/collection-blueprints').reply(200, { items: [] })
  const spy = vi.spyOn(axios, 'create').mockReturnValueOnce(instance),
    transport = createMdmTransport()
  spy.mockRestore()
  const query = {
    policy: '11111111-1111-4111-8111-111111111111',
    afterKind: 'action_run',
    after: '22222222-2222-4222-8222-222222222222',
  }
  await expect(
    transport.request({
      method: 'GET',
      path: '/api/v1/operations',
      query,
      successStatus: 200,
      decode: (value) => value,
    }),
  ).resolves.toEqual({ items: [] })
  expect(mock.history.get).toHaveLength(1)
  expect(mock.history.get[0]?.params).toEqual(query)
  await expect(
    transport.request({
      method: 'GET',
      path: '/api/v1/collection-blueprints',
      successStatus: 200,
      decode: (value) => value,
    }),
  ).resolves.toEqual({ items: [] })
  for (const path of [
    '/api/v1/operations/unknown',
    '/api/v1/operations-other',
    '/api/v1/collection-blueprints/unknown',
    '/api/v1/collection-blueprints-other',
  ])
    await expect(
      transport.request({ method: 'GET', path, successStatus: 200, decode: (value) => value }),
    ).rejects.toMatchObject({ cause: 'client' })
  expect(mock.history.get.map((request) => request.url)).toEqual([
    '/api/v1/operations',
    '/api/v1/collection-blueprints',
  ])
})

it('accepts only the explicit provisioning status set and treats readiness as a public GET', async () => {
  const instance = axios.create(),
    mock = new AxiosMockAdapter(instance)
  vi.spyOn(axios, 'create').mockReturnValueOnce(instance)
  const transport = createMdmTransport(),
    path = '/api/v1/tenant-administration/provisionings'
  for (const status of [200, 202]) {
    mock.onPost(path).reply(status, { accepted: true })
    await expect(
      transport.request({
        method: 'POST',
        path,
        body: {},
        successStatus: [200, 202],
        decode: (v) => v,
      }),
    ).resolves.toEqual({ accepted: true })
  }
  mock.onPost(path).reply(201, { accepted: true })
  await expect(
    transport.request({
      method: 'POST',
      path,
      body: {},
      successStatus: [200, 202],
      decode: (v) => v,
    }),
  ).rejects.toMatchObject({ cause: 'protocol' })
  mock.onGet('/readyz').reply(200, { ready: true, observation: null })
  await expect(
    transport.request({ method: 'GET', path: '/readyz', successStatus: 200, decode: (v) => v }),
  ).resolves.toMatchObject({ ready: true })
  for (const options of [
    { method: 'POST' as const, body: {} },
    { method: 'GET' as const, headers: { 'X-CSRF-Token': 'secret' } },
  ])
    await expect(
      transport.request({ ...options, path: '/readyz', successStatus: 200, decode: (v) => v }),
    ).rejects.toMatchObject({ cause: 'client' })
  expect(mock.history.get).toHaveLength(1)
  vi.restoreAllMocks()
})

it('decodes the explicit unready host data contract without accepting API 503 responses as success', async () => {
  const instance = axios.create(),
    mock = new AxiosMockAdapter(instance)
  vi.spyOn(axios, 'create').mockReturnValueOnce(instance)
  const transport = createMdmTransport(),
    observation = {
      hostId: 'host',
      operationId: 'original',
      revision: 2,
      materialDigest: 'digest',
      processGeneration: 'generation',
      tenantId: 'tenant',
      instanceId: 'instance',
    }
  mock.onGet('/readyz').reply(503, { ready: false, observation })
  await expect(
    transport.request({
      method: 'GET',
      path: '/readyz',
      successStatus: [200, 503],
      decode: (v) => v,
    }),
  ).resolves.toEqual({ ready: false, observation })
  mock.onGet('/api/v1/devices').reply(503, { code: 'service_unavailable' })
  await expect(
    transport.request({
      method: 'GET',
      path: '/api/v1/devices',
      successStatus: 200,
      decode: (v) => v,
    }),
  ).rejects.toMatchObject({ cause: 'wire', code: 'service_unavailable' })
  mock.onGet('/readyz').reply(503, { code: 'service_unavailable' })
  await expect(
    transport.request({
      method: 'GET',
      path: '/readyz',
      successStatus: [200, 503],
      decode: () => {
        throw new Error('Not a readiness body')
      },
    }),
  ).rejects.toMatchObject({ cause: 'protocol' })
  vi.restoreAllMocks()
})

it('executes registration channel requests and preserves paused as a known business rejection', async () => {
  const instance = axios.create(),
    mock = new AxiosMockAdapter(instance)
  vi.spyOn(axios, 'create').mockReturnValueOnce(instance)
  const transport = createMdmTransport()
  mock.onGet('/api/v1/registration-channels').reply(200, { channels: [] })
  expect(
    await transport.request({
      method: 'GET',
      path: '/api/v1/registration-channels',
      successStatus: 200,
      decode: (v) => v,
    }),
  ).toEqual({ channels: [] })
  mock
    .onPut('/api/v1/registration-channels/agent/admission')
    .reply(409, { code: 'enrollment_paused' })
  await expect(
    transport.request({
      method: 'PUT',
      path: '/api/v1/registration-channels/{channel}/admission',
      pathParams: { channel: 'agent' },
      body: { expectedRevision: 0, admission: 'paused' },
      successStatus: 200,
      decode: (v) => v,
    }),
  ).rejects.toMatchObject({ cause: 'wire', code: 'enrollment_paused', status: 409 })
  expect(decodeMdmError(429, { code: 'enrollment_paused' }).cause).toBe('protocol')
  expect(decodeMdmError(409, { code: 'enrollment_paused', extra: true }).cause).toBe('protocol')
  mock.restore()
  vi.restoreAllMocks()
})

it('decodes the current Agent pause envelope without classifying a rejected create as unknown', () => {
  expect(decodeAgentError(409, { code: 'enrollment_paused', issuanceId: null })).toMatchObject({
    cause: 'wire',
    status: 409,
    code: 'enrollment_paused',
  })
  expect(decodeAgentError(409, { code: 'enrollment_paused', issuanceId: 'bad' }).cause).toBe(
    'protocol',
  )
  expect(decodeAgentError(429, { code: 'enrollment_paused', issuanceId: null }).cause).toBe(
    'protocol',
  )
})

it('executes the published first-use read, CAS update and receipt paths through the existing HTTP boundary', async () => {
  const instance = axios.create(),
    mock = new AxiosMockAdapter(instance)
  mock.onGet('/api/v1/settings/first-use').reply(200, { progress: true })
  mock.onPut('/api/v1/settings/first-use').reply(409, { code: 'first_use_not_ready' })
  mock
    .onGet('/api/v1/settings/first-use/operations/original')
    .reply(404, { code: 'first_use_operation_not_found' })
  const spy = vi.spyOn(axios, 'create').mockReturnValueOnce(instance),
    transport = createMdmTransport()
  spy.mockRestore()
  expect(
    await transport.request({
      method: 'GET',
      path: '/api/v1/settings/first-use',
      successStatus: 200,
      decode: (v) => v,
    }),
  ).toEqual({ progress: true })
  await expect(
    transport.request({
      method: 'PUT',
      path: '/api/v1/settings/first-use',
      body: {},
      successStatus: 200,
      decode: (v) => v,
    }),
  ).rejects.toMatchObject({ cause: 'wire', code: 'first_use_not_ready' })
  await expect(
    transport.request({
      method: 'GET',
      path: '/api/v1/settings/first-use/operations/{id}',
      pathParams: { id: 'original' },
      successStatus: 200,
      decode: (v) => v,
    }),
  ).rejects.toMatchObject({ cause: 'wire', code: 'first_use_operation_not_found' })
  mock.restore()
})
it('accepts an explicit empty 201 without weakening JSON decoding', async () => {
  const instance = axios.create(),
    mock = new AxiosMockAdapter(instance)
  const spy = vi.spyOn(axios, 'create').mockReturnValueOnce(instance)
  const transport = createMdmTransport()
  spy.mockRestore()
  mock.onPost('/api/v1/resources/p/uploads/u/complete').reply(201)
  await expect(
    transport.request({
      method: 'POST',
      path: '/api/v1/resources/p/uploads/u/complete',
      successStatus: 201,
      responseType: 'empty',
    }),
  ).resolves.toBeUndefined()
  await expect(
    transport.request({
      method: 'POST',
      path: '/api/v1/resources/p/uploads/u/complete',
      successStatus: 201,
      decode: (value) => {
        if (!value) throw new Error('missing JSON')
        return value
      },
    }),
  ).rejects.toMatchObject({ cause: 'protocol' })
})
