import { describe, expect, it, vi } from 'vitest'
import type { HttpTransport, NoContentRequest, RequestOptions } from '@rss/api'
import { createIdentitySession } from './index'

type RecordedRequest = NoContentRequest | RequestOptions<unknown>

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function bearerFrom(request: object): string | undefined {
  return Object.getOwnPropertySymbols(request)
    .map((symbol) => (request as Record<symbol, unknown>)[symbol])
    .find((value): value is string => typeof value === 'string' && value.startsWith('access-'))
}

describe('Identity refresh single-flight', () => {
  it('shares one rotation across concurrent expired-access requests', async () => {
    let currentTime = 1_800_000_000
    const rotation = deferred<unknown>()
    const calls: RecordedRequest[] = []
    const transport = {
      request: vi.fn(async (request: RecordedRequest) => {
        calls.push(request)
        const wire = await (() => {
          switch (request.path) {
            case '/api/v1/identity/login':
              return {
                data: {
                  sessionId: 'session-1',
                  expiresAt: currentTime + 3_600,
                  accessToken: 'access-old',
                  refreshToken: 'refresh-old',
                  accessExpiresAt: currentTime + 1,
                },
              }
            case '/api/v1/identity/profile':
              return {
                data: {
                  subject: 'subject',
                  tenantId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
                  kind: 'user',
                },
              }
            case '/api/v1/identity/refresh':
              return rotation.promise
            case '/api/v1/settings/configs/key':
              expect(bearerFrom(request)).toBe('access-new')
              return { ok: true }
            default:
              throw new Error(`unexpected ${request.path}`)
          }
        })()
        const response = await wire
        if (request.successStatus === 204) return undefined
        return request.decode(response)
      }),
    } as unknown as HttpTransport
    const session = createIdentitySession({ transport, nowEpochSeconds: () => currentTime })
    await session.login({ username: 'alice', password: 'secret' })
    currentTime += 2

    const requests = Array.from({ length: 4 }, () =>
      session.transport.request({
        method: 'GET',
        path: '/api/v1/settings/configs/key',
        session: 'required',
        successStatus: 200,
        decode: (value) => value,
      }),
    )
    await vi.waitFor(() => {
      expect(calls.filter(({ path }) => path === '/api/v1/identity/refresh')).toHaveLength(1)
      expect(session.getState().status).toBe('refreshing')
    })
    rotation.resolve({
      data: {
        accessToken: 'access-new',
        refreshToken: 'refresh-new',
        accessExpiresAt: currentTime + 60,
      },
    })

    await expect(Promise.all(requests)).resolves.toEqual(Array(4).fill({ ok: true }))
    expect(calls.filter(({ path }) => path === '/api/v1/identity/refresh')).toHaveLength(1)
    expect(session.getState()).toMatchObject({
      status: 'authenticated',
      accessExpiresAt: currentTime + 60,
    })
  })

  it('expires without using either partial rotation token when rotation is invalid', async () => {
    let currentTime = 1_800_000_000
    const usedBearers: Array<string | undefined> = []
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
          wire = {
            data: {
              accessToken: 'access-new',
              refreshToken: 'refresh-old',
              accessExpiresAt: currentTime + 60,
            },
          }
        } else {
          usedBearers.push(bearerFrom(request))
          wire = { ok: true }
        }
        if (request.successStatus === 204) return undefined
        return request.decode(wire)
      }),
    } as unknown as HttpTransport
    const session = createIdentitySession({ transport, nowEpochSeconds: () => currentTime })
    await session.login({ username: 'alice', password: 'secret' })
    currentTime += 2

    await expect(
      session.transport.request({
        method: 'GET',
        path: '/api/v1/settings/configs/key',
        session: 'required',
        successStatus: 200,
        decode: (value) => value,
      }),
    ).rejects.toMatchObject({ code: 'SESSION_INVALIDATED' })
    expect(session.getState()).toEqual({ status: 'expired' })
    expect(usedBearers).toEqual([])
  })
})
