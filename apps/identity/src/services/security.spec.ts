import { describe, expect, it, vi } from 'vitest'
import { fixture, securityValue, sessionValue, TENANT, OTHER } from '../../tests/support'
import { sessionSecurity } from './decode'
describe('current session security', () => {
  it('coalesces reads, binds facts to the session and invalidates on renewal', async () => {
    const f = fixture()
    await f.login()
    expect(f.request).toHaveBeenCalledTimes(2)
    let finish!: (v: unknown) => void
    f.replies.push(
      () =>
        new Promise((r) => {
          finish = r
        }),
    )
    const first = f.session.loadSecurity()
    expect(f.session.loadSecurity()).toBe(first)
    await vi.waitFor(() => expect(finish).toBeDefined())
    finish(securityValue())
    await first
    expect(f.session.state.value.security?.authentication.acr).toBe('unspecified')
    f.replies.push(sessionValue())
    await f.session.refresh()
    expect(f.session.state.value.security).toBeNull()
    f.replies.push({ ...securityValue(), sessionId: OTHER })
    await expect(f.session.loadSecurity()).rejects.toThrow()
    expect(f.session.state.value.security).toBeNull()
    expect(f.request.mock.calls.filter(([o]) => o.path.endsWith('/security'))).toHaveLength(2)
    f.session.clear()
  })
  it('never dispatches a queued operation in a different tenant or after page departure', async () => {
    const f = fixture()
    await f.login()
    let finish!: () => void
    const hold = f.session.perform(
      () =>
        new Promise<void>((r) => {
          finish = r
        }),
    )
    f.replies.push(sessionValue())
    const transition = f.session.check(OTHER)
    const stale = f.api.accounts()
    const assertion = expect(stale).rejects.toThrow('Operation abandoned')
    finish()
    await Promise.all([hold, transition, assertion])
    expect(f.request.mock.calls.some(([o]) => o.path.endsWith('/accounts'))).toBe(false)
    const queued = f.session.perform(
      () =>
        new Promise<void>((r) => {
          finish = r
        }),
    )
    const command = f.api.stepUp(OTHER)
    const rejected = expect(command).rejects.toThrow('Operation abandoned')
    f.session.leavePage()
    finish()
    await expect(queued).rejects.toThrow('Stale response')
    await rejected
    expect(f.session.state.value.tenant).toBe(OTHER)
    expect(f.session.state.value.status).toBe('authenticated')
    f.session.clear()
  })
  it('clears authority at expiry without waiting for another request', async () => {
    vi.useFakeTimers()
    const f = fixture()
    try {
      const value = sessionValue()
      value.session.idleExpiresAt = Math.floor(Date.now() / 1000) + 2
      f.replies.push(value)
      await f.session.check(TENANT)
      await vi.advanceTimersByTimeAsync(2000)
      expect(f.session.state.value.status).toBe('anonymous')
      expect(() => f.session.headers()).toThrow()
    } finally {
      f.session.clear()
      vi.useRealTimers()
    }
  })
  it('never invents MFA or accepts unordered, duplicate or unknown facts', () => {
    expect(
      sessionSecurity({ ...securityValue(), authentication: { authTime: 1, acr: 'mfa', amr: [] } })
        .authentication.amr,
    ).toEqual([])
    for (const authentication of [
      { authTime: 0, acr: 'mfa', amr: [] },
      { authTime: 1, acr: 'strong', amr: [] },
      { authTime: 1, acr: 'mfa', amr: ['pwd', 'otp'] },
      { authTime: 1, acr: 'mfa', amr: ['pwd', 'pwd'] },
      { authTime: 1, acr: 'mfa', amr: ['browser-claimed'] },
    ])
      expect(() => sessionSecurity({ ...securityValue(), authentication })).toThrow()
  })
})
