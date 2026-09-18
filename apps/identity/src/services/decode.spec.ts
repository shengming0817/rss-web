import { describe, expect, it } from 'vitest'
import * as d from './decode'
import { accountValue, providerValue, sessionValue, ID } from '../../tests/support'
import { testReport } from './api'
describe('closed Identity wire projections', () => {
  it('accepts only the embedded v2 identity without role fields', () => {
    const value = {
      session: { id: ID, authTime: 1, idleExpiresAt: 4102444800, absoluteExpiresAt: 4102444900 },
      identity: { principalId: ID, hasLocalPassword: true },
      csrfToken: 'a'.repeat(64),
    }
    expect(d.sessionResponse(value)).toEqual(value)
    expect(() =>
      d.sessionResponse({ ...value, identity: { ...value.identity, administrator: true } }),
    ).toThrow()
  })
  it('decodes accounts, sessions, provider config', () => {
    expect(d.account(accountValue).login).toBe('member')
    expect(d.account({ ...accountValue, login: null }).login).toBeNull()
    expect(d.provider(providerValue).version).toBe(1)
    expect(d.sessionResponse(sessionValue()).identity.hasLocalPassword).toBe(true)
    expect(d.redirect({ authorizationUrl: 'https://idp.test/path' }, 'authorizationUrl')).toBe(
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
    expect(() => d.session({ ...sessionValue().session, idleExpiresAt: 0 })).toThrow()
    expect(() => d.sessionResponse({ ...sessionValue(), csrfToken: 'bad' })).toThrow()
    for (const url of ['http://idp.test', 'https://user:password@idp.test'])
      expect(() => d.redirect({ authorizationUrl: url }, 'authorizationUrl')).toThrow()
  })
  it('only exposes closed provider test diagnostics', () => {
    expect(
      testReport({
        passed: true,
        report: {
          checks: ['binding', 'discovery', 'jwks'],
          tlsVerified: true,
          authorizationResponseIssuer: true,
        },
      }).passed,
    ).toBe(true)
    expect(
      testReport({
        passed: false,
        diagnostic: { stage: 'binding', reason: 'invalid_trust_anchor' },
      }).diagnostic,
    ).toBe('binding: invalid_trust_anchor')
    for (const value of [
      null,
      {},
      { passed: true, report: {} },
      {
        passed: true,
        report: { checks: ['private'], tlsVerified: true, authorizationResponseIssuer: true },
      },
      {
        passed: true,
        report: { checks: [], tlsVerified: 'x', authorizationResponseIssuer: true },
      },
      { passed: false, diagnostic: { stage: 'secret', reason: 'raw' } },
      { passed: true, diagnostic: {} },
      { passed: 'x', diagnostic: {} },
    ])
      expect(() => testReport(value)).toThrow()
  })
})
