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
    .onPost(`/api/v1/identity/tenants/${tenant}/me/password`)
    .reply(403, { code: 'reauthentication_failed' })
  try {
    await expect(
      transport.request({
        method: 'POST',
        path: '/api/v1/identity/tenants/{tenant}/me/password',
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

it('rejects retired authentication routes and other API owners before dispatch', async () => {
  const transport = createIdentityTransport()
  for (const path of [
    '/api/v2/tenants/{tenant}/login',
    '/api/v1/tenants/{tenant}/login',
    '/api/identity-host/v1/config.json',
    '/api/v1/devices',
    '/api/v1/agent/runtime/tasks',
  ]) {
    await expect(
      transport.request({ method: 'GET', path, successStatus: 200, decode: (v) => v }),
    ).rejects.toMatchObject({ cause: 'client' })
  }
})

describe('mandatory Identity rate-limit deadline', () => {
  it('accepts bounded positive delta seconds only', () => {
    for (const seconds of ['1', '537', '4294967295'])
      expect(decodeIdentityError(429, { code: 'rate_limited' }, seconds)).toMatchObject({
        cause: 'wire',
        status: 429,
        code: 'rate_limited',
        retryAfterSeconds: Number(seconds),
      })
    for (const header of [
      undefined,
      null,
      600,
      '',
      '0',
      '-1',
      '1.5',
      '1e3',
      'Infinity',
      '4294967296',
      'Wed, 21 Oct 2037 07:28:00 GMT',
      ['600'],
    ])
      expect(decodeIdentityError(429, { code: 'rate_limited' }, header).cause).toBe('protocol')
    expect(decodeIdentityError(403, { code: 'rate_limited' }, '600').cause).toBe('protocol')
  })
  it('passes the header through production transport and never replays the rejected request', async () => {
    const instance = axios.create()
    const mock = new AxiosMockAdapter(instance)
    const create = vi.spyOn(axios, 'create').mockReturnValueOnce(instance)
    const transport = createIdentityTransport()
    create.mockRestore()
    mock.onPost().reply(429, { code: 'rate_limited' }, { 'Retry-After': '537' })
    try {
      await expect(
        transport.request({
          method: 'POST',
          path: '/api/v1/identity/tenants/{tenant}/login',
          pathParams: { tenant: '11111111-1111-4111-8111-111111111111' },
          headers: { 'X-Identity-Request': '1' },
          body: { login: 'admin', password: 'private' },
          successStatus: 200,
          decode: (v) => v,
        }),
      ).rejects.toMatchObject({ cause: 'wire', status: 429, retryAfterSeconds: 537 })
      expect(mock.history.post).toHaveLength(1)
    } finally {
      mock.restore()
    }
  })
})
