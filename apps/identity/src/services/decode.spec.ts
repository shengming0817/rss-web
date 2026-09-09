import { describe, expect, it } from 'vitest'
import * as d from './decode'
import { accountValue, providerValue, sessionValue, ID } from '../../tests/support'
import { testReport } from './api'
describe('closed Identity wire projections', () => {
  it('decodes accounts, sessions, provider config and bound flow', () => {
    expect(d.account(accountValue).login).toBe('member')
    expect(d.account({ ...accountValue, login: null }).login).toBeNull()
    expect(d.provider(providerValue).version).toBe(1)
    expect(d.sessionResponse(sessionValue()).identity.administrator).toBe(true)
    expect(d.flow({ tenant_id: ID, grant_id: ID }).grant_id).toBe(ID)
    expect(d.redirect({ redirect_to: 'https://idp.test/path' }, 'redirect_to')).toBe(
      'https://idp.test/path',
    )
    expect(d.redirect({ authorization_url: 'https://idp.test/path' }, 'authorization_url')).toBe(
      'https://idp.test/path',
    )
  })
  it('fails closed on extra fields, nil IDs, unsafe strings and malformed types', () => {
    for (const value of [null, [], 'x', { extra: true }])
      expect(() => d.object(value, [])).toThrow()
    for (const value of ['00000000-0000-0000-0000-000000000000', '', 2, 'invalid'])
      expect(() => d.uuid(value)).toThrow()
    for (const value of ['private\nmessage', 4, 'x'.repeat(2049)])
      expect(() => d.text(value)).toThrow()
    for (const value of [-1, Infinity, NaN, '2', 0.5]) expect(() => d.number(value)).toThrow()
    expect(() => d.bool('false')).toThrow()
    expect(() => d.list({}, d.text)).toThrow()
    expect(() => d.list([1, 2], d.number, 1)).toThrow()
    expect(() => d.provider({ ...providerValue, version: 0 })).toThrow()
    expect(() => d.session({ ...sessionValue().session, idle_expires_at: 0 })).toThrow()
    expect(() => d.sessionResponse({ ...sessionValue(), csrf_token: 'bad' })).toThrow()
    for (const url of ['http://idp.test', 'https://user:password@idp.test'])
      expect(() => d.redirect({ redirect_to: url }, 'redirect_to')).toThrow()
  })
  it('only exposes closed provider test diagnostics', () => {
    expect(
      testReport({
        passed: true,
        report: {
          checks: ['binding', 'discovery', 'jwks'],
          tls_verified: true,
          authorization_response_issuer: true,
        },
      }).passed,
    ).toBe(true)
    expect(
      testReport({ passed: false, diagnostic: { stage: 'binding', reason: 'missing_secret' } })
        .diagnostic,
    ).toBe('binding: missing_secret')
    for (const value of [
      null,
      {},
      { passed: true, report: {} },
      {
        passed: true,
        report: { checks: ['private'], tls_verified: true, authorization_response_issuer: true },
      },
      {
        passed: true,
        report: { checks: [], tls_verified: 'x', authorization_response_issuer: true },
      },
      { passed: false, diagnostic: { stage: 'secret', reason: 'raw' } },
      { passed: true, diagnostic: {} },
      { passed: 'x', diagnostic: {} },
    ])
      expect(() => testReport(value)).toThrow()
  })
})
