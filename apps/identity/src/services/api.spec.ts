import { describe, expect, it, vi } from 'vitest'
import { decodeIdentityError } from '@rss/api/identity'
import {
  fixture,
  accountValue,
  providerValue,
  settingsValue,
  ID,
  OTHER,
  TENANT,
  TOKEN,
} from '../../tests/support'
describe('Identity operations use one protected transport without replay', () => {
  it('consumes every account/session operation with explicit pagination', async () => {
    const f = fixture()
    await f.login()
    f.replies.push({ accounts: [accountValue], next_cursor: OTHER })
    expect((await f.api.accounts()).next).toBe(OTHER)
    f.replies.push({ accounts: [], next_cursor: null })
    await f.api.accounts(OTHER)
    expect(f.request.mock.calls.at(-1)?.[0].query).toEqual({ cursor: OTHER })
    f.replies.push({ sessions: [], next_cursor: null })
    await f.api.sessions()
    f.replies.push({ sessions: [], next_cursor: ID })
    await f.api.sessions(ID)
    f.replies.push(accountValue)
    await f.api.createAccount('member', 'private password', 'member')
    for (const field of ['enabled', 'administrator', 'membership'] as const) {
      f.replies.push(accountValue)
      await f.api.setAccount(accountValue, field, false)
    }
    f.replies.push(accountValue)
    await f.api.resetPassword(OTHER, 'private new password')
    expect(f.request.mock.calls.at(-1)?.[0].headers?.['X-CSRF-Token']).toBe(TOKEN)
    f.replies.push(accountValue)
    await f.api.ownPassword('private password', 'private new password')
    expect(f.session.state.value.status).toBe('anonymous')
  })
  it('consumes provider management and downstream flows without credential decoding', async () => {
    const f = fixture()
    f.replies.push({ providers: [{ provider_id: OTHER, label: 'idp.test' }] })
    expect((await f.api.loginOptions(TENANT))[0]?.id).toBe(OTHER)
    await f.login()
    f.replies.push({ providers: [providerValue] })
    await f.api.providers()
    f.replies.push(providerValue)
    await f.api.createProvider(settingsValue)
    f.replies.push({ ...providerValue, version: 2 })
    await f.api.updateProvider(providerValue, settingsValue)
    f.replies.push({ ...providerValue, version: 2, enabled: true })
    await f.api.enableProvider(providerValue, true)
    f.replies.push({ passed: false, diagnostic: { stage: 'binding', reason: 'missing_secret' } })
    expect((await f.api.testProvider(providerValue)).passed).toBe(false)
    f.replies.push({ authorization_url: 'https://idp.test/authorize' })
    expect(await f.api.beginSso(TENANT, OTHER)).toContain('idp.test')
    const flow = { tenant_id: TENANT, grant_id: OTHER }
    f.replies.push(flow)
    await f.api.prepare('login', 'challenge')
    f.replies.push({ redirect_to: 'https://issuer.test/continue' })
    await f.api.accept('login', 'challenge', flow)
    f.replies.push(
      decodeIdentityError(503, { code: 'identity_unavailable', correlation_id: ID }, true),
    )
    await expect(f.api.accept('consent', 'challenge', flow)).rejects.toBeDefined()
    expect(f.session.state.value.status).toBe('unavailable')
  })
  it('does not turn conflicts, permission errors or unknown outcomes into retries', async () => {
    const f = fixture()
    await expect(f.api.accounts()).rejects.toBeDefined()
    await f.login()
    f.replies.push(decodeIdentityError(409, { code: 'configuration_changed' }, false))
    await expect(f.api.enableProvider(providerValue, true)).rejects.toBeDefined()
    expect(f.session.state.value.status).toBe('authenticated')
    f.replies.push(decodeIdentityError(403, { code: 'reauthentication_failed' }, false))
    await expect(f.api.ownPassword('wrong', 'new password')).rejects.toBeDefined()
    expect(f.session.state.value.status).toBe('authenticated')
    const count = f.request.mock.calls.length
    f.replies.push(new Error('private server details'))
    await expect(f.api.ownPassword('old', 'new')).rejects.toBeDefined()
    expect(f.session.state.value.status).toBe('anonymous')
    expect(f.request).toHaveBeenCalledTimes(count + 1)
    await f.login()
    f.replies.push(accountValue)
    await f.api.setAccount({ ...accountValue, principal_id: ID }, 'enabled', false)
    expect(f.session.state.value.status).toBe('anonymous')
  })
  it('fences delayed reads when authority changes', async () => {
    const f = fixture()
    await f.login()
    let resolve!: (v: unknown) => void
    f.replies.push(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
    const result = f.api.accounts()
    await vi.waitFor(() => expect(typeof resolve).toBe('function'))
    f.session.clear()
    resolve({ accounts: [], next_cursor: null })
    await expect(result).rejects.toBeDefined()
  })
})
