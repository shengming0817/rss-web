import { describe, expect, it, vi } from 'vitest'
import type { HttpTransport, NoContentRequest, RequestOptions } from '@rss/api'
import { createIdentitySession } from './index'
import { decodeWireErrorForTest } from '@rss/api/testing'

type RecordedRequest = NoContentRequest | RequestOptions<unknown>
const now = 1_800_000_000

function fixture(passwordResult: unknown = { data: { changed: true } }) {
  const calls: RecordedRequest[] = []
  const transport = {
    request: vi.fn(async (request: RecordedRequest) => {
      calls.push(request)
      const wire = await (request.path === '/api/v1/identity/login'
        ? {
            data: {
              sessionId: 'session-secret',
              expiresAt: now + 3_600,
              accessToken: 'access-secret',
              refreshToken: 'refresh-secret',
              accessExpiresAt: now + 60,
            },
          }
        : request.path === '/api/v1/identity/profile'
          ? {
              data: {
                subject: 'subject',
                tenantId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
                kind: 'user',
              },
            }
          : passwordResult)
      return request.successStatus === 204 ? undefined : request.decode(wire)
    }),
  } as unknown as HttpTransport
  return { calls, transport }
}

async function authenticated(passwordResult?: unknown) {
  const result = fixture(passwordResult)
  const session = createIdentitySession({ transport: result.transport, nowEpochSeconds: () => now })
  await session.login({ username: 'alice', password: 'login-secret' })
  return { ...result, session }
}

describe('IdentitySession password change', () => {
  it('sends the non-idempotent command once and clears authority before resolving', async () => {
    const { calls, session } = await authenticated()
    const states: string[] = []
    session.subscribe((state) => states.push(state.status))

    await expect(
      session.changePassword({
        currentPassword: 'current-secret',
        newPassword: 'replacement-secret',
      }),
    ).resolves.toBeUndefined()

    expect(session.getState()).toEqual({ status: 'anonymous' })
    expect(states).toEqual(['anonymous'])
    expect(calls.filter(({ path }) => path === '/api/v1/identity/password/change')).toHaveLength(1)
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

  it.each([new Error('network result unknown'), { data: { changed: false } }])(
    'expires on an untrusted or commit-unknown result',
    async (result) => {
      const { session } = await authenticated(result)
      await expect(
        session.changePassword({ currentPassword: 'current', newPassword: 'replacement' }),
      ).rejects.toBeDefined()
      expect(session.getState()).toEqual({ status: 'expired' })
    },
  )

  it('invalidates after one exact 401 without refresh or replay', async () => {
    let passwordCalls = 0
    let refreshCalls = 0
    const { transport } = fixture()
    const baseRequest = transport.request.bind(transport)
    transport.request = vi.fn(async (request: RecordedRequest) => {
      if (request.path === '/api/v1/identity/password/change') {
        passwordCalls += 1
        throw decodeWireErrorForTest(401, {
          error: {
            code: 'ERR_CORE_UNAUTHENTICATED',
            message: 'unauthenticated',
            retryable: false,
            details: [],
            requestId: 'password-expired',
          },
        })
      }
      if (request.path === '/api/v1/identity/refresh') refreshCalls += 1
      return (baseRequest as (value: RecordedRequest) => Promise<unknown>)(request)
    }) as typeof transport.request
    const session = createIdentitySession({ transport, nowEpochSeconds: () => now })
    await session.login({ username: 'alice', password: 'login-secret' })

    await expect(
      session.changePassword({ currentPassword: 'current', newPassword: 'replacement' }),
    ).rejects.toMatchObject({ status: 401, code: 'ERR_CORE_UNAUTHENTICATED' })
    expect(passwordCalls).toBe(1)
    expect(refreshCalls).toBe(0)
    expect(session.getState()).toEqual({ status: 'expired' })
  })

  it('rejects a concurrent submission before a second request is sent', async () => {
    let resolve!: (value: unknown) => void
    const pending = new Promise<unknown>((resolvePromise) => {
      resolve = resolvePromise
    })
    const { session, calls } = await authenticated(pending)
    const first = session.changePassword({ currentPassword: 'one', newPassword: 'two' })
    await expect(
      session.changePassword({ currentPassword: 'three', newPassword: 'four' }),
    ).rejects.toMatchObject({ code: 'SESSION_BUSY' })
    expect(calls.filter(({ path }) => path === '/api/v1/identity/password/change')).toHaveLength(1)
    resolve({ data: { changed: true } })
    await first
  })
})
