import { describe, expect, it, vi } from 'vitest'
import type { HttpTransport, NoContentRequest, RequestOptions } from '@rss/api'
import { decodeWireErrorForTest } from '@rss/api/testing'
import { createIdentitySession } from './index'

type RecordedRequest = NoContentRequest | RequestOptions<unknown>

const NOW = 1_800_000_000
const TENANT = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function unauthenticated() {
  return decodeWireErrorForTest(401, {
    error: {
      code: 'ERR_CORE_UNAUTHENTICATED',
      message: 'not exposed',
      retryable: false,
      details: [],
      requestId: 'request-401',
    },
  })
}

function bearerFrom(request: object): string | undefined {
  return Object.getOwnPropertySymbols(request)
    .map((symbol) => (request as Record<symbol, unknown>)[symbol])
    .find((value): value is string => typeof value === 'string' && value.startsWith('access-'))
}

function decode<T>(request: RecordedRequest, value: unknown): T | void {
  if (request.successStatus === 204) return undefined
  return request.decode(value) as T
}

function sessionRequest(session: ReturnType<typeof createIdentitySession>, path = '/protected') {
  return session.transport.request({
    method: 'GET',
    path,
    session: 'required',
    successStatus: 200,
    decode: (value) => value,
  })
}

async function authenticate(session: ReturnType<typeof createIdentitySession>) {
  await session.login({ username: 'alice', password: 'secret' })
}

describe('Identity session 401 recovery integration', () => {
  it('shares one refresh for concurrent sanitized 401 responses and retries each request once', async () => {
    const rotation = deferred<unknown>()
    const calls: RecordedRequest[] = []
    const transport = {
      request: vi.fn(async (request: RecordedRequest) => {
        calls.push(request)
        switch (request.path) {
          case '/api/v1/identity/login':
            return decode(request, {
              data: {
                sessionId: 'session-1',
                expiresAt: NOW + 3_600,
                accessToken: 'access-old',
                refreshToken: 'refresh-old',
                accessExpiresAt: NOW + 60,
              },
            })
          case '/api/v1/identity/profile':
            return decode(request, { data: { subject: 'subject', tenantId: TENANT, kind: 'user' } })
          case '/api/v1/identity/refresh':
            return decode(request, await rotation.promise)
          default:
            if (bearerFrom(request) === 'access-old') throw unauthenticated()
            return decode(request, { ok: true })
        }
      }),
    } as unknown as HttpTransport
    const session = createIdentitySession({ transport, nowEpochSeconds: () => NOW })
    await authenticate(session)

    const requests = [
      sessionRequest(session, '/protected/a'),
      sessionRequest(session, '/protected/b'),
    ]
    await vi.waitFor(() => {
      expect(calls.filter(({ path }) => path === '/api/v1/identity/refresh')).toHaveLength(1)
      expect(session.getState().status).toBe('refreshing')
    })
    rotation.resolve({
      data: {
        accessToken: 'access-new',
        refreshToken: 'refresh-new',
        accessExpiresAt: NOW + 120,
      },
    })

    await expect(Promise.all(requests)).resolves.toEqual([{ ok: true }, { ok: true }])
    expect(calls.filter(({ path }) => path === '/api/v1/identity/refresh')).toHaveLength(1)
    expect(calls.filter(({ path }) => path.startsWith('/protected/'))).toHaveLength(4)
  })

  it('invalidates the rotated generation after the single retry is also unauthorized', async () => {
    const transport = {
      request: vi.fn(async (request: RecordedRequest) => {
        if (request.path === '/api/v1/identity/login') {
          return decode(request, {
            data: {
              sessionId: 'session-1',
              expiresAt: NOW + 3_600,
              accessToken: 'access-old',
              refreshToken: 'refresh-old',
              accessExpiresAt: NOW + 60,
            },
          })
        }
        if (request.path === '/api/v1/identity/profile') {
          return decode(request, { data: { subject: 'subject', tenantId: TENANT, kind: 'user' } })
        }
        if (request.path === '/api/v1/identity/refresh') {
          return decode(request, {
            data: {
              accessToken: 'access-new',
              refreshToken: 'refresh-new',
              accessExpiresAt: NOW + 120,
            },
          })
        }
        throw unauthenticated()
      }),
    } as unknown as HttpTransport
    const session = createIdentitySession({ transport, nowEpochSeconds: () => NOW })
    await authenticate(session)

    await expect(sessionRequest(session)).rejects.toMatchObject({
      cause: 'wire',
      code: 'ERR_CORE_UNAUTHENTICATED',
    })
    expect(session.getState()).toEqual({ status: 'expired' })
    expect(transport.request).toHaveBeenCalledTimes(5)
  })

  it('retries a late old-generation 401 with the already rotated credential', async () => {
    const late = deferred<void>()
    let refreshCalls = 0
    const transport = {
      request: vi.fn(async (request: RecordedRequest) => {
        if (request.path === '/api/v1/identity/login') {
          return decode(request, {
            data: {
              sessionId: 'session-1',
              expiresAt: NOW + 3_600,
              accessToken: 'access-old',
              refreshToken: 'refresh-old',
              accessExpiresAt: NOW + 60,
            },
          })
        }
        if (request.path === '/api/v1/identity/profile') {
          return decode(request, { data: { subject: 'subject', tenantId: TENANT, kind: 'user' } })
        }
        if (request.path === '/api/v1/identity/refresh') {
          refreshCalls += 1
          return decode(request, {
            data: {
              accessToken: 'access-new',
              refreshToken: 'refresh-new',
              accessExpiresAt: NOW + 120,
            },
          })
        }
        if (request.path === '/protected/late' && bearerFrom(request) === 'access-old') {
          await late.promise
          throw unauthenticated()
        }
        if (bearerFrom(request) === 'access-old') throw unauthenticated()
        return decode(request, { ok: true })
      }),
    } as unknown as HttpTransport
    const session = createIdentitySession({ transport, nowEpochSeconds: () => NOW })
    await authenticate(session)

    const lateRequest = sessionRequest(session, '/protected/late')
    await expect(sessionRequest(session, '/protected/rotate')).resolves.toEqual({ ok: true })
    late.resolve()
    await expect(lateRequest).resolves.toEqual({ ok: true })
    expect(refreshCalls).toBe(1)
  })
})
