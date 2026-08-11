import type { HttpTransport, RequestOptions } from '@rss/api'
import { describe, expect, it, vi } from 'vitest'
import { createSettingsApi } from '../client'
import { decodeSecretPublishResponse, decodeSecretResolveResponse } from './decoders'

describe('Settings secret decoder', () => {
  it('strictly decodes a positive safe receipt', () => {
    expect(decodeSecretPublishResponse({ data: { key: 'vault.db', version: 1 } })).toEqual({
      data: { key: 'vault.db', version: 1 },
    })
  })

  it.each([
    {},
    { data: { key: '', version: 1 } },
    { data: { key: 'vault.db', version: 0 } },
    { data: { key: 'vault.db', version: Number.MAX_SAFE_INTEGER + 1 } },
    { data: { key: 'vault.db', version: 1, material: 'forbidden' } },
    { data: { key: 'vault.db', version: 1 }, extra: true },
  ])('rejects malformed secret receipt %#', (value) => {
    expect(() => decodeSecretPublishResponse(value)).toThrow('invalid settings secret response')
  })

  it.each(['', 'bWF0ZXJpYWw=', 'AAECAw=='])('strictly decodes canonical Base64 %j', (value) => {
    expect(decodeSecretResolveResponse({ data: { materialBase64: value } })).toEqual({
      data: { materialBase64: value },
    })
  })

  it.each([
    {},
    { data: {} },
    { data: { materialBase64: 1 } },
    { data: { materialBase64: 'bWF0ZXJpYWw' } },
    { data: { materialBase64: 'bWF0ZXJpYWw===' } },
    { data: { materialBase64: 'AB==' } },
    { data: { materialBase64: 'AAB=' } },
    { data: { materialBase64: 'bWF0 ZXJpYWw=' } },
    { data: { materialBase64: 'bWF0ZXJpYWw_' } },
    { data: { materialBase64: 'bWF0ZXJpYWw=', extra: true } },
    { data: { materialBase64: 'bWF0ZXJpYWw=' }, extra: true },
  ])('rejects a malformed secret material response %#', (value) => {
    expect(() => decodeSecretResolveResponse(value)).toThrow('invalid settings secret response')
  })
})

describe('Settings secret client', () => {
  it('sends one exact required no-store resolve and exposes no body, query, or headers', async () => {
    let call: RequestOptions<unknown> | undefined
    const transport = {
      request: vi.fn(async (request: RequestOptions<unknown>) => {
        call = request
        return request.decode({ data: { materialBase64: 'AAECAw==' } })
      }),
    } as unknown as HttpTransport

    await expect(createSettingsApi(transport).resolveSecret('vault.db')).resolves.toEqual({
      data: { materialBase64: 'AAECAw==' },
    })
    expect(call).toMatchObject({
      method: 'GET',
      path: '/api/v1/settings/secrets/{key}/material',
      pathParams: { key: 'vault.db' },
      successStatus: 200,
      session: 'required',
      cache: 'no-store',
    })
    expect(call).not.toHaveProperty('body')
    expect(call).not.toHaveProperty('query')
    expect(call).not.toHaveProperty('headers')
  })

  it('rejects an empty resolve key before transport without reflecting it', () => {
    const transport = { request: vi.fn() } as unknown as HttpTransport
    expect(() => createSettingsApi(transport).resolveSecret('')).toThrow('invalid config key')
    expect(transport.request).not.toHaveBeenCalled()
  })

  it.each([
    [
      'versioned',
      { key: ' vault.db ', storeId: ' vault ', refKey: ' path/to/ref ', refVersion: ' v3 ' },
    ],
    ['latest', { key: 'vault.db', storeId: 'vault', refKey: 'path/to/ref' }],
    [
      'empty optional version',
      { key: 'vault.db', storeId: 'vault', refKey: 'path/to/ref', refVersion: '' },
    ],
  ] as const)(
    'sends one exact no-replay %s request and preserves raw bytes',
    async (_name, input) => {
      let call: RequestOptions<unknown> | undefined
      const transport = {
        request: vi.fn(async (request: RequestOptions<unknown>) => {
          call = request
          return request.decode({ data: { key: input.key, version: 2 } })
        }),
      } as unknown as HttpTransport

      await expect(createSettingsApi(transport).publishSecret(input)).resolves.toEqual({
        data: { key: input.key, version: 2 },
      })
      expect(call).toMatchObject({
        method: 'POST',
        path: '/api/v1/settings/secrets',
        successStatus: 201,
        session: 'required-no-replay',
        body:
          'refVersion' in input && input.refVersion === ''
            ? { key: input.key, storeId: input.storeId, refKey: input.refKey }
            : input,
      })
      expect(call).not.toHaveProperty('headers')
      expect(call).not.toHaveProperty('query')
      expect(call).not.toHaveProperty('pathParams')
      expect(Object.isFrozen(call?.body)).toBe(true)
    },
  )

  it.each([
    {},
    { key: '', storeId: 'vault', refKey: 'path' },
    { key: 'vault.db', storeId: '', refKey: 'path' },
    { key: 'vault.db', storeId: 'vault', refKey: '' },
    { key: 'vault.db', storeId: 'vault', refKey: 'path', refVersion: undefined },
    { key: 'vault.db', storeId: 'vault', refKey: 'path', refVersion: 1 },
    { key: 'vault.db', storeId: 'vault', refKey: 'path', material: 'forbidden' },
    { key: 'vault.db', storeId: 'vault', refKey: 'path', extra: true },
    Object.assign(
      { key: 'vault.db', storeId: 'vault', refKey: 'path' },
      { [Symbol('extra')]: true },
    ),
  ])('rejects an inexact secret request without exposing coordinates %#', async (request) => {
    const transport = { request: vi.fn() } as unknown as HttpTransport
    await expect(createSettingsApi(transport).publishSecret(request as never)).rejects.toThrow(
      'invalid secret publish input',
    )
    expect(transport.request).not.toHaveBeenCalled()
  })

  it('fails closed when the response key drifts without reflecting either coordinate', async () => {
    const transport = {
      request: vi.fn(async (request: RequestOptions<unknown>) =>
        request.decode({ data: { key: 'other.key', version: 1 } }),
      ),
    } as unknown as HttpTransport
    const failure = createSettingsApi(transport).publishSecret({
      key: 'private.key',
      storeId: 'private-store',
      refKey: 'private/ref',
    })
    await expect(failure).rejects.toThrow('invalid settings secret response')
    await expect(failure).rejects.not.toThrow(/private\.key|private-store|private\/ref|other\.key/)
  })
})
