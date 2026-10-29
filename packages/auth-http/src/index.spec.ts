import { expect, it, vi } from 'vitest'
import { createAuthPort, loadHostConfig } from './index'
import type { HttpTransport } from '@rss/api/identity'
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
