import axios from 'axios'
import AxiosMockAdapter from 'axios-mock-adapter'
import { describe, expect, it, vi } from 'vitest'
import { createIdentityTransport, decodeIdentityError } from './identity'
describe('Identity errors never fall back to the RSS bearer wire', () => {
  it('distinguishes permissions from expired credentials', () => {
    expect(decodeIdentityError(403, { code: 'insufficient_privilege' }).code).toBe(
      'insufficient_privilege',
    )
    expect(decodeIdentityError(401, { code: 'invalid_credential' }).status).toBe(401)
  })
  it('recognizes only the exact own-password rejection coordinate', () => {
    expect(decodeIdentityError(403, { code: 'reauthentication_failed' })).toMatchObject({
      status: 403,
      code: 'reauthentication_failed',
      cause: 'wire',
    })
    expect(decodeIdentityError(401, { code: 'reauthentication_failed' }).cause).toBe('protocol')
  })
  it('rejects unknown, mismatched and legacy responses', () => {
    for (const value of [
      { code: 'unknown' },
      { code: 'invalid_credential', password: 'private' },
      { error: { code: 'ERR_CORE_FORBIDDEN' } },
    ]) {
      expect(decodeIdentityError(403, value).cause).toBe('protocol')
    }
    expect(decodeIdentityError(200, { code: 'identity_unavailable' }).cause).toBe('protocol')
  })
})

it('preserves the own-password wire rejection through the production executor without replay', async () => {
  const instance = axios.create()
  const mock = new AxiosMockAdapter(instance)
  const create = vi.spyOn(axios, 'create').mockReturnValueOnce(instance)
  const transport = createIdentityTransport()
  create.mockRestore()
  const tenant = '11111111-1111-4111-8111-111111111111'
  mock
    .onPost(`/api/v2/tenants/${tenant}/me/password`)
    .reply(403, { code: 'reauthentication_failed' })
  try {
    await expect(
      transport.request({
        method: 'POST',
        path: '/api/v2/tenants/{tenant}/me/password',
        pathParams: { tenant },
        headers: { 'X-Identity-Request': '1', 'X-CSRF-Token': 'a'.repeat(64) },
        body: { currentPassword: 'incorrect', password: 'new private password' },
        successStatus: 200,
        decode: (value) => value,
      }),
    ).rejects.toMatchObject({ status: 403, code: 'reauthentication_failed', cause: 'wire' })
    expect(mock.history.post).toHaveLength(1)
  } finally {
    mock.restore()
  }
})
