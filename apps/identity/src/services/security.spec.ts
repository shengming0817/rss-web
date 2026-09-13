import { describe, expect, it, vi } from 'vitest'
import { decodeIdentityError } from '@rss/api/identity'
import { fixture, securityValue, sessionValue, TENANT, OTHER } from '../../tests/support'
import { sessionSecurity, operationReply } from './decode'
describe('current session security', () => {
  it('coalesces reads, binds facts to the session and invalidates on renewal', async () => {
    const f = fixture()
    await f.login()
    expect(f.request).toHaveBeenCalledTimes(1)
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
    f.replies.push({ ...securityValue(), session_id: OTHER })
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
      value.session.idle_expires_at = Math.floor(Date.now() / 1000) + 2
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
      sessionSecurity({ ...securityValue(), authentication: { auth_time: 1, acr: 'mfa', amr: [] } })
        .authentication.amr,
    ).toEqual([])
    for (const authentication of [
      { auth_time: 0, acr: 'mfa', amr: [] },
      { auth_time: 1, acr: 'strong', amr: [] },
      { auth_time: 1, acr: 'mfa', amr: ['pwd', 'otp'] },
      { auth_time: 1, acr: 'mfa', amr: ['pwd', 'pwd'] },
      { auth_time: 1, acr: 'mfa', amr: ['browser-claimed'] },
    ])
      expect(() => sessionSecurity({ ...securityValue(), authentication })).toThrow()
  })
})
describe('platform operation protocol', () => {
  const input = {
    tenant_id: OTHER,
    name: 'New tenant',
    administrator: {
      operation_id: TENANT,
      principal_id: OTHER,
      login: 'first-admin',
      password: 'private fixture password',
    },
  }
  const receipt = {
    operation: {
      operation_id: TENANT,
      kind: 'tenant_created',
      tenant_id: OTHER,
      principal_id: OTHER,
      created_at: 1,
    },
    active: true,
  }
  it('distinguishes committed activation states and correlates receipts', async () => {
    const f = fixture()
    await f.login()
    f.replies.push(receipt)
    expect((await f.api.createTenant(input)).active).toBe(true)
    f.replies.push({ ...receipt, active: false })
    expect((await f.api.createTenant(input)).active).toBe(false)
    expect(() => operationReply(receipt, 202)).toThrow()
    expect(() => operationReply({ ...receipt, active: false }, 201)).toThrow()
    expect(() => operationReply(receipt, 204)).toThrow()
    f.replies.push({ ...receipt, operation: { ...receipt.operation, operation_id: OTHER } })
    await expect(f.api.createTenant(input)).rejects.toThrow()
    expect(f.session.state.value.status).toBe('unavailable')
  })
  it('does not replay unknown creation or mistake an unobserved receipt for rollback', async () => {
    const f = fixture()
    await f.login()
    f.replies.push(decodeIdentityError(503, { code: 'operation_outcome_unknown' }, false))
    await expect(f.api.createTenant(input)).rejects.toMatchObject({
      code: 'operation_outcome_unknown',
    })
    expect(
      f.request.mock.calls.filter(
        ([o]) => o.method === 'POST' && o.path === '/api/v1/platform/tenants',
      ),
    ).toHaveLength(1)
    await f.login()
    f.replies.push(decodeIdentityError(404, { code: 'operation_not_observed' }, false))
    await expect(f.api.tenantOperation(TENANT)).rejects.toMatchObject({
      code: 'operation_not_observed',
    })
    expect(f.request.mock.calls.at(-1)?.[0].method).toBe('GET')
    f.session.clear()
  })
})
