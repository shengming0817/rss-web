import { describe, expect, it, vi } from 'vitest'
import type { HttpTransport, NoContentRequest, RequestOptions } from '@rss/api'
import { createIdentitySession } from './index'

type RecordedRequest = NoContentRequest | RequestOptions<unknown>
const now = 1_800_000_000
const subject = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function authenticated() {
  const transport = {
    request: vi.fn(async (request: RecordedRequest) => {
      const value =
        request.path === '/api/v1/identity/login'
          ? {
              data: {
                sessionId: 'session-secret',
                expiresAt: now + 3_600,
                accessToken: 'access-secret',
                refreshToken: 'refresh-secret',
                accessExpiresAt: now + 60,
              },
            }
          : { data: { subject, tenantId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', kind: 'user' } }
      return request.successStatus === 204 ? undefined : request.decode(value)
    }),
  } as unknown as HttpTransport
  const session = createIdentitySession({ transport, nowEpochSeconds: () => now })
  await session.login({ username: 'manager', password: 'secret' })
  return session
}

describe('IdentitySession Account Status invalidation', () => {
  it.each(['suspended', 'locked', 'deactivated'] as const)(
    'atomically invalidates local authority for self %s',
    async (status) => {
      const session = await authenticated()
      const states: string[] = []
      session.subscribe((state) => states.push(state.status))

      expect(session.invalidateForAccountStatusChange(subject, status)).toBe(true)
      expect(session.getState()).toEqual({ status: 'expired' })
      expect(states).toEqual(['expired'])
      await expect(
        session.transport.request({
          method: 'GET',
          path: '/api/v1/settings/configs/key',
          session: 'required',
          successStatus: 200,
          decode: (value) => value,
        }),
      ).rejects.toMatchObject({ code: 'SESSION_UNAVAILABLE' })
    },
  )

  it('keeps authority for active, another user, or invalid input', async () => {
    const session = await authenticated()
    expect(session.invalidateForAccountStatusChange(subject, 'active')).toBe(false)
    expect(
      session.invalidateForAccountStatusChange('9f8c7b6a-5d4e-4321-a987-123456789abc', 'locked'),
    ).toBe(false)
    expect(session.invalidateForAccountStatusChange('not-a-user', 'deactivated')).toBe(false)
    expect(session.getState().status).toBe('authenticated')
  })

  it('aborts an in-flight refresh and fences its late completion for a self change', async () => {
    let currentTime = now
    const rotation = deferred<unknown>()
    let refreshSignal: AbortSignal | undefined
    const transport = {
      request: vi.fn(async (request: RecordedRequest) => {
        let wire: unknown
        if (request.path === '/api/v1/identity/login') {
          wire = {
            data: {
              sessionId: 'session-secret',
              expiresAt: currentTime + 3_600,
              accessToken: 'access-old',
              refreshToken: 'refresh-old',
              accessExpiresAt: currentTime + 1,
            },
          }
        } else if (request.path === '/api/v1/identity/profile') {
          wire = { data: { subject, tenantId: subject, kind: 'user' } }
        } else if (request.path === '/api/v1/identity/refresh') {
          refreshSignal = request.signal
          wire = await rotation.promise
        } else {
          wire = { ok: true }
        }
        return request.successStatus === 204 ? undefined : request.decode(wire)
      }),
    } as unknown as HttpTransport
    const session = createIdentitySession({ transport, nowEpochSeconds: () => currentTime })
    await session.login({ username: 'manager', password: 'secret' })
    currentTime += 2
    const request = session.transport.request({
      method: 'GET',
      path: '/api/v1/settings/configs/key',
      session: 'required',
      successStatus: 200,
      decode: (value) => value,
    })
    await vi.waitFor(() => expect(session.getState().status).toBe('refreshing'))

    expect(session.invalidateForAccountStatusChange(subject, 'locked')).toBe(true)
    expect(refreshSignal?.aborted).toBe(true)
    expect(session.getState()).toEqual({ status: 'expired' })
    rotation.resolve({
      data: {
        accessToken: 'access-new',
        refreshToken: 'refresh-new',
        accessExpiresAt: currentTime + 60,
      },
    })
    await expect(request).rejects.toMatchObject({ code: 'SESSION_INVALIDATED' })
    expect(session.getState()).toEqual({ status: 'expired' })
  })
})
