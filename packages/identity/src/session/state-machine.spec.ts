import { describe, expect, it, vi } from 'vitest'
import type { HttpTransport, NoContentRequest, RequestOptions } from '@rss/api'
import { createIdentitySession, isIdentitySessionError } from './index'

type RecordedRequest = NoContentRequest | RequestOptions<unknown>
type Handler = (request: RecordedRequest) => unknown | Promise<unknown>

const now = 1_800_000_000
const loginWire = {
  data: {
    sessionId: 'session-secret',
    expiresAt: now + 3_600,
    accessToken: 'access-secret-1',
    refreshToken: 'refresh-secret-1',
    accessExpiresAt: now + 60,
  },
}
const profileWire = {
  data: {
    subject: 'opaque-subject',
    tenantId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    kind: 'user',
  },
}

function bearerFrom(request: object): string | undefined {
  return Object.getOwnPropertySymbols(request)
    .map((symbol) => (request as Record<symbol, unknown>)[symbol])
    .find((value): value is string => typeof value === 'string' && value.startsWith('access-'))
}

function fakeTransport(handlers: Record<string, Handler>) {
  const calls: RecordedRequest[] = []
  const transport = {
    request: vi.fn(async (request: RecordedRequest) => {
      calls.push(request)
      const handler = handlers[request.path]
      if (handler === undefined) throw new Error(`unexpected request: ${request.path}`)
      const wire = await handler(request)
      if (request.successStatus === 204) return undefined
      return request.decode(wire)
    }),
  } as unknown as HttpTransport
  return { calls, transport }
}

