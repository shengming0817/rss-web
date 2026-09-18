import { expect, it } from 'vitest'
import { createIdentityTransport, isRssApiError } from '../../packages/api/src/identity'
import { createSession } from '../../apps/identity/src/services/session'
import { createApi } from '../../apps/identity/src/services/api'
import { loadConfig } from '../../apps/identity/src/services/config'
const tenant = '11111111-1111-4111-8111-111111111111'
it('consumes v2 cookie/CSRF, host policy, account and provider operations through production transport', async ({
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
    await session.reauthenticate('correct horse battery staple')
    task.meta['step'] = 'accounts'
    const account = await api.createAccount('joint-member', 'private joint member password')
    expect((await api.accounts()).accounts.some((a) => a.principalId === account.principalId)).toBe(
      true,
    )
    await api.setAccount(account, 'enabled', false)
    await api.resetPassword(account.principalId, 'private joint reset password')
    expect(
      (await api.accounts()).accounts.find((a) => a.principalId === account.principalId)?.enabled,
    ).toBe(false)
    await api.setAccount(account, 'enabled', true)
    task.meta['step'] = 'providers'
    const settings = {
      issuer: 'https://idp.example.test',
      clientId: 'reference',
      redirectUri: `${config.canonicalOrigin}/api/v2/oidc/callback`,
      scopes: ['openid'],
      claims: { email: null, groups: null },
      jit: false,
    }
    let provider = await api.createProvider(settings, 'private provider secret', null)
    provider = await api.updateProvider(provider, settings, 'private rotated secret', null)
    expect((await api.testProvider(provider)).passed).toBe(true)
    provider = await api.enableProvider(provider, true)
    task.meta['step'] = 'step-up'
    await session.loadSecurity()
    expect(session.state.value.security?.eligibleStepUpProviders).toEqual([])
    await expect(api.stepUp(provider.id)).rejects.toMatchObject({
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
        path: '/api/identity-host/v1/tenants/{tenant}/context',
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
