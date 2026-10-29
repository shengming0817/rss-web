import { expect, it, vi } from 'vitest'
import type { SessionOwner } from '@rss/auth-core'
import { decodeIdentityError, type HttpTransport, type RequestOptions } from '@rss/api/identity'
import { createIdentityAdministrationAdapter } from './administration'
import { providerTest, accounts } from './administration-decode'
const tenant = '11111111-1111-4111-8111-111111111111',
  principal = '22222222-2222-4222-8222-222222222222',
  session = '33333333-3333-4333-8333-333333333333'
const account = {
  principalId: principal,
  login: 'admin',
  enabled: true,
  memberActive: true,
  hasLocalPassword: true,
}
function fixture() {
  let state = {
    status: 'authenticated',
    tenant,
    identity: { principalId: principal },
    session: { id: session },
  }
  const owner = {
    getSnapshot: () => state,
    invalidate: vi.fn(),
    business: async (work: (v: { tenant: string; csrf: string }) => Promise<unknown>) =>
      work({ tenant: state.tenant, csrf: 'current-csrf' }),
  } as unknown as SessionOwner
  const request = vi.fn(async (options: RequestOptions<unknown>) => options.decode(account))
  const client = createIdentityAdministrationAdapter(
    { request } as unknown as HttpTransport,
    owner,
    true,
  )
  return {
    client,
    request,
    owner,
    switchPrincipal: () => {
      state = { ...state, identity: { principalId: tenant } }
    },
  }
}
it('injects only the sole owner CSRF and invalidates successful or uncertain self changes without replay', async () => {
  const f = fixture()
  await f.client.resetPassword(principal, 'disposable password')
  expect(f.owner.invalidate).toHaveBeenCalledTimes(1)
  expect(f.request).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      method: 'POST',
      pathParams: { tenant },
      headers: { 'X-Identity-Request': '1', 'X-CSRF-Token': 'current-csrf' },
    }),
  )
  const unknown = fixture()
  unknown.request.mockRejectedValue(new Error('Response lost'))
  await expect(unknown.client.setAccount(principal, 'membership', false)).rejects.toThrow(
    'Response lost',
  )
  expect(unknown.owner.invalidate).toHaveBeenCalledTimes(1)
  expect(unknown.request).toHaveBeenCalledTimes(1)
})
it('keeps a known forbidden self change separate from session expiry, preserving Retry-After', async () => {
  const f = fixture()
  f.request.mockRejectedValue(decodeIdentityError(403, { code: 'insufficient_privilege' }))
  await expect(f.client.ownPassword('current', 'new disposable password')).rejects.toMatchObject({
    status: 403,
  })
  expect(f.owner.invalidate).not.toHaveBeenCalled()
  f.request.mockRejectedValue(decodeIdentityError(429, { code: 'rate_limited' }, '31'))
  await expect(f.client.account(principal)).rejects.toMatchObject({ retryAfterSeconds: 31 })
})
it('rejects reuse of a client after the actor changes before sending any request', async () => {
  const f = fixture()
  f.switchPrincipal()
  await expect(f.client.account(principal)).rejects.toThrow('Mismatched')
  expect(f.request).not.toHaveBeenCalled()
})
it('distinguishes absent projections, malformed full account responses and cursor pages', () => {
  const projected = accounts({ accounts: [{ principalId: principal }], nextCursor: null }, [
    'principalId',
  ])
  expect(projected.items).toEqual([{ principalId: principal }])
  expect(projected.items[0]).not.toHaveProperty('enabled')
  expect(() =>
    accounts({ accounts: [{ ...account, administrator: true }], nextCursor: null }),
  ).toThrow()
  expect(() => accounts({ accounts: [account], nextCursor: principal })).toThrow()
})
it('shows the actual provider connection checks without inventing code exchange or full login qualification', () => {
  expect(
    providerTest({
      passed: true,
      report: {
        checks: ['binding', 'discovery', 'jwks'],
        tlsVerified: true,
        authorizationResponseIssuer: true,
      },
    }),
  ).toEqual({
    passed: true,
    checks: ['binding', 'discovery', 'jwks'],
    tlsVerified: true,
    authorizationResponseIssuer: true,
  })
  expect(() =>
    providerTest({
      passed: true,
      report: { checks: ['unknown'], tlsVerified: true, authorizationResponseIssuer: true },
    }),
  ).toThrow()
  expect(
    providerTest({ passed: false, diagnostic: { stage: 'discovery', reason: 'egress_denied' } }),
  ).toEqual({ passed: false, diagnostic: 'discovery: egress_denied' })
})
