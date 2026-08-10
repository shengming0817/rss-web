import axios from 'axios'
import AxiosMockAdapter from 'axios-mock-adapter'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHttpTransport } from './transport'
import { isRssApiError } from './wire-error'

const decodeObject = (value: unknown): { ok: boolean } => {
  if (typeof value !== 'object' || value === null || (value as { ok?: unknown }).ok !== true) {
    throw new Error('invalid fixture')
  }
  return { ok: true }
}

function setup() {
  const instance = axios.create({ baseURL: '/edge' })
  const mock = new AxiosMockAdapter(instance)
  const create = vi.spyOn(axios, 'create').mockReturnValueOnce(instance)
  const transport = createHttpTransport({ baseURL: '/edge', defaultTimeoutMs: 5_000 })
  create.mockRestore()
  return { mock, transport }
}

afterEach(() => vi.restoreAllMocks())

describe('createHttpTransport', () => {
  it('encodes path parameters and preserves meaningful query values', async () => {
    const { mock, transport } = setup()
    mock.onGet('/api/v1/settings/configs/a%2Fb').reply((config) => {
      expect(config.baseURL).toBe('/edge')
      expect(config.params).toEqual({ cursor: '', limit: 0, enabled: false })
      expect(config.headers?.['X-Request']).toBe('fixture')
      return [200, { ok: true }]
    })

    await expect(
      transport.request({
        method: 'GET',
        path: '/api/v1/settings/configs/{key}',
        pathParams: { key: 'a/b' },
        query: { cursor: '', limit: 0, enabled: false, omitted: undefined },
        headers: { 'X-Request': 'fixture' },
        successStatus: 200,
        decode: decodeObject,
      }),
    ).resolves.toEqual({ ok: true })
  })

  it('passes a JSON body and accepts an exact 201', async () => {
    const { mock, transport } = setup()
    mock.onPost('/api/v1/identity/login').reply((config) => {
      expect(config.data).toBe(JSON.stringify({ username: 'alice', password: 'secret' }))
      expect(config.timeout).toBe(250)
      return [201, { ok: true }]
    })

    await expect(
      transport.request({
        method: 'POST',
        path: '/api/v1/identity/login',
        body: { username: 'alice', password: 'secret' },
        timeoutMs: 250,
        successStatus: 201,
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
          path: '/api/v1/identity/profile',
          headers: { [header]: 'forged' },
          successStatus: 200,
          decode: decodeObject,
        }),
      ).rejects.toMatchObject({ cause: 'client', code: 'INVALID_REQUEST' })
      expect(mock.history.get).toHaveLength(0)
    },
  )

  it('rejects a protected request that bypasses the session transport', async () => {
    const { mock, transport } = setup()
    await expect(
      transport.request({
        method: 'GET',
        path: '/api/v1/identity/profile',
        session: 'required',
        successStatus: 200,
        decode: decodeObject,
      }),
    ).rejects.toMatchObject({ cause: 'client' })
    expect(mock.history.get).toHaveLength(0)
  })

  it('returns void for 204 without touching an unexpected body', async () => {
    const { mock, transport } = setup()
    mock.onDelete('/api/v1/settings/configs/key').reply(204, '<not-json>')
    await expect(
      transport.request({
        method: 'DELETE',
        path: '/api/v1/settings/configs/{key}',
        pathParams: { key: 'key' },
        successStatus: 204,
      }),
    ).resolves.toBeUndefined()
  })

  it.each([
    'https://evil.example/api/v1/x',
    '//evil.example/api/v1/x',
    '/healthz',
    '/api/v1/x?raw=true',
    '/api/v1/x#fragment',
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

  it.each([
    'https://evil.example',
    '//evil.example',
    'edge',
    '/edge?raw=true',
    '/edge#fragment',
    '/edge/../internal',
    '/edge/%2e%2e/internal',
  ])('rejects unsafe base URL %s', (baseURL) => {
    expect(() => createHttpTransport({ baseURL, defaultTimeoutMs: 5_000 })).toThrowError(
      expect.objectContaining({ cause: 'client' }),
    )
  })

  it('rejects unresolved or extra path parameters', async () => {
    const { transport } = setup()
    await expect(
      transport.request({
        method: 'GET',
        path: '/api/v1/items/{id}',
        successStatus: 200,
        decode: decodeObject,
      }),
    ).rejects.toMatchObject({ cause: 'client' })
    for (const id of ['.', '..']) {
      await expect(
        transport.request({
          method: 'GET',
          path: '/api/v1/items/{id}',
          pathParams: { id },
          successStatus: 200,
          decode: decodeObject,
        }),
      ).rejects.toMatchObject({ cause: 'client' })
    }
    await expect(
      transport.request({
        method: 'GET',
        path: '/api/v1/items',
        pathParams: { id: 'unused' },
        successStatus: 200,
        decode: decodeObject,
      }),
    ).rejects.toMatchObject({ cause: 'client' })
  })

  it('treats an unexpected success status and malformed success body as protocol errors', async () => {
    const { mock, transport } = setup()
    mock.onGet('/api/v1/queued').reply(202, { ok: true })
    await expect(
      transport.request({
        method: 'GET',
        path: '/api/v1/queued',
        successStatus: 200,
        decode: decodeObject,
      }),
    ).rejects.toMatchObject({ cause: 'protocol', status: 202 })

    mock.onGet('/api/v1/malformed').reply(200, { ok: false, secret: 'must-not-leak' })
    await expect(
      transport.request({
        method: 'GET',
        path: '/api/v1/malformed',
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
        path: '/api/v1/abort',
        signal: controller.signal,
        successStatus: 200,
        decode: decodeObject,
      }),
    ).rejects.toMatchObject({ cause: 'aborted', retryable: false })

    mock.onGet('/api/v1/timeout').timeout()
    await expect(
      transport.request({
        method: 'GET',
        path: '/api/v1/timeout',
        successStatus: 200,
        decode: decodeObject,
      }),
    ).rejects.toMatchObject({ cause: 'timeout', retryable: false })

    mock.onGet('/api/v1/network').networkError()
    const caught = await transport
      .request({
        method: 'GET',
        path: '/api/v1/network',
        successStatus: 200,
        decode: decodeObject,
      })
      .catch((error: unknown) => error)
    expect(isRssApiError(caught)).toBe(true)
    expect(caught).toMatchObject({ cause: 'network', retryable: false })
    expect(caught).not.toHaveProperty('response')
    expect(caught).not.toHaveProperty('config')
    expect(caught).not.toHaveProperty('request')
  })

  it('maps an in-flight cancellation to aborted', async () => {
    const { mock, transport } = setup()
    mock
      .onGet('/api/v1/slow')
      .reply(() => new Promise((resolve) => setTimeout(() => resolve([200, { ok: true }]), 25)))
    const controller = new AbortController()
    const pending = transport.request({
      method: 'GET',
      path: '/api/v1/slow',
      signal: controller.signal,
      successStatus: 200,
      decode: decodeObject,
    })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ cause: 'aborted', retryable: false })
  })
})
