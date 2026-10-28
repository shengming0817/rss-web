import { createSession, createApi, loadConfig } from '@rss/auth/session'
import { expect, it } from 'vitest'
import { createIdentityTransport, isRssApiError } from '../../packages/api/src/identity'
const tenant = '11111111-1111-4111-8111-111111111111'
it('consumes V1 cookie/CSRF, host policy, account and provider operations through production transport', async ({
  task,
}) => {
  task.meta['step'] = 'config'
  const transport = createIdentityTransport()
  let session: ReturnType<typeof createSession> | undefined
  try {
    const config = await loadConfig(transport, window.location.origin)
    session = createSession(transport, config)
    const api = createApi(session)
    task.meta['step'] = 'session'
    await session.check(tenant)
    expect(session.state.value.status).toBe('anonymous')
    task.meta['step'] = 'login'
    await session.login(tenant, 'admin', 'correct horse battery staple')
    expect(session.managementHint.value).toBe(true)
    expect(document.cookie).not.toContain('identity-session')
    task.meta['step'] = 'refresh'
    await session.refresh()
    task.meta['step'] = 'reauthenticate'
    for (let attempt = 0; attempt < 7; attempt++)
      await session.reauthenticate('correct horse battery staple')
    expect(session.state.value.status).toBe('authenticated')
    task.meta['step'] = 'accounts'
    const account = await api.createAccount('joint-member', 'private joint member password')
    expect((await api.accounts()).accounts.some((a) => a.principalId === account.principalId)).toBe(
      true,
    )
    const first = await api.accounts({ fields: ['principalId'], sort: ['principalId'], limit: 1 })
    expect(first.accounts).toHaveLength(1)
    expect(Object.keys(first.accounts[0]!)).toEqual(['principalId'])
    expect(first.next).toBeTruthy()
    const second = await api.accounts({
      fields: ['principalId'],
      sort: ['principalId'],
      limit: 1,
      cursor: first.next!,
    })
    expect(second.accounts[0]?.principalId).not.toBe(first.accounts[0]?.principalId)
    const selected = await api.accounts({
      filter: "login=='joint-member'",
      fields: ['principalId', 'login', 'email', 'profileStatus'],
      source: 'local',
      limit: 1,
    })
    expect(selected.accounts[0]?.principalId).toBe(account.principalId)
    expect((await api.account(account.principalId)).login).toBe('joint-member')
    await api.setAccount(account, 'enabled', false)
    await api.resetPassword(account.principalId, 'private joint reset password')
    expect(
      (await api.accounts()).accounts.find((a) => a.principalId === account.principalId)?.enabled,
    ).toBe(false)
    await api.setAccount(account, 'enabled', true)
    task.meta['step'] = 'providers-create'
    const settings = {
      issuer: 'https://idp.example.test',
      clientId: 'reference',
      redirectUri: `${config.canonicalOrigin}/api/v1/identity/oidc/callback`,
      scopes: ['openid'],
      claims: {
        subject: { kind: 'oidc' as const },
        profile: { extensionsClaim: null, maxAgeSeconds: 14400 },
        groups: null,
        departmentSnapshot: { claim: 'organization_snapshot', maxAgeSeconds: 120 },
      },
      jit: false,
    }
    let provider = await api.createProvider(settings, 'private provider secret', null)
    task.meta['step'] = 'providers-create-readback'
    expect(provider.settings.claims.subject).toEqual(settings.claims.subject)
    expect(provider.settings.claims.departmentSnapshot).toEqual(settings.claims.departmentSnapshot)
    task.meta['step'] = 'providers-update'
    provider = await api.updateProvider(provider, settings, 'private rotated secret', null)
    task.meta['step'] = 'providers-update-readback'
    expect(provider.settings.claims.subject).toEqual(settings.claims.subject)
    expect(provider.settings.claims.departmentSnapshot).toEqual(settings.claims.departmentSnapshot)
    task.meta['step'] = 'providers-test'
    expect((await api.testProvider(provider)).passed).toBe(true)
    task.meta['step'] = 'providers-enable'
    provider = await api.enableProvider(provider, true)
    task.meta['step'] = 'step-up'
    await session.loadSecurity()
    expect(session.state.value.security?.eligibleStepUpProviders).toEqual([])
    // The session page has no generic upgrade operation. Probe the producer contract
    // through the existing owner: reject missing/unknown purposes before provider eligibility.
    const beginStepUp = (body: unknown) =>
      session!.business((headers) =>
        transport.request({
          method: 'POST',
          path: `/api/v1/identity/tenants/{tenant}/oidc/${provider.id}/step-up`,
          pathParams: { tenant },
          headers,
          body,
          successStatus: 200,
          decode: (value) => value,
        }),
      )
    for (const body of [
      { returnTarget: 'resume' },
      { returnTarget: 'resume', operation: { kind: 'session' } },
      { returnTarget: 'resume', operation: { kind: 'host' } },
    ]) {
      await expect(beginStepUp(body)).rejects.toMatchObject({
        status: 400,
        code: 'malformed_request',
        cause: 'wire',
      })
      expect(session.state.value.status).toBe('authenticated')
    }
    await expect(
      beginStepUp({ returnTarget: 'resume', operation: { kind: 'register' } }),
    ).rejects.toMatchObject({
      status: 401,
      code: 'invalid_credential',
      cause: 'wire',
    })
    // Re-read after the authoritative rejection before any further command.
    await session.check(tenant)
    expect((await api.loginOptions(tenant)).some((p) => p.id === provider.id)).toBe(true)
    await api.enableProvider(provider, false)
    task.meta['step'] = 'logout'
    await session.logout(true)
    await expect(
      transport.request({
        method: 'GET',
        path: '/api/v1/identity-host/tenants/{tenant}/context',
        pathParams: { tenant },
        successStatus: 200,
        decode: (v) => v,
      }),
    ).rejects.toMatchObject({ status: 401 })
    task.meta['step'] = 'forbidden'
    await session.login(tenant, 'joint-member', 'private joint reset password')
    expect(session.managementHint.value).toBe(false)
    await expect(api.accounts()).rejects.toMatchObject({
      status: 403,
      code: 'insufficient_privilege',
    })
    await expect(api.createAccount('forbidden', 'private rejected password')).rejects.toMatchObject(
      { status: 403 },
    )
    await session.logout()
    for (let attempt = 0; attempt < 5; attempt++)
      await expect(
        session.login(tenant, 'joint-unknown', 'private rejected password'),
      ).rejects.toMatchObject({ status: 401, code: 'invalid_credential' })
    await expect(
      session.login(tenant, 'joint-unknown', 'private rejected password'),
    ).rejects.toMatchObject({
      status: 429,
      code: 'rate_limited',
      retryAfterSeconds: expect.any(Number),
    })
    expect(session.state.value.status).toBe('anonymous')
  } catch (error) {
    task.meta['failure'] = isRssApiError(error)
      ? error.cause === 'timeout'
        ? 'timeout'
        : error.cause === 'network'
          ? 'environment'
          : 'assertion'
      : error instanceof Error && error.name === 'AssertionError'
        ? 'assertion'
        : 'environment'
    throw error
  } finally {
    session?.clear()
  }
})
