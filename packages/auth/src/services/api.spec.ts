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
    f.replies.push({
      accounts: [accountValue],
      nextCursor: OTHER,
    })
    expect((await f.api.accounts()).next).toBe(OTHER)
    f.replies.push({ accounts: [], nextCursor: null })
    await f.api.accounts(OTHER)
    expect(f.request.mock.calls.at(-1)?.[0].query).toEqual({ cursor: OTHER })
    f.replies.push({ sessions: [], nextCursor: null })
    await f.api.sessions()
    f.replies.push({ sessions: [], nextCursor: ID })
    await f.api.sessions(ID)
    f.replies.push(accountValue)
    await f.api.createAccount('member', 'private password')
    for (const field of ['enabled', 'membership'] as const) {
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
  it('consumes provider management and upstream flows without credential decoding', async () => {
    const f = fixture()
    f.replies.push({ providers: [{ providerId: OTHER, label: 'idp.test' }] })
    expect((await f.api.loginOptions(TENANT))[0]?.id).toBe(OTHER)
    await f.login()
    f.replies.push({ providers: [providerValue] })
    await f.api.providers()
    f.replies.push(providerValue)
    await f.api.createProvider(settingsValue, 'fixture-secret', null)
    f.replies.push({ ...providerValue, version: 2 })
    await f.api.updateProvider(providerValue, settingsValue, 'rotated-secret', null)
    f.replies.push({ ...providerValue, version: 2, enabled: true })
    await f.api.enableProvider(providerValue, true)
    f.replies.push({
      passed: false,
      diagnostic: { stage: 'binding', reason: 'invalid_trust_anchor' },
    })
    expect((await f.api.testProvider(providerValue)).passed).toBe(false)
    f.replies.push({ authorizationUrl: 'https://idp.test/authorize' })
    expect(await f.api.beginSso(TENANT, OTHER)).toContain('idp.test')
    f.replies.push({ authorizationUrl: 'https://idp.test/authorize' })
    await f.api.link(OTHER, 'private password')
    f.replies.push({ authorizationUrl: 'https://idp.test/reauthenticate' })
    await f.api.link(OTHER, null)
    expect(f.request.mock.calls.at(-1)?.[0].body).toEqual({
      returnTarget: 'resume',
      password: null,
    })
    f.replies.push(decodeIdentityError(503, { code: 'identity_unavailable' }))
    await expect(f.api.stepUp(OTHER)).rejects.toBeDefined()
    expect(f.session.state.value.status).toBe('unavailable')
  })
  it('does not turn conflicts, permission errors or unknown outcomes into retries', async () => {
    const f = fixture()
    await expect(f.api.accounts()).rejects.toBeDefined()
    await f.login()
    f.replies.push(decodeIdentityError(409, { code: 'configuration_changed' }))
    await expect(f.api.enableProvider(providerValue, true)).rejects.toBeDefined()
    expect(f.session.state.value.status).toBe('authenticated')
    const beforeRejection = f.request.mock.calls.length
    f.replies.push(decodeIdentityError(403, { code: 'reauthentication_failed' }))
    await expect(f.api.ownPassword('wrong', 'new password')).rejects.toMatchObject({
      status: 403,
      code: 'reauthentication_failed',
      cause: 'wire',
    })
    expect(f.request).toHaveBeenCalledTimes(beforeRejection + 1)
    expect(f.session.state.value.status).toBe('authenticated')
    const count = f.request.mock.calls.length
    f.replies.push(new Error('private server details'))
    await expect(f.api.ownPassword('old', 'new')).rejects.toBeDefined()
    expect(f.session.state.value.status).toBe('anonymous')
    expect(f.request).toHaveBeenCalledTimes(count + 1)
    await f.login()
    f.replies.push(accountValue)
    await f.api.setAccount({ ...accountValue, principalId: ID }, 'enabled', false)
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
    resolve({ accounts: [], nextCursor: null })
    await expect(result).rejects.toBeDefined()
  })
})

it('keeps the session after a duplicate login conflict without replaying creation', async () => {
  const f = fixture()
  await f.login()
  f.replies.push(decodeIdentityError(409, { code: 'account_already_exists' }))
  await expect(f.api.createAccount('existing', 'strong private password')).rejects.toMatchObject({
    code: 'account_already_exists',
  })
  expect(f.session.state.value.status).toBe('authenticated')
  expect(f.request.mock.calls.filter(([o]) => o.path.endsWith('/accounts'))).toHaveLength(1)
})

it('decodes a bounded full issuer and client login label', async () => {
  const f = fixture()
  const label = `https://idp.example.test/${'a'.repeat(2000)} · client · ${OTHER}`
  f.replies.push({ providers: [{ providerId: OTHER, label }] })
  expect(await f.api.loginOptions(TENANT)).toEqual([{ id: OTHER, label }])
})
