import axios from 'axios'
import AxiosMockAdapter from 'axios-mock-adapter'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createIdentityTransport } from './identity'
import { isRssApiError } from './wire-error'

const decodeObject = (value: unknown): { ok: boolean } => {
  if (typeof value !== 'object' || value === null || (value as { ok?: unknown }).ok !== true) {
    throw new Error('invalid fixture')
  }
  return { ok: true }
}

function setup() {
  const instance = axios.create({ baseURL: '' })
  const mock = new AxiosMockAdapter(instance)
  const create = vi.spyOn(axios, 'create').mockReturnValueOnce(instance)
  const transport = createIdentityTransport()
  create.mockRestore()
  return {
    mock,
    transport: {
      request: ((options: Parameters<typeof transport.request>[0]) =>
        transport.request({
          ...options,
          pathParams: { tenant: 'test', ...options.pathParams },
        } as never)) as typeof transport.request,
    },
  }
}

afterEach(() => vi.restoreAllMocks())

describe('Identity HTTP execution', () => {
  it('encodes path parameters and preserves meaningful query values', async () => {
    const { mock, transport } = setup()
    mock.onGet('/api/v1/identity/tenants/test/accounts/a%2Fb').reply((config) => {
      expect(config.baseURL).toBe('')
      expect(config.params).toEqual({ cursor: '', limit: 0, enabled: false })
      expect(config.headers?.['X-Identity-Request']).toBe('fixture')
      return [200, { ok: true }]
    })

    await expect(
      transport.request({
        method: 'GET',
        path: '/api/v1/identity/tenants/{tenant}/accounts/{key}',
        pathParams: { key: 'a/b' },
        query: { cursor: '', limit: 0, enabled: false, omitted: undefined },
        headers: { 'X-Identity-Request': 'fixture' },
        successStatus: 200,
        decode: decodeObject,
      }),
    ).resolves.toEqual({ ok: true })
  })

  it('passes a JSON body and accepts an exact 201', async () => {
    const { mock, transport } = setup()
    mock.onPost('/api/v1/identity/tenants/test/login').reply((config) => {
      expect(config.data).toBe(JSON.stringify({ username: 'alice', password: 'secret' }))
      expect(config.timeout).toBe(250)
      return [201, { ok: true }]
    })

    await expect(
      transport.request({
        method: 'POST',
        path: '/api/v1/identity/tenants/{tenant}/login',
        body: { username: 'alice', password: 'secret' },
        timeoutMs: 250,
        successStatus: 201,
        decode: decodeObject,
      }),
    ).resolves.toEqual({ ok: true })
  })

  it('owns the closed no-store request cache directive', async () => {
    const { mock, transport } = setup()
    mock.onGet('/api/v1/identity/tenants/test/sessions/vault.db').reply((config) => {
      expect(config.headers?.['Cache-Control']).toBe('no-store')
      expect(config.headers?.Pragma).toBeUndefined()
      return [200, { ok: true }]
    })

    await expect(
      transport.request({
        method: 'GET',
        path: '/api/v1/identity/tenants/{tenant}/sessions/{key}',
        pathParams: { key: 'vault.db' },
        successStatus: 200,
        decode: decodeObject,
      }),
    ).resolves.toEqual({ ok: true })
  })

  it.each(['Authorization', 'authorization', 'X-Tenant-ID', 'x-tenant-id'])(
    'rejects browser-authored control header %s before sending',
    async (header) => {
      const { mock, transport } = setup()
      await expect(
        transport.request({
          method: 'GET',
          path: '/api/v1/identity/tenants/{tenant}/session',
          headers: { [header]: 'forged' },
          successStatus: 200,
          decode: decodeObject,
        }),
      ).rejects.toMatchObject({ cause: 'client', code: 'INVALID_REQUEST' })
      expect(mock.history.get).toHaveLength(0)
    },
  )

  it.each(['Cache-Control', 'cache-control', 'Pragma', 'pragma'])(
    'rejects browser-authored cache control header %s before sending',
    async (header) => {
      const { mock, transport } = setup()
      await expect(
        transport.request({
          method: 'GET',
          path: '/api/v1/identity/tenants/{tenant}/sessions/key',
          headers: { [header]: 'no-store' },
          successStatus: 200,
          decode: decodeObject,
        }),
      ).rejects.toMatchObject({ cause: 'client', code: 'INVALID_REQUEST' })
      expect(mock.history.get).toHaveLength(0)
    },
  )

  it('returns void for 204 without touching an unexpected body', async () => {
    const { mock, transport } = setup()
    mock.onDelete('/api/v1/identity/tenants/test/accounts/key').reply(204, '<not-json>')
    await expect(
      transport.request({
        method: 'DELETE',
        path: '/api/v1/identity/tenants/{tenant}/accounts/{key}',
        pathParams: { key: 'key' },
        successStatus: 204,
      }),
    ).resolves.toBeUndefined()
  })

  it.each([
    'https://evil.example/api/v1/identity/tenants/{tenant}/x',
    '//evil.example/api/v1/identity/tenants/{tenant}/x',
    '/healthz',
    '/api/v1/identity/tenants/{tenant}/x?raw=true',
    '/api/v1/identity/tenants/{tenant}/x#fragment',
    '/api/../internal/x',
    '/api/%2e%2e/internal/x',
    '/api/%2Finternal/x',
  ])('rejects unsafe or non-API path %s before sending', async (path) => {
    const { mock, transport } = setup()
    await expect(
      transport.request({ method: 'GET', path, successStatus: 200, decode: decodeObject }),
    ).rejects.toMatchObject({ cause: 'client', code: 'INVALID_REQUEST' })
    expect(mock.history.get).toHaveLength(0)
  })

  it('rejects unresolved or extra path parameters', async () => {
    const { transport } = setup()
    await expect(
      transport.request({
        method: 'GET',
        path: '/api/v1/identity/tenants/{tenant}/items/{id}',
        successStatus: 200,
        decode: decodeObject,
      }),
    ).rejects.toMatchObject({ cause: 'client' })
    for (const id of ['.', '..']) {
      await expect(
        transport.request({
          method: 'GET',
          path: '/api/v1/identity/tenants/{tenant}/items/{id}',
          pathParams: { id },
          successStatus: 200,
          decode: decodeObject,
        }),
      ).rejects.toMatchObject({ cause: 'client' })
    }
    await expect(
      transport.request({
        method: 'GET',
        path: '/api/v1/identity/tenants/{tenant}/items',
        pathParams: { id: 'unused' },
        successStatus: 200,
        decode: decodeObject,
      }),
    ).rejects.toMatchObject({ cause: 'client' })
  })

  it('treats an unexpected success status and malformed success body as protocol errors', async () => {
    const { mock, transport } = setup()
    mock.onGet('/api/v1/identity/tenants/test/queued').reply(202, { ok: true })
    await expect(
      transport.request({
        method: 'GET',
        path: '/api/v1/identity/tenants/{tenant}/queued',
        successStatus: 200,
        decode: decodeObject,
      }),
    ).rejects.toMatchObject({ cause: 'protocol', status: 202 })

    mock
      .onGet('/api/v1/identity/tenants/test/malformed')
      .reply(200, { ok: false, secret: 'must-not-leak' })
    await expect(
      transport.request({
        method: 'GET',
        path: '/api/v1/identity/tenants/{tenant}/malformed',
        successStatus: 200,
        decode: decodeObject,
      }),
    ).rejects.toMatchObject({ cause: 'protocol', code: 'INVALID_RESPONSE' })
  })

  it('distinguishes abort, timeout and network failures without Axios leakage', async () => {
    const { mock, transport } = setup()
    const controller = new AbortController()
    controller.abort()
    await expect(
      transport.request({
        method: 'GET',
        path: '/api/v1/identity/tenants/{tenant}/abort',
        signal: controller.signal,
        successStatus: 200,
        decode: decodeObject,
      }),
    ).rejects.toMatchObject({ cause: 'aborted' })

    mock.onGet('/api/v1/identity/tenants/test/timeout').timeout()
    await expect(
      transport.request({
        method: 'GET',
        path: '/api/v1/identity/tenants/{tenant}/timeout',
        successStatus: 200,
        decode: decodeObject,
      }),
    ).rejects.toMatchObject({ cause: 'timeout' })

    mock.onGet('/api/v1/identity/tenants/test/network').networkError()
    const caught = await transport
      .request({
        method: 'GET',
        path: '/api/v1/identity/tenants/{tenant}/network',
        successStatus: 200,
        decode: decodeObject,
      })
      .catch((error: unknown) => error)
    expect(isRssApiError(caught)).toBe(true)
    expect(caught).toMatchObject({ cause: 'network' })
    expect(caught).not.toHaveProperty('response')
    expect(caught).not.toHaveProperty('config')
    expect(caught).not.toHaveProperty('request')
  })

  it('maps an in-flight cancellation to aborted', async () => {
    const { mock, transport } = setup()
    mock
      .onGet('/api/v1/identity/tenants/test/slow')
      .reply(() => new Promise((resolve) => setTimeout(() => resolve([200, { ok: true }]), 25)))
    const controller = new AbortController()
    const pending = transport.request({
      method: 'GET',
      path: '/api/v1/identity/tenants/{tenant}/slow',
      signal: controller.signal,
      successStatus: 200,
      decode: decodeObject,
    })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ cause: 'aborted' })
  })
})
