import { describe, expect, it } from 'vitest'
import { decodeIdentityError } from '@rss/api/identity'
import { fixture, sessionValue, TENANT, TOKEN } from '../../tests/support'
describe('one instance cookie session owner', () => {
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
    expect(
      f.request.mock.calls.filter(([o]) => /\/(refresh|reauthenticate)$/.test(o.path)),
    ).toHaveLength(1)
    await f.session.activity()
    expect(f.request).toHaveBeenCalledTimes(4)
  })
  it('clears revoked sessions, blocks unavailable authority, and never replays writes', async () => {
    const f = fixture()
    f.replies.push(decodeIdentityError(401, { code: 'invalid_credential' }))
    await f.session.check(TENANT)
    expect(f.session.state.value.status).toBe('anonymous')
    expect(() => f.session.headers()).toThrow()
    await f.login()
    f.replies.push(decodeIdentityError(503, { code: 'identity_unavailable' }))
    await expect(f.session.refresh()).rejects.toBeDefined()
    expect(f.session.state.value.status).toBe('unavailable')
    expect(() => f.session.headers()).toThrow()
    await f.login()
    f.replies.push(decodeIdentityError(403, { code: 'insufficient_privilege' }))
    await expect(f.api.accounts()).rejects.toBeDefined()
    expect(f.session.state.value.status).toBe('authenticated')
    f.replies.push(decodeIdentityError(401, { code: 'invalid_credential' }))
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
    f.replies.push(decodeIdentityError(401, { code: 'invalid_credential' }))
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
    value.session.idleExpiresAt = Math.floor(Date.now() / 1000) + 30
    f.replies.push(value)
    await f.session.check(TENANT)
    f.replies.push(sessionValue())
    await f.session.activity()
    expect(f.request.mock.calls.filter(([r]) => r.path.endsWith('/refresh'))).toHaveLength(1)
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
    decodeIdentityError(401, { code: 'invalid_credential' }),
  )
  const logout = f.session.logout()
  await Promise.resolve()
  const check = f.session.check(TENANT)
  try {
    expect(f.request).toHaveBeenCalledTimes(3)
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
  expect(f.request.mock.calls.some(([o]) => /\/(refresh|reauthenticate)$/.test(o.path))).toBe(false)
  finish(undefined)
  await exit
  await renewal
  expect(f.session.state.value.status).toBe('anonymous')
})

it('rejects queued refresh after a tenant transition', async () => {
  const f = fixture()
  await f.login()
  let release!: () => void
  const hold = f.session.perform(
    () =>
      new Promise<void>((resolve) => {
        release = resolve
      }),
  )
  const other = '44444444-4444-4444-8444-444444444444'
  f.replies.push(sessionValue(), sessionValue())
  const check = f.session.check(other)
  const refresh = expect(f.session.refresh()).rejects.toThrow('Operation abandoned')
  const reauth = expect(f.session.reauthenticate('private password')).rejects.toThrow(
    'Operation abandoned',
  )
  release()
  await Promise.all([hold, check, refresh, reauth])
  expect(f.request.mock.calls.some(([o]) => /\/(refresh|reauthenticate)$/.test(o.path))).toBe(false)
  expect(f.session.state.value.tenant).toBe(other)
  expect(f.session.state.value.status).toBe('authenticated')
})

for (const control of ['refresh', 'logout', 'reauthenticate'] as const) {
  it(`never rebinds queued ${control} after page departure`, async () => {
    const f = fixture()
    await f.login()
    let release!: () => void
    const hold = f.session.perform(
      () =>
        new Promise<void>((r) => {
          release = r
        }),
    )
    const rejected = expect(
      control === 'reauthenticate'
        ? f.session.reauthenticate('private password')
        : f.session[control](),
    ).rejects.toThrow('Operation abandoned')
    f.session.leavePage()
    release()
    await expect(hold).rejects.toThrow('Stale response')
    await rejected
    expect(f.request).toHaveBeenCalledTimes(2)
    expect(f.session.state.value.status).toBe('authenticated')
    f.session.clear()
  })
}
it('never applies queued logout to a newly selected tenant', async () => {
  const f = fixture()
  await f.login()
  let release!: () => void
  const hold = f.session.perform(
    () =>
      new Promise<void>((r) => {
        release = r
      }),
  )
  const other = '44444444-4444-4444-8444-444444444444'
  f.replies.push(sessionValue())
  const change = f.session.check(other)
  const rejected = expect(f.session.logout()).rejects.toThrow('Operation abandoned')
  release()
  await Promise.all([hold, change, rejected])
  expect(f.request.mock.calls.some(([o]) => o.path.endsWith('/logout'))).toBe(false)
  expect(f.session.state.value.status).toBe('authenticated')
  f.session.clear()
})

it('dispatches step-up after same-session rotation using the new CSRF', async () => {
  const f = fixture()
  await f.login()
  let release!: (v: unknown) => void
  f.replies.push(
    () =>
      new Promise((r) => {
        release = r
      }),
    { authorizationUrl: 'https://idp.test/authorize' },
  )
  const rotation = f.session.refresh()
  const work = f.api.stepUp(TENANT)
  release(sessionValue(true, 'c'.repeat(64)))
  await Promise.all([rotation, work])
  expect(f.request.mock.calls.at(-1)?.[0].headers?.['X-CSRF-Token']).toBe('c'.repeat(64))
  f.session.clear()
})
