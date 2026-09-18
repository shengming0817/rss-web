import { describe, expect, it } from 'vitest'
import { decodeIdentityError } from '@rss/api/identity'
// Test-only sanitized errors; application code still uses only the Identity transport.
// eslint-disable-next-line no-restricted-imports
import { networkErrorForTest, timeoutErrorForTest } from '@rss/api/testing'
import { loadConfig } from './config'
import { fixture, ID, OTHER, TENANT, sessionValue } from '../../tests/support'

describe('deployment and authoritative host context', () => {
  it('requires exact same-origin static configuration and rejects missing/extra fields', async () => {
    const f = fixture(false)
    const canonicalOrigin = 'https://identity.example.test'
    f.replies.push({ canonicalOrigin, oidcEnabled: false })
    expect(await loadConfig(f.session.transport, canonicalOrigin)).toEqual({
      canonicalOrigin,
      oidcEnabled: false,
    })
    for (const value of [
      undefined,
      {},
      { canonicalOrigin, oidcEnabled: 'false' },
      { canonicalOrigin: canonicalOrigin + '/', oidcEnabled: false },
      { canonicalOrigin: 'https://other.test', oidcEnabled: false },
      { canonicalOrigin, oidcEnabled: false, apiOrigin: '/api/v1' },
    ]) {
      f.replies.push(value)
      await expect(loadConfig(f.session.transport, canonicalOrigin)).rejects.toThrow()
    }
  })
  it('dispatches no OIDC requests in local mode', async () => {
    const f = fixture(false)
    await f.login()
    await f.session.loadSecurity()
    await expect(f.api.loginOptions(TENANT)).rejects.toThrow()
    await expect(f.api.stepUp(OTHER)).rejects.toThrow()
    await expect(f.api.providers()).rejects.toThrow()
    expect(f.request.mock.calls.map(([r]) => r.path)).toEqual([
      '/api/v2/tenants/{tenant}/login',
      '/api/identity-host/v1/tenants/{tenant}/context',
    ])
    expect(f.session.providerHint.value).toBe(false)
    f.session.clear()
  })
  it('clears hints immediately on session changes and refuses mismatched authority', async () => {
    const f = fixture()
    await f.login()
    expect(f.session.managementHint.value).toBe(true)
    let release!: (v: unknown) => void
    f.replies.push(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    const change = f.session.check(TENANT)
    await Promise.resolve()
    expect(f.session.managementHint.value).toBe(false)
    f.contextReplies.push({
      tenantId: TENANT,
      principalId: OTHER,
      sessionId: ID,
      navigation: { manageAccounts: true, manageProviders: true },
    })
    release(sessionValue())
    await expect(change).rejects.toThrow()
    expect(f.session.state.value.host).toBeNull()
    expect(f.session.state.value.status).toBe('unavailable')
  })
})

for (const operation of ['login', 'check', 'refresh', 'reauthenticate'] as const) {
  it(`preserves accepted session and CSRF after ${operation} when navigation is unavailable`, async () => {
    const f = fixture()
    if (operation === 'refresh' || operation === 'reauthenticate') await f.login()
    f.replies.push(sessionValue(true, 'b'.repeat(64)))
    f.contextReplies.push(decodeIdentityError(503, { code: 'identity_unavailable' }))
    await (operation === 'login'
      ? f.session.login(TENANT, 'user', 'private password')
      : operation === 'check'
        ? f.session.check(TENANT)
        : operation === 'refresh'
          ? f.session.refresh()
          : f.session.reauthenticate('private password'))
    expect(f.session.state.value.status).toBe('authenticated')
    expect(f.session.state.value.navigation).toBe('unavailable')
    expect(f.session.headers()['X-CSRF-Token']).toBe('b'.repeat(64))
    expect(f.session.managementHint.value).toBe(false)
    expect(f.session.providerHint.value).toBe(false)
    await f.session.loadContext()
    expect(f.session.state.value.navigation).toBe('ready')
    expect(f.session.managementHint.value).toBe(true)
    f.session.clear()
  })
}

it('degrades only transient navigation errors and fences stale success and failure', async () => {
  const f = fixture()
  await f.login()
  for (const error of [networkErrorForTest(), timeoutErrorForTest()]) {
    f.contextReplies.push(error)
    await f.session.loadContext()
    expect(f.session.state.value.navigation).toBe('unavailable')
    expect(f.session.headers()['X-CSRF-Token']).toBe(sessionValue().csrfToken)
  }
  for (const error of [
    decodeIdentityError(401, { code: 'invalid_credential' }),
    decodeIdentityError(503, { code: 'unrecognized' }),
    new Error('invalid response'),
  ]) {
    await f.login()
    f.contextReplies.push(error)
    await expect(f.session.loadContext()).rejects.toBe(error)
    expect(f.session.state.value.status).toBe(
      'status' in error && error.status === 401 ? 'anonymous' : 'unavailable',
    )
    expect(() => f.session.headers()).toThrow()
  }
  for (const response of [
    {
      tenantId: TENANT,
      principalId: ID,
      sessionId: ID,
      navigation: { manageAccounts: true, manageProviders: true },
    },
    decodeIdentityError(401, { code: 'invalid_credential' }),
    networkErrorForTest(),
  ]) {
    await f.login()
    let release!: (value: unknown) => void
    f.contextReplies.push(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    const pending = f.session.loadContext()
    await Promise.resolve()
    f.session.clear()
    const next = f.login()
    release(response)
    await expect(pending).rejects.toBeDefined()
    await next
    expect(f.session.state.value.status).toBe('authenticated')
    expect(f.session.state.value.navigation).toBe('ready')
    f.session.clear()
  }
})
