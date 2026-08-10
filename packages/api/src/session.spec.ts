import { describe, expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from './types'
import { decodeWireError } from './wire-error'
import {
  createCredentialHttpTransport,
  createSessionHttpTransport,
  type SessionCredential,
  type SessionTransportHooks,
} from './session'

const request: RequestOptions<{ ok: true }> = {
  method: 'GET',
  path: '/api/v1/settings/configs/key',
  session: 'required',
  successStatus: 200,
  decode: () => ({ ok: true }),
}

const wire401 = (code = 'ERR_CORE_UNAUTHENTICATED') =>
  decodeWireError(401, {
    error: { code, message: 'not exposed', retryable: false, details: [], requestId: 'request-1' },
  })

function bearerFrom(options: object): string | undefined {
  return Object.getOwnPropertySymbols(options)
    .map((symbol) => (options as Record<symbol, unknown>)[symbol])
    .find((value): value is string => typeof value === 'string' && value.startsWith('access-'))
}

function credential(bearer: string, generation: number): SessionCredential {
  return { bearer, generation, lifecycleSignal: new AbortController().signal }
}

function hooks(overrides: Partial<SessionTransportHooks> = {}): SessionTransportHooks {
  return {
    authorize: vi.fn(() => Promise.resolve(credential('access-old', 1))),
    recover: vi.fn(() => Promise.resolve(credential('access-new', 2))),
    invalidate: vi.fn(),
    ...overrides,
  }
}

describe('createSessionHttpTransport', () => {
  it('supports a one-shot protected credential without recovery behavior', async () => {
    const failure = wire401()
    const calls: object[] = []
    const delegate = {
      request: vi.fn((options: object) => {
        calls.push(options)
        return Promise.reject(failure)
      }),
    } as unknown as HttpTransport

    await expect(
      createCredentialHttpTransport(delegate, credential('access-once', 1)).request(request),
    ).rejects.toBe(failure)
    expect(calls.map(bearerFrom)).toEqual(['access-once'])
    expect(delegate.request).toHaveBeenCalledOnce()
  })

  it('passes public requests through without asking for credentials', async () => {
    const delegate = {
      request: vi.fn(() => Promise.resolve({ ok: true })),
    } as unknown as HttpTransport
    const sessionHooks = hooks()
    const transport = createSessionHttpTransport(delegate, sessionHooks)

    await transport.request({
      method: 'GET',
      path: '/api/v1/settings/configs/key',
      successStatus: 200,
      decode: () => ({ ok: true }),
    })

    expect(sessionHooks.authorize).not.toHaveBeenCalled()
    expect(delegate.request).toHaveBeenCalledOnce()
  })

  it('injects a capability-owned bearer and retries an exact safe 401 once', async () => {
    const calls: object[] = []
    const delegate = {
      request: vi.fn((options: object) => {
        calls.push(options)
        return calls.length === 1 ? Promise.reject(wire401()) : Promise.resolve({ ok: true })
      }),
    } as unknown as HttpTransport
    const sessionHooks = hooks()

    await expect(
      createSessionHttpTransport(delegate, sessionHooks).request(request),
    ).resolves.toEqual({
      ok: true,
    })

    expect(calls.map(bearerFrom)).toEqual(['access-old', 'access-new'])
    expect(sessionHooks.recover).toHaveBeenCalledWith(1, undefined)
    expect(delegate.request).toHaveBeenCalledTimes(2)
    expect(sessionHooks.invalidate).not.toHaveBeenCalled()
  })

  it('does not recover malformed, unknown-code, forbidden or network failures', async () => {
    for (const failure of [
      wire401('ERR_OTHER_UNAUTHENTICATED'),
      decodeWireError(401, { malformed: true }),
      decodeWireError(403, {
        error: {
          code: 'ERR_CORE_FORBIDDEN',
          message: 'not exposed',
          retryable: false,
          details: [],
          requestId: 'request-2',
        },
      }),
      new Error('network'),
    ]) {
      const delegate = { request: vi.fn(() => Promise.reject(failure)) } as unknown as HttpTransport
      const sessionHooks = hooks()
      await expect(
        createSessionHttpTransport(delegate, sessionHooks).request(request),
      ).rejects.toBe(failure)
      expect(sessionHooks.recover).not.toHaveBeenCalled()
      expect(delegate.request).toHaveBeenCalledOnce()
    }
  })

  it('invalidates after a retried request receives another exact 401', async () => {
    const delegate = { request: vi.fn(() => Promise.reject(wire401())) } as unknown as HttpTransport
    const sessionHooks = hooks()

    await expect(
      createSessionHttpTransport(delegate, sessionHooks).request(request),
    ).rejects.toMatchObject({
      status: 401,
    })

    expect(delegate.request).toHaveBeenCalledTimes(2)
    expect(sessionHooks.invalidate).toHaveBeenCalledWith(2)
  })
})
