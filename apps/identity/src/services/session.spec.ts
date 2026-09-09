import { describe, expect, it } from 'vitest'
import { decodeIdentityError } from '@rss/api/identity'
import { fixture, sessionValue, TENANT, TOKEN } from '../../tests/support'
describe('one central cookie session owner', () => {
  it('checks state, keeps CSRF private and serializes refresh rotation', async () => {
    const f = fixture()
    f.replies.push(sessionValue())
    await f.session.check(TENANT)
    expect(f.session.state.value.status).toBe('authenticated')
    expect(JSON.stringify(f.session.state.value)).not.toContain(TOKEN)
    let resolve!: (v: unknown) => void
    f.replies.push(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
    const first = f.session.refresh()
    const second = f.session.refresh()
    expect(first).toBe(second)
    await Promise.resolve()
    resolve(sessionValue(true, 'b'.repeat(64)))
    await first
    expect(f.session.headers()['X-CSRF-Token']).toBe('b'.repeat(64))
    expect(f.request.mock.calls.filter(([o]) => o.path.endsWith('/refresh'))).toHaveLength(1)
    await f.session.activity()
    expect(f.request).toHaveBeenCalledTimes(2)
  })
  it('clears revoked sessions, blocks unavailable authority, and never replays writes', async () => {
    const f = fixture()
    f.replies.push(decodeIdentityError(401, { code: 'invalid_credential' }, false))
    await f.session.check(TENANT)
    expect(f.session.state.value.status).toBe('anonymous')
    expect(() => f.session.headers()).toThrow()
    await f.login()
    f.replies.push(decodeIdentityError(503, { code: 'identity_unavailable' }, false))
    await expect(f.session.refresh()).rejects.toBeDefined()
    expect(f.session.state.value.status).toBe('unavailable')
    expect(() => f.session.headers()).toThrow()
    await f.login()
    f.replies.push(decodeIdentityError(403, { code: 'insufficient_privilege' }, false))
    await expect(f.api.accounts()).rejects.toBeDefined()
    expect(f.session.state.value.status).toBe('authenticated')
    f.replies.push(decodeIdentityError(401, { code: 'invalid_credential' }, false))
    await expect(f.api.accounts()).rejects.toBeDefined()
    expect(f.session.state.value.status).toBe('anonymous')
  })
  it('fences late responses and clears local authority before signout confirmation', async () => {
    const f = fixture()
    let resolve!: (v: unknown) => void
    f.replies.push(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
    const check = f.session.check(TENANT)
    f.session.clear()
    resolve(sessionValue())
    await expect(check).rejects.toBeDefined()
    expect(f.session.state.value.status).toBe('anonymous')
    await f.login()
    f.replies.push(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
    const exit = f.session.logout(true)
    await Promise.resolve()
    expect(f.session.state.value.status).toBe('anonymous')
    resolve(undefined)
    await exit
    expect(f.request.mock.calls.at(-1)?.[0].path).toContain('logout-all')
  })
  it('requires a tenant, rejects bad login, and distinguishes unavailable checks', async () => {
    const f = fixture()
    await expect(f.session.refresh()).rejects.toBeDefined()
    await f.session.logout()
    f.replies.push(decodeIdentityError(401, { code: 'invalid_credential' }, false))
    await expect(f.session.login(TENANT, 'user', 'bad')).rejects.toBeDefined()
    f.replies.push(new Error('network'))
    await expect(f.session.check(TENANT)).rejects.toBeDefined()
    expect(f.session.state.value.status).toBe('unavailable')
    await f.login()
    f.replies.push(new Error('network'))
    await expect(f.session.logout()).rejects.toBeDefined()
    expect(f.session.state.value.status).toBe('unavailable')
  })
  it('renews only near expiry when invoked by activity', async () => {
    const f = fixture()
    const value = sessionValue()
    value.session.idle_expires_at = Math.floor(Date.now() / 1000) + 30
    f.replies.push(value)
    await f.session.check(TENANT)
    f.replies.push(sessionValue())
    await f.session.activity()
    expect(f.request.mock.calls.at(-1)?.[0].path).toContain('/refresh')
  })
})

it('waits for signout settlement before a login-page session check', async () => {
  const f = fixture()
  await f.login()
  let resolve!: (v: unknown) => void
  f.replies.push(
    () =>
      new Promise((r) => {
        resolve = r
      }),
    decodeIdentityError(401, { code: 'invalid_credential' }, false),
  )
  const logout = f.session.logout()
  await Promise.resolve()
  const check = f.session.check(TENANT)
  try {
    expect(f.request).toHaveBeenCalledTimes(2)
  } finally {
    resolve(undefined)
  }
  await logout
  await check
  expect(f.session.state.value.status).toBe('anonymous')
})

it('does not start refresh during pending logout', async () => {
  const f = fixture()
  await f.login()
  let finish!: (v: unknown) => void
  f.replies.push(
    () =>
      new Promise((r) => {
        finish = r
      }),
  )
  const exit = f.session.logout()
  await Promise.resolve()
  const renewal = f.session.refresh().catch(() => undefined)
  expect(f.request.mock.calls.some(([o]) => o.path.endsWith('/refresh'))).toBe(false)
  finish(undefined)
  await exit
  await renewal
  expect(f.session.state.value.status).toBe('anonymous')
})

it('serializes downstream accept behind rotation and uses the new CSRF', async () => {
  const f = fixture()
  await f.login()
  let finish!: (v: unknown) => void
  f.replies.push(
    () =>
      new Promise((r) => {
        finish = r
      }),
    { redirect_to: 'https://consumer.example.test/done' },
  )
  const rotation = f.session.refresh()
  const acceptance = f.api.accept('login', 'challenge', { tenant_id: TENANT, grant_id: TENANT })
  expect(f.request).toHaveBeenCalledTimes(2)
  finish(sessionValue(true, 'c'.repeat(64)))
  await rotation
  await acceptance
  expect(f.request.mock.calls.at(-1)?.[0].headers?.['X-CSRF-Token']).toBe('c'.repeat(64))
})
