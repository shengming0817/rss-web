import type { HttpTransport, RequestOptions } from '@rss/api'
import { describe, expect, it, vi } from 'vitest'
import { createSettingsApi } from '../client'
import { decodeSecretPublishResponse } from './decoders'

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
})

describe('Settings secret client', () => {
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
