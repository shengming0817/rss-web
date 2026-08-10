import { describe, expect, it, vi } from 'vitest'
import type { HttpTransport, NoContentRequest, RequestOptions } from '@rss/api'
import { createIdentitySession } from './index'

type RecordedRequest = NoContentRequest | RequestOptions<unknown>

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('Identity session cancellation', () => {
  it('cancels one waiter without cancelling the shared refresh', async () => {
    let currentTime = 1_800_000_000
    const rotation = deferred<unknown>()
    let refreshSignal: AbortSignal | undefined
    let protectedCalls = 0
    const transport = {
      request: vi.fn(async (request: RecordedRequest) => {
        let wire: unknown
        if (request.path === '/api/v1/identity/login') {
          wire = {
            data: {
              sessionId: 'session-1',
              expiresAt: currentTime + 3_600,
              accessToken: 'access-old',
              refreshToken: 'refresh-old',
              accessExpiresAt: currentTime + 1,
            },
          }
        } else if (request.path === '/api/v1/identity/profile') {
          wire = {
            data: {
              subject: 'subject',
              tenantId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
              kind: 'user',
            },
          }
        } else if (request.path === '/api/v1/identity/refresh') {
          refreshSignal = request.signal
          wire = rotation.promise
        } else {
          protectedCalls += 1
          wire = { ok: true }
        }
        const response = await wire
        if (request.successStatus === 204) return undefined
        return request.decode(response)
      }),
    } as unknown as HttpTransport
    const session = createIdentitySession({ transport, nowEpochSeconds: () => currentTime })
    await session.login({ username: 'alice', password: 'secret' })
    currentTime += 2
    const cancelled = new AbortController()
    const request = (signal?: AbortSignal) =>
      session.transport.request({
        method: 'GET',
        path: '/api/v1/settings/configs/key',
        session: 'required',
        ...(signal === undefined ? {} : { signal }),
        successStatus: 200,
        decode: (value: unknown) => value,
      })

    const first = request(cancelled.signal)
    const second = request()
    await vi.waitFor(() => expect(refreshSignal).toBeDefined())
    cancelled.abort()
    await expect(first).rejects.toMatchObject({ code: 'SESSION_OPERATION_ABORTED' })
    expect(refreshSignal?.aborted).toBe(false)
    rotation.resolve({
      data: {
        accessToken: 'access-new',
        refreshToken: 'refresh-new',
        accessExpiresAt: currentTime + 60,
      },
    })
    await expect(second).resolves.toEqual({ ok: true })
    expect(protectedCalls).toBe(1)
  })

  it('clears locally before logout completes and late refresh cannot resurrect state', async () => {
    let currentTime = 1_800_000_000
    const rotation = deferred<unknown>()
    const logout = deferred<unknown>()
    let refreshSignal: AbortSignal | undefined
    const transport = {
      request: vi.fn(async (request: RecordedRequest) => {
        let wire: unknown
        if (request.path === '/api/v1/identity/login') {
          wire = {
            data: {
              sessionId: 'session-1',
              expiresAt: currentTime + 3_600,
              accessToken: 'access-old',
              refreshToken: 'refresh-old',
              accessExpiresAt: currentTime + 1,
            },
          }
        } else if (request.path === '/api/v1/identity/profile') {
          wire = {
            data: {
              subject: 'subject',
              tenantId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
              kind: 'user',
            },
          }
        } else if (request.path === '/api/v1/identity/refresh') {
          refreshSignal = request.signal
          wire = rotation.promise
        } else if (request.path === '/api/v1/identity/logout') {
          wire = logout.promise
        } else {
          wire = { ok: true }
        }
        const response = await wire
        if (request.successStatus === 204) return undefined
        return request.decode(response)
      }),
    } as unknown as HttpTransport
    const session = createIdentitySession({ transport, nowEpochSeconds: () => currentTime })
    await session.login({ username: 'alice', password: 'secret' })
    currentTime += 2
    void session.transport
      .request({
        method: 'GET',
        path: '/api/v1/settings/configs/key',
        session: 'required',
        successStatus: 200,
        decode: (value) => value,
      })
      .catch(() => undefined)
    await vi.waitFor(() => expect(refreshSignal).toBeDefined())

    const loggingOut = session.logout()
    expect(session.getState()).toEqual({ status: 'anonymous' })
    expect(refreshSignal?.aborted).toBe(true)
    rotation.resolve({
      data: {
        accessToken: 'access-new',
        refreshToken: 'refresh-new',
        accessExpiresAt: currentTime + 60,
      },
    })
    logout.resolve({ data: { loggedOut: true } })
    await loggingOut
    expect(session.getState()).toEqual({ status: 'anonymous' })
  })
})
