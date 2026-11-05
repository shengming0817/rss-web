import { expect, it, vi } from 'vitest'
import { createAuthPort, loadHostConfig, bindSession } from './index'
import { createSession } from '@rss/auth-core'
import { decodeIdentityError, type HttpTransport, type RequestOptions } from '@rss/api/identity'
import { networkErrorForTest } from '@rss/api/testing'
import { sessionResponse } from './decode'
const tenant = '11111111-1111-4111-8111-111111111111'
const provider = '22222222-2222-4222-8222-222222222222'
it('binds a concrete purpose to step-up and uses the existing executor without a second HTTP implementation', async () => {
  const request = vi.fn(async () => 'https://idp.example/authorize')
  const port = createAuthPort({ request } as unknown as HttpTransport)
  await port.stepUp(tenant, 'a'.repeat(64), provider, { kind: 'remove', credential: tenant })
  expect(request).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      method: 'POST',
      path: `/api/v1/identity/tenants/{tenant}/oidc/${provider}/step-up`,
      pathParams: { tenant },
      headers: { 'X-Identity-Request': '1', 'X-CSRF-Token': 'a'.repeat(64) },
      body: { returnTarget: 'resume', operation: { kind: 'remove', credential: tenant } },
    }),
  )
})
it.each(['http://localhost', 'https://other.example', 'https://console.example/'])(
  'rejects an invalid canonical host %s',
  async (canonicalOrigin) => {
    const transport = {
      request: async (options: { decode: (value: unknown) => unknown }) =>
        options.decode({ canonicalOrigin, oidcEnabled: true }),
    } as HttpTransport
    await expect(loadHostConfig(transport, 'https://console.example')).rejects.toThrow()
  },
)
it('rejects unknown session fields, invalid lifetimes and malformed CSRF rather than accepting partial authority', () => {
  const value = {
    session: { id: tenant, issuedAt: 1, idleExpiresAt: 2, absoluteExpiresAt: 3 },
    identity: { principalId: provider, hasLocalPassword: true },
    csrfToken: 'a'.repeat(64),
  }
  expect(sessionResponse(value).identity.principalId).toBe(provider)
  expect(() => sessionResponse({ ...value, access: true })).toThrow()
  expect(() => sessionResponse({ ...value, csrfToken: 'credential' })).toThrow()
  expect(() =>
    sessionResponse({ ...value, session: { ...value.session, idleExpiresAt: 4 } }),
  ).toThrow()
})
it('reads bounded session pages and links an identity with the current CSRF', async () => {
  const request = vi.fn(async (options: RequestOptions<unknown>) =>
    options.decode(
      options.path.endsWith('/sessions')
        ? {
            sessions: [{ id: provider, issuedAt: 1, idleExpiresAt: 2, absoluteExpiresAt: 3 }],
            nextCursor: null,
          }
        : { authorizationUrl: 'https://idp.example/authorize' },
    ),
  )
  const port = createAuthPort({ request } as unknown as HttpTransport)
  expect(await port.sessions(tenant)).toMatchObject({ next: null, sessions: [{ id: provider }] })
  expect(() => port.sessions(tenant, undefined, 101)).toThrow()
  expect(await port.link(tenant, 'current-csrf', provider, null)).toBe(
    'https://idp.example/authorize',
  )
  expect(request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      headers: { 'X-Identity-Request': '1', 'X-CSRF-Token': 'current-csrf' },
      body: { returnTarget: 'resume', password: null },
    }),
  )
  expect(port.classify(networkErrorForTest())).toBe('unavailable')
  expect(port.classify(decodeIdentityError(503, { code: 'identity_unavailable' }))).toBe(
    'unavailable',
  )
  expect(port.classify(decodeIdentityError(429, { code: 'rate_limited' }, '30'))).toBe(
    'rate_limited',
  )
  expect(port.classify(decodeIdentityError(429, { code: 'rate_limited' }))).toBe('protocol')
})
it('binds business transport to one identity and never dispatches after an identity switch', async () => {
  const now = Math.floor(Date.now() / 1000)
  const transport = {
    request: vi.fn(async (options: RequestOptions<unknown>) =>
      options.decode(
        options.path.endsWith('/context')
          ? {
              tenantId: tenant,
              principalId: provider,
              sessionId: provider,
              navigation: { manageAccounts: false, manageProviders: false },
            }
          : {
              session: {
                id: provider,
                issuedAt: now,
                idleExpiresAt: now + 600,
                absoluteExpiresAt: now + 1200,
              },
              identity: { principalId: provider, hasLocalPassword: true },
              csrfToken: 'a'.repeat(64),
            },
      ),
    ),
  } as unknown as HttpTransport
  const owner = createSession(createAuthPort(transport), { oidcEnabled: true })
  try {
    expect(() => bindSession(transport, owner)).toThrow('Session required')
    await owner.check(tenant)
    const request = vi.fn(async () => undefined)
    const business = bindSession({ request } as unknown as HttpTransport, owner)
    await business.request({ method: 'POST', path: '/api/v1/action', successStatus: 204 })
    expect(request).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        headers: { 'X-Identity-Request': '1', 'X-CSRF-Token': 'a'.repeat(64) },
      }),
    )
    owner.invalidate()
    await expect(
      business.request({
        method: 'GET',
        path: '/api/v1/action',
        successStatus: 200,
        decode: (value) => value,
      }),
    ).rejects.toThrow('Session required')
    expect(request).toHaveBeenCalledTimes(1)
  } finally {
    owner.dispose()
  }
})
