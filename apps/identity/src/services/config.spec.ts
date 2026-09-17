import { describe, expect, it } from 'vitest'
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