describe('createIdentitySession state machine', () => {
  it('mints verified authority only after authenticated profile succeeds', async () => {
    const { calls, transport } = fakeTransport({
      '/api/v1/identity/login': () => loginWire,
      '/api/v1/identity/profile': (request) => {
        expect(bearerFrom(request)).toBe('access-secret-1')
        return profileWire
      },
    })
    const operation = new AbortController()
    const session = createIdentitySession({ transport, nowEpochSeconds: () => now })
    const states: string[] = []
    session.subscribe((state) => states.push(state.status))

    const profile = await session.login(
      { username: 'alice', password: 'password-secret' },
      { signal: operation.signal },
    )

    expect(states).toEqual(['authenticating', 'verifying', 'authenticated'])
    expect(profile).toEqual(profileWire.data)
    expect(session.getState()).toEqual({
      status: 'authenticated',
      profile: profileWire.data,
      sessionExpiresAt: now + 3_600,
      accessExpiresAt: now + 60,
    })
    expect(Object.isFrozen(profile)).toBe(true)
    expect(Object.isFrozen(session.getState())).toBe(true)
    const publicText = JSON.stringify({ profile, state: session.getState(), states })
    for (const secret of [
      'password-secret',
      'session-secret',
      'access-secret-1',
      'refresh-secret-1',
    ]) {
      expect(publicText).not.toContain(secret)
    }
    expect(calls.map(({ path }) => path)).toEqual([
      '/api/v1/identity/login',
      '/api/v1/identity/profile',
    ])
  })

  it.each([
    { ...profileWire, data: { ...profileWire.data, subject: '' } },
    { ...profileWire, data: { ...profileWire.data, tenantId: '<redacted>' } },
    {
      ...profileWire,
      data: { ...profileWire.data, tenantId: '00000000-0000-0000-0000-000000000000' },
    },
    { ...profileWire, data: { ...profileWire.data, tenantId: 'NOT-A-UUID' } },
    { ...profileWire, data: { ...profileWire.data, subject: '<redacted>' } },
    { ...profileWire, data: { ...profileWire.data, kind: 'anonymous' } },
  ])('expires and clears candidate secrets when profile is not authoritative', async (profile) => {
    const { transport } = fakeTransport({
      '/api/v1/identity/login': () => loginWire,
      '/api/v1/identity/profile': () => profile,
    })
    const session = createIdentitySession({ transport, nowEpochSeconds: () => now })

    const failure = await session
      .login({ username: 'alice', password: 'password-secret' })
      .catch((error: unknown) => error)

    expect(isIdentitySessionError(failure)).toBe(true)
    expect(failure).toMatchObject({ code: 'PROFILE_NOT_AUTHORITATIVE' })
    expect(session.getState()).toEqual({ status: 'expired' })
    await expect(
      session.transport.request({
        method: 'GET',
        path: '/api/v1/settings/configs/key',
        session: 'required',
        successStatus: 200,
        decode: (value) => value,
      }),
    ).rejects.toMatchObject({ code: 'SESSION_UNAVAILABLE' })
  })

  it.each([
    { sessionId: '' },
    { accessToken: '' },
    { refreshToken: '' },
    { expiresAt: now },
    { accessExpiresAt: now },
    { expiresAt: now + 10, accessExpiresAt: now + 11 },
  ])('rejects an invalid candidate login bundle without retaining it: %o', async (override) => {
    const { transport } = fakeTransport({
      '/api/v1/identity/login': () => ({
        data: { ...loginWire.data, ...override },
      }),
    })
    const session = createIdentitySession({ transport, nowEpochSeconds: () => now })
    await expect(session.login({ username: 'alice', password: 'secret' })).rejects.toMatchObject({
      code: 'SESSION_INVALIDATED',
    })
    expect(session.getState()).toEqual({ status: 'anonymous' })
  })

  it('isolates throwing listeners and supports unsubscribe', async () => {
    const { transport } = fakeTransport({
      '/api/v1/identity/login': () => loginWire,
      '/api/v1/identity/profile': () => profileWire,
      '/api/v1/identity/logout': () => ({ data: { loggedOut: true } }),
    })
    const session = createIdentitySession({ transport, nowEpochSeconds: () => now })
    const listener = vi.fn()
    session.subscribe(() => {
      throw new Error('listener failure')
    })
    const unsubscribe = session.subscribe(listener)
    await session.login({ username: 'alice', password: 'secret' })
    expect(listener).toHaveBeenCalledTimes(3)
    unsubscribe()
    await session.logout()
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('uses the system epoch clock by default', async () => {
    const systemNow = Math.floor(Date.now() / 1_000)
    const { transport } = fakeTransport({
      '/api/v1/identity/login': () => ({
        data: {
          ...loginWire.data,
          expiresAt: systemNow + 3_600,
          accessExpiresAt: systemNow + 60,
        },
      }),
      '/api/v1/identity/profile': () => profileWire,
    })
    await expect(
      createIdentitySession({ transport }).login({ username: 'alice', password: 'secret' }),
    ).resolves.toEqual(profileWire.data)
  })

  it('serves a live protected request and expires at the session deadline without refresh', async () => {
    let currentTime = now
    let protectedCalls = 0
    const { transport } = fakeTransport({
      '/api/v1/identity/login': () => loginWire,
      '/api/v1/identity/profile': () => profileWire,
      '/api/v1/settings/configs/key': () => {
        protectedCalls += 1
        return { ok: true }
      },
    })
    const session = createIdentitySession({ transport, nowEpochSeconds: () => currentTime })
    await session.login({ username: 'alice', password: 'secret' })
    const protectedRequest = () =>
      session.transport.request({
        method: 'GET',
        path: '/api/v1/settings/configs/key',
        session: 'required',
        successStatus: 200,
        decode: (value: unknown) => value,
      })
    await expect(protectedRequest()).resolves.toEqual({ ok: true })
    currentTime = loginWire.data.expiresAt
    await expect(protectedRequest()).rejects.toMatchObject({ code: 'SESSION_UNAVAILABLE' })
    expect(session.getState()).toEqual({ status: 'expired' })
    expect(protectedCalls).toBe(1)
  })

  it('clears locally on anonymous logout and remote logout-all failure', async () => {
    const remoteFailure = new Error('sanitized logout-all failure')
    const { transport } = fakeTransport({
      '/api/v1/identity/login': () => loginWire,
      '/api/v1/identity/profile': () => profileWire,
      '/api/v1/identity/logout-all': () => Promise.reject(remoteFailure),
    })
    const session = createIdentitySession({ transport, nowEpochSeconds: () => now })
    await expect(session.logout()).resolves.toBeUndefined()
    await session.login({ username: 'alice', password: 'secret' })
    const operation = new AbortController()
    await expect(session.logoutAll({ signal: operation.signal })).rejects.toBe(remoteFailure)
    expect(session.getState()).toEqual({ status: 'anonymous' })
  })

  it('does not let a late login completion resurrect a locally cleared session', async () => {
    let resolveLogin!: (value: unknown) => void
    const pendingLogin = new Promise<unknown>((resolve) => {
      resolveLogin = resolve
    })
    const { transport } = fakeTransport({ '/api/v1/identity/login': () => pendingLogin })
    const session = createIdentitySession({ transport, nowEpochSeconds: () => now })
    const login = session.login({ username: 'alice', password: 'secret' })
    await session.logout()
    resolveLogin(loginWire)
    await expect(login).rejects.toMatchObject({ code: 'SESSION_INVALIDATED' })
    expect(session.getState()).toEqual({ status: 'anonymous' })
  })

  it('returns to anonymous after login failure and rejects concurrent login deterministically', async () => {
    let rejectLogin: ((error: Error) => void) | undefined
    const pendingLogin = new Promise<never>((_resolve, reject) => {
      rejectLogin = reject
    })
    const { transport } = fakeTransport({ '/api/v1/identity/login': () => pendingLogin })
    const session = createIdentitySession({ transport, nowEpochSeconds: () => now })

    const first = session.login({ username: 'alice', password: 'secret' })
    await expect(session.login({ username: 'bob', password: 'secret' })).rejects.toMatchObject({
      code: 'SESSION_BUSY',
    })
    rejectLogin?.(new Error('sanitized login failure'))
    await expect(first).rejects.toThrow('sanitized login failure')
    expect(session.getState()).toEqual({ status: 'anonymous' })
  })
})
