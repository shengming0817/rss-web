import type { HttpTransport, NoContentRequest, RequestOptions } from '@rss/api'
import { describe, expect, it, vi } from 'vitest'
import { createSettingsApi } from './client'
import {
  decodeConfigGetResponse,
  decodeConfigPublishResponse,
  decodeConfigRollbackResponse,
} from './decoders'

describe('Settings config decoder', () => {
  it('strictly decodes positive safe versions', () => {
    expect(decodeConfigPublishResponse({ data: { key: 'app.k', version: 1 } })).toEqual({
      data: { key: 'app.k', version: 1 },
    })
    expect(
      decodeConfigGetResponse({ data: { key: 'app.k', value: 'secret-v', version: 2 } }),
    ).toEqual({ data: { key: 'app.k', value: 'secret-v', version: 2 } })
    expect(
      decodeConfigRollbackResponse({ data: { key: 'app.k', version: 3, sourceVersion: 1 } }),
    ).toEqual({ data: { key: 'app.k', version: 3, sourceVersion: 1 } })
  })

  it.each([
    { data: { key: 'app.k', version: 0 } },
    { data: { key: '', version: 1 } },
    { data: { key: 'app.k', version: Number.MAX_SAFE_INTEGER + 1 } },
    { data: { key: 'app.k', version: 1, extra: true } },
    { data: { key: 'app.k', value: 1, version: 1 } },
  ])('rejects malformed config response %#', (value) => {
    expect(() =>
      'value' in (value.data as object)
        ? decodeConfigGetResponse(value)
        : decodeConfigPublishResponse(value),
    ).toThrow()
  })

  it.each([
    { data: { key: 'app.k', version: 3, sourceVersion: 0 } },
    { data: { key: 'app.k', version: 3, sourceVersion: Number.MAX_SAFE_INTEGER + 1 } },
    { data: { key: 'app.k', version: 3, sourceVersion: 1, extra: true } },
  ])('rejects malformed rollback response %#', (value) => {
    expect(() => decodeConfigRollbackResponse(value)).toThrow()
  })
})

describe('Settings config client', () => {
  it('uses no-replay mutations, protected get, and decoder-free 204 delete', async () => {
    const calls: Array<RequestOptions<unknown> | NoContentRequest> = []
    const transport: HttpTransport = {
      request: vi.fn(async (request: RequestOptions<unknown> | NoContentRequest) => {
        calls.push(request)
        if (request.successStatus === 204) return undefined
        if (request.path === '/api/v1/settings/configs/{key}/rollbacks')
          return request.decode({
            data: { key: request.pathParams?.key, version: 3, sourceVersion: 1 },
          })
        if (request.pathParams !== undefined)
          return request.decode({ data: { key: request.pathParams.key, value: 'v', version: 2 } })
        return request.decode({ data: { key: 'app.k', version: 1 } })
      }),
    } as HttpTransport
    const api = createSettingsApi(transport)
    await expect(api.publish({ key: 'app.k', value: 'v' })).resolves.toEqual({
      data: { key: 'app.k', version: 1 },
    })
    await expect(api.get('app.k')).resolves.toEqual({
      data: { key: 'app.k', value: 'v', version: 2 },
    })
    await expect(api.delete('app.k')).resolves.toBeUndefined()
    await expect(api.rollback('app.k', { toVersion: 1 })).resolves.toEqual({
      data: { key: 'app.k', version: 3, sourceVersion: 1 },
    })
    expect(
      calls.map(({ method, session, successStatus }) => ({ method, session, successStatus })),
    ).toEqual([
      { method: 'POST', session: 'required-no-replay', successStatus: 201 },
      { method: 'GET', session: 'required', successStatus: 200 },
      { method: 'DELETE', session: 'required', successStatus: 204 },
      { method: 'POST', session: 'required-no-replay', successStatus: 201 },
    ])
    expect(calls[2]).not.toHaveProperty('decode')
  })

  it('fails closed on response/request key mismatch and empty coordinates', async () => {
    const transport: HttpTransport = {
      request: vi.fn(async (request: RequestOptions<unknown>) =>
        request.decode({ data: { key: 'other', value: 'v', version: 1 } }),
      ),
    } as unknown as HttpTransport
    const api = createSettingsApi(transport)
    await expect(api.get('app.k')).rejects.toThrow()
    expect(() => api.publish({ key: '', value: 'v' })).toThrow()
    expect(() => api.delete('')).toThrow()
    await expect(api.publish({ key: 'app.k', value: 'v', extra: true } as never)).rejects.toThrow()
    await expect(api.rollback('app.k', { toVersion: 0 })).rejects.toThrow()
    await expect(
      api.rollback('app.k', { toVersion: Number.MAX_SAFE_INTEGER + 1 }),
    ).rejects.toThrow()
    await expect(api.rollback('app.k', { toVersion: 1, extra: true } as never)).rejects.toThrow()
  })

  it.each([
    ['key', { key: 'other', version: 3, sourceVersion: 1 }],
    ['source version', { key: 'app.k', version: 3, sourceVersion: 2 }],
  ])('fails closed when rollback response %s drifts', async (_name, data) => {
    const transport: HttpTransport = {
      request: vi.fn(async (request: RequestOptions<unknown>) => request.decode({ data })),
    } as unknown as HttpTransport
    await expect(createSettingsApi(transport).rollback('app.k', { toVersion: 1 })).rejects.toThrow()
  })
})
