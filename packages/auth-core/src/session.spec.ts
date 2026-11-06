import { afterEach, expect, it, vi } from 'vitest'
import { createSession } from './session'
import type { AuthPort, SessionEnvelope } from './model'

const tenant = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const principal = '33333333-3333-4333-8333-333333333333'
const sessionId = '44444444-4444-4444-8444-444444444444'
const owners: ReturnType<typeof createSession>[] = []
afterEach(() => {
  owners.splice(0).forEach((owner) => owner.dispose())
  vi.useRealTimers()
})
function envelope(token = 'a'): SessionEnvelope {
  const issuedAt = Math.floor(Date.now() / 1000)
  return {
    session: {
      id: sessionId,
      issuedAt,
      idleExpiresAt: issuedAt + 600,
      absoluteExpiresAt: issuedAt + 3600,
    },
    identity: { principalId: principal, hasLocalPassword: true },
    csrfToken: token.repeat(64),
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function fixture() {
  const port: AuthPort = {
    check: vi.fn(async () => envelope()),
    login: vi.fn(async () => envelope()),
    refresh: vi.fn(async () => envelope('b')),
    reauthenticate: vi.fn(async () => envelope('c')),
    logout: vi.fn(async () => undefined),
    context: vi.fn(async (id) => ({
      tenantId: id,
      principalId: principal,
      sessionId,
      navigation: { manageAccounts: true, manageProviders: false },
    })),
    security: vi.fn(async () => ({
      sessionId,
      authentication: {
        source: 'local_password' as const,
        authTime: null,
        acr: 'unspecified' as const,
        amr: [],
      },
      eligibleStepUpProviders: [],
    })),
    providers: vi.fn(async () => []),
    beginSso: vi.fn(async () => 'https://idp.example/authorize'),
    stepUp: vi.fn(async () => 'https://idp.example/authorize'),
    link: vi.fn(async () => 'https://idp.example/link'),
    sessions: vi.fn(async () => ({ sessions: [], next: null })),
    classify: (error) =>
      error === '401'
        ? 'unauthenticated'
        : error === '403'
          ? 'rejected'
          : error === '429'
            ? 'rate_limited'
            : error === 'protocol'
              ? 'protocol'
              : 'unavailable',
  }
  const owner = createSession(port, { oidcEnabled: true })
  owners.push(owner)
  return { owner, port }
}
it('drains business writes before rotation, coalesces refresh, and signs logout with the rotated CSRF', async () => {
  const { owner, port } = fixture()
  await owner.check(tenant)
  const write = deferred<void>()
  const started = deferred<void>()
  const request = owner.business(() => {
    started.resolve()
    return write.promise
  })
  await started.promise
  const refresh = owner.refresh()
  expect(owner.refresh()).toBe(refresh)
  const logout = owner.logout()
  await Promise.resolve()
  expect(port.refresh).not.toHaveBeenCalled()
  write.resolve()
  await request
  await refresh
  await logout
  expect(port.logout).toHaveBeenCalledWith(tenant, 'b'.repeat(64), false)
  expect(owner.getSnapshot().status).toBe('anonymous')
})
it('rejects late responses and queued controls after tenant changes', async () => {
  const { owner, port } = fixture()
  await owner.check(tenant)
  const response = deferred<string>()
  const result = owner.business(() => response.promise).catch((error: unknown) => error)
  const refresh = owner.refresh().catch((error: unknown) => error)
  const switched = owner.switchTenant(other)
  response.resolve('old tenant data')
  expect(await result).toBeInstanceOf(Error)
  expect(await refresh).toBeInstanceOf(Error)
  await switched
  expect(port.refresh).not.toHaveBeenCalled()
  expect(owner.getSnapshot().host?.tenantId).toBe(other)
})
it('accepts dispatched rotation across page cancellation while discarding page business results', async () => {
  const { owner, port } = fixture()
  await owner.check(tenant)
  const response = deferred<SessionEnvelope>()
  vi.mocked(port.refresh).mockReturnValue(response.promise)
  const refresh = owner.refresh()
  await vi.waitFor(() => expect(port.refresh).toHaveBeenCalled())
  owner.leavePage()
  response.resolve(envelope('d'))
  await refresh
  await owner.business(async ({ csrf }) => expect(csrf).toBe('d'.repeat(64)))
})
it('expires all identity and host facts and rejects a late response', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-29T00:00:00Z'))
  const { owner } = fixture()
  await owner.check(tenant)
  const response = deferred<void>()
  const result = owner.business(() => response.promise).catch((error: unknown) => error)
  await vi.advanceTimersByTimeAsync(600_000)
  expect(owner.getSnapshot()).toMatchObject({
    status: 'anonymous',
    identity: null,
    session: null,
    host: null,
    invalidated: true,
  })
  response.resolve()
  expect(await result).toBeInstanceOf(Error)
})
it('suspends authority during page caching and restores it without permanently disposing the owner', async () => {
  const { owner } = fixture()
  await owner.check(tenant)
  owner.suspend()
  expect(owner.getSnapshot()).toMatchObject({
    status: 'checking',
    session: null,
    identity: null,
    host: null,
  })
  await owner.check(tenant)
  await owner.business(async ({ tenant: current }) => expect(current).toBe(tenant))
})
it('does not replay a rejected write or a reauthentication-required response', async () => {
  const { owner } = fixture()
  await owner.check(tenant)
  const write = vi.fn(async () => {
    throw '403'
  })
  await expect(owner.business(write)).rejects.toBe('403')
  await owner.reauthenticate('private password')
  expect(write).toHaveBeenCalledTimes(1)
  expect(owner.getSnapshot().status).toBe('authenticated')
})
it('distinguishes an anonymous visit and rejected login from expiration of a known session', async () => {
  const { owner, port } = fixture()
  vi.mocked(port.check).mockRejectedValueOnce('401')
  await owner.check(tenant)
  expect(owner.getSnapshot()).toMatchObject({ status: 'anonymous', invalidated: false })
  vi.mocked(port.login).mockRejectedValueOnce('401')
  await expect(owner.login(tenant, 'member', 'incorrect password')).rejects.toBe('401')
  expect(owner.getSnapshot()).toMatchObject({ status: 'anonymous', invalidated: false })
  await owner.check(tenant)
  vi.mocked(port.check).mockRejectedValueOnce('401')
  await owner.check(tenant)
  expect(owner.getSnapshot()).toMatchObject({ status: 'anonymous', invalidated: true })
})
it('clears authority after unknown rotation and marks unknown logout explicitly', async () => {
  const { owner, port } = fixture()
  await owner.check(tenant)
  vi.mocked(port.refresh).mockRejectedValue('network')
  await expect(owner.refresh()).rejects.toBe('network')
  expect(owner.getSnapshot().status).toBe('unavailable')
  await owner.check(tenant)
  vi.mocked(port.logout).mockRejectedValue('network')
  await expect(owner.logout()).rejects.toBe('network')
  expect(owner.getSnapshot()).toMatchObject({
    status: 'anonymous',
    logoutOutcome: 'unconfirmed',
    identity: null,
  })
})
it('rejects a host context from a different subject and never accepts its navigation hints', async () => {
  const { owner, port } = fixture()
  vi.mocked(port.context).mockResolvedValue({
    tenantId: other,
    principalId: principal,
    sessionId,
    navigation: { manageAccounts: true, manageProviders: true },
  })
  await expect(owner.check(tenant)).rejects.toThrow('Mismatched')
  expect(owner.getSnapshot()).toMatchObject({ status: 'unavailable', host: null, identity: null })
})
it('passes the concrete step-up purpose and rejects a redirect after leaving the page', async () => {
  const { owner, port } = fixture()
  await owner.check(tenant)
  const redirect = deferred<string>()
  vi.mocked(port.stepUp).mockReturnValue(redirect.promise)
  const request = owner
    .stepUp(other, { kind: 'remove', credential: sessionId })
    .catch((error: unknown) => error)
  await vi.waitFor(() => expect(port.stepUp).toHaveBeenCalledTimes(1))
  expect(port.stepUp).toHaveBeenCalledWith(tenant, 'a'.repeat(64), other, {
    kind: 'remove',
    credential: sessionId,
  })
  owner.leavePage()
  redirect.resolve('https://idp.example/authorize')
  expect(await request).toBeInstanceOf(Error)
})

it('preserves same-tenant authority and expiry after a rate limited login', async () => {
  const { owner, port } = fixture()
  await owner.check(tenant)
  const before = owner.getSnapshot()
  vi.mocked(port.login).mockRejectedValue('429')
  await expect(owner.login(tenant, 'member', 'password')).rejects.toBe('429')
  expect(owner.getSnapshot()).toEqual(before)
  await owner.business(async ({ csrf }) => expect(csrf).toBe('a'.repeat(64)))
  await expect(owner.login(other, 'member', 'password')).rejects.toBe('429')
  expect(owner.getSnapshot()).toMatchObject({ status: 'anonymous', identity: null })
})
it('degrades transient navigation failures but rejects malformed context', async () => {
  const { owner, port } = fixture()
  vi.mocked(port.context).mockRejectedValueOnce('network')
  await owner.check(tenant)
  expect(owner.getSnapshot()).toMatchObject({
    status: 'authenticated',
    host: null,
    navigation: 'unavailable',
  })
  await owner.business(async ({ csrf }) => expect(csrf).toBe('a'.repeat(64)))
  vi.mocked(port.context).mockRejectedValueOnce('protocol')
  await expect(owner.loadContext()).rejects.toBe('protocol')
  expect(owner.getSnapshot()).toMatchObject({ status: 'unavailable', identity: null })
})
it('retains unknown logout across failed session reads and visibility restoration', async () => {
  const { owner, port } = fixture()
  await owner.check(tenant)
  vi.mocked(port.logout).mockRejectedValue('network')
  await expect(owner.logout(true)).rejects.toBe('network')
  vi.mocked(port.check).mockRejectedValueOnce('401')
  await owner.check(tenant)
  expect(owner.getSnapshot().logoutOutcome).toBe('unconfirmed')
  await owner.check(tenant)
  expect(owner.getSnapshot().logoutOutcome).toBe('unconfirmed')
})
it('queues identity linking after rotation and uses its new CSRF without replay', async () => {
  const { owner, port } = fixture()
  await owner.check(tenant)
  const result = deferred<SessionEnvelope>()
  vi.mocked(port.refresh).mockReturnValue(result.promise)
  const refresh = owner.refresh()
  await vi.waitFor(() => expect(port.refresh).toHaveBeenCalled())
  const link = owner.link(other, null)
  result.resolve(envelope('b'))
  await refresh
  expect(await link).toBe('https://idp.example/link')
  expect(port.link).toHaveBeenCalledExactlyOnceWith(tenant, 'b'.repeat(64), other, null)
})

it('preserves an unconfirmed exit when page caching abandons a dispatched logout', async () => {
  const { owner, port } = fixture()
  await owner.check(tenant)
  const exit = deferred<void>()
  vi.mocked(port.logout).mockReturnValue(exit.promise)
  const logout = owner.logout().catch((error: unknown) => error)
  await vi.waitFor(() => expect(port.logout).toHaveBeenCalled())
  owner.suspend()
  expect(owner.getSnapshot().logoutOutcome).toBe('unconfirmed')
  exit.resolve()
  expect(await logout).toBeInstanceOf(Error)
  await owner.check(tenant)
  expect(owner.getSnapshot().logoutOutcome).toBe('unconfirmed')
  await owner.switchTenant(other)
  expect(owner.getSnapshot().logoutOutcome).toBe('idle')
})
