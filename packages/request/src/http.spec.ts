import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import MockAdapter from 'axios-mock-adapter'
import { http, setupAxios, _resetForTesting } from './http'
import type { SetupAxiosOptions, GoCellRequestError } from './types'

// The real refresh URL used by the backend
const REAL_REFRESH_URL = '/api/v1/access/sessions/refresh'
const REAL_REFRESH_PATH = '/sessions/refresh'

describe('request interceptors', () => {
  let mock: MockAdapter
  let getToken: ReturnType<typeof vi.fn>
  let onRefresh: ReturnType<typeof vi.fn>
  let onAuthFail: ReturnType<typeof vi.fn>

  function buildOpts(overrides?: Partial<SetupAxiosOptions>): SetupAxiosOptions {
    return {
      getToken,
      onRefresh,
      onAuthFail,
      refreshPath: REAL_REFRESH_PATH,
      ...overrides,
    }
  }

  beforeEach(() => {
    // Reset interceptors + internal refresh state before each test
    _resetForTesting()
    mock = new MockAdapter(http)
    getToken = vi.fn()
    onRefresh = vi.fn()
    onAuthFail = vi.fn()
  })

  afterEach(() => {
    mock.restore()
  })

  // ── Request interceptor ──────────────────────────────────────────────────

  describe('request interceptor', () => {
    it('injects Authorization header when getToken returns a token', async () => {
      getToken.mockReturnValue('tok-abc')
      onRefresh.mockResolvedValue(null)
      onAuthFail.mockReturnValue(undefined)
      setupAxios(buildOpts())

      mock.onGet('/api/me').reply((config) => {
        const auth = config.headers?.['Authorization'] as string | undefined
        return [200, { auth }]
      })

      const res = await http.get<{ auth: string }>('/api/me')
      expect(res.data.auth).toBe('Bearer tok-abc')
    })

    it('does not inject Authorization header when getToken returns null', async () => {
      getToken.mockReturnValue(null)
      onRefresh.mockResolvedValue(null)
      onAuthFail.mockReturnValue(undefined)
      setupAxios(buildOpts())

      mock.onGet('/api/me').reply((config) => {
        const auth = config.headers?.['Authorization'] as string | undefined
        return [200, { auth }]
      })

      const res = await http.get<{ auth: string | undefined }>('/api/me')
      expect(res.data.auth).toBeUndefined()
    })
  })

  // ── Single 401 → refresh + replay ───────────────────────────────────────

  describe('single 401 → onRefresh called once + request replayed', () => {
    it('calls onRefresh exactly once and replays with new token', async () => {
      getToken.mockReturnValue('old-token')
      onRefresh.mockResolvedValue('new-token')
      onAuthFail.mockReturnValue(undefined)
      setupAxios(buildOpts())

      // First call returns 401; after replay returns 200
      let callCount = 0
      mock.onGet('/api/me').reply(() => {
        callCount++
        if (callCount === 1) return [401, {}]
        return [200, { ok: true }]
      })

      const res = await http.get<{ ok: boolean }>('/api/me')
      expect(res.data.ok).toBe(true)
      expect(onRefresh).toHaveBeenCalledTimes(1)
      expect(onAuthFail).not.toHaveBeenCalled()
    })
  })

  // ── Concurrent 401s → onRefresh called once ──────────────────────────────

  describe('concurrent 401s → onRefresh called exactly once', () => {
    it('fires 3 requests simultaneously; all succeed with new token; onRefresh called once', async () => {
      getToken.mockReturnValue('old-token')
      onRefresh.mockResolvedValue('new-token')
      onAuthFail.mockReturnValue(undefined)
      setupAxios(buildOpts())

      // All three endpoints return 401 on first hit, then 200
      const callCounts: Record<string, number> = { a: 0, b: 0, c: 0 }
      mock.onGet('/api/a').reply(() => {
        callCounts['a']!++
        if (callCounts['a'] === 1) return [401, {}]
        return [200, { endpoint: 'a' }]
      })
      mock.onGet('/api/b').reply(() => {
        callCounts['b']!++
        if (callCounts['b'] === 1) return [401, {}]
        return [200, { endpoint: 'b' }]
      })
      mock.onGet('/api/c').reply(() => {
        callCounts['c']!++
        if (callCounts['c'] === 1) return [401, {}]
        return [200, { endpoint: 'c' }]
      })

      const [r1, r2, r3] = await Promise.all([
        http.get<{ endpoint: string }>('/api/a'),
        http.get<{ endpoint: string }>('/api/b'),
        http.get<{ endpoint: string }>('/api/c'),
      ])

      expect(r1.data.endpoint).toBe('a')
      expect(r2.data.endpoint).toBe('b')
      expect(r3.data.endpoint).toBe('c')
      expect(onRefresh).toHaveBeenCalledTimes(1)
    })
  })

  // ── onRefresh returns null → onAuthFail called + all requests rejected ───

  describe('onRefresh returns null → onAuthFail called once + reject', () => {
    it('rejects the request and calls onAuthFail when onRefresh returns null', async () => {
      getToken.mockReturnValue('old-token')
      onRefresh.mockResolvedValue(null)
      onAuthFail.mockReturnValue(undefined)
      setupAxios(buildOpts())

      mock.onGet('/api/me').reply(401, {})

      await expect(http.get('/api/me')).rejects.toThrow()
      expect(onRefresh).toHaveBeenCalledTimes(1)
      expect(onAuthFail).toHaveBeenCalledTimes(1)
    })

    it('rejects all concurrent requests when onRefresh returns null', async () => {
      getToken.mockReturnValue('old-token')
      // Delay to allow all 3 to queue up before refresh resolves
      onRefresh.mockImplementation(
        () => new Promise<null>((resolve) => setTimeout(() => resolve(null), 10)),
      )
      onAuthFail.mockReturnValue(undefined)
      setupAxios(buildOpts())

      mock.onGet('/api/a').reply(401, {})
      mock.onGet('/api/b').reply(401, {})
      mock.onGet('/api/c').reply(401, {})

      const results = await Promise.allSettled([
        http.get('/api/a'),
        http.get('/api/b'),
        http.get('/api/c'),
      ])

      for (const r of results) {
        expect(r.status).toBe('rejected')
      }
      expect(onRefresh).toHaveBeenCalledTimes(1)
      // onAuthFail must be called once per rejected caller (all 3 callers each
      // observe token=null and call onAuthFail independently in the new design)
      expect(onAuthFail).toHaveBeenCalledTimes(3)
    })
  })

  // ── __isRetry prevents infinite refresh loop ──────────────────────────────

  describe('__isRetry flag prevents infinite refresh loop', () => {
    it('does not trigger another refresh when replayed request also returns 401', async () => {
      getToken.mockReturnValue('old-token')
      onRefresh.mockResolvedValue('new-token')
      onAuthFail.mockReturnValue(undefined)
      setupAxios(buildOpts())

      // Always returns 401 — the retry will also 401 but must not loop
      mock.onGet('/api/me').reply(401, {})

      await expect(http.get('/api/me')).rejects.toThrow()
      // onRefresh called once; second 401 on retry must not trigger another refresh
      expect(onRefresh).toHaveBeenCalledTimes(1)
    })
  })

  // ── Refresh endpoint itself gets 401 → no recursive refresh ─────────────

  describe('refresh endpoint 401 does not trigger recursive refresh', () => {
    it('rejects immediately without calling onRefresh when refresh endpoint itself 401s', async () => {
      getToken.mockReturnValue('old-token')
      // onRefresh calls the real refresh endpoint which returns 401
      onRefresh.mockImplementation(async () => {
        // The refresh call itself will get 401 from the mock — must not recurse
        await http.post(REAL_REFRESH_URL, {})
        return 'new-token'
      })
      onAuthFail.mockReturnValue(undefined)
      setupAxios(buildOpts({ refreshPath: REAL_REFRESH_PATH }))

      mock.onGet('/api/me').reply(401, {})
      // Refresh endpoint returns 401 — must not trigger another onRefresh call
      mock.onPost(REAL_REFRESH_URL).reply(401, {})

      await expect(http.get('/api/me')).rejects.toThrow()
      // onRefresh is called once; the refresh endpoint 401 must NOT trigger recursion
      expect(onRefresh).toHaveBeenCalledTimes(1)
    })

    it('refreshPath option correctly identifies the refresh endpoint URL', async () => {
      // Integration test: verify that a custom refreshPath prevents recursion
      getToken.mockReturnValue('old-token')
      let refreshCallCount = 0
      onRefresh.mockImplementation(async () => {
        refreshCallCount++
        // Simulate the refresh endpoint itself getting 401
        await http.post(REAL_REFRESH_URL, {}).catch(() => null)
        return null
      })
      onAuthFail.mockReturnValue(undefined)
      setupAxios(buildOpts({ refreshPath: REAL_REFRESH_PATH }))

      mock.onGet('/api/resource').reply(401, {})
      mock.onPost(REAL_REFRESH_URL).reply(401, {})

      await expect(http.get('/api/resource')).rejects.toThrow()

      // onRefresh called exactly once — the refresh endpoint 401 is blocked
      // by isRefreshPath check and does not re-trigger onRefresh
      expect(refreshCallCount).toBe(1)
      expect(onAuthFail).toHaveBeenCalledTimes(1)
    })
  })

  // ── Non-401 errors get i18nKey attached ──────────────────────────────────

  describe('non-401 errors get i18nKey attached', () => {
    it('attaches i18nKey from error.code envelope on 400', async () => {
      getToken.mockReturnValue('tok')
      onRefresh.mockResolvedValue(null)
      onAuthFail.mockReturnValue(undefined)
      setupAxios(buildOpts())

      mock.onGet('/api/me').reply(400, {
        error: { code: 'INVALID_INPUT', message: 'bad', details: [] },
      })

      try {
        await http.get('/api/me')
        expect.fail('should have thrown')
      } catch (err: unknown) {
        expect((err as GoCellRequestError).i18nKey).toBe('errors.INVALID_INPUT')
      }
    })

    it('attaches errors.network when no response (network error)', async () => {
      getToken.mockReturnValue('tok')
      onRefresh.mockResolvedValue(null)
      onAuthFail.mockReturnValue(undefined)
      setupAxios(buildOpts())

      mock.onGet('/api/me').networkError()

      try {
        await http.get('/api/me')
        expect.fail('should have thrown')
      } catch (err: unknown) {
        expect((err as GoCellRequestError).i18nKey).toBe('errors.network')
      }
    })
  })

  // ── setupAxios idempotency ────────────────────────────────────────────────

  describe('setupAxios idempotency', () => {
    it('does not double-install interceptors when called twice', async () => {
      getToken.mockReturnValue('tok')
      onRefresh.mockResolvedValue('new-tok')
      onAuthFail.mockReturnValue(undefined)
      const opts = buildOpts()
      setupAxios(opts)
      setupAxios(opts) // second call must be a no-op

      let callCount = 0
      mock.onGet('/api/me').reply(() => {
        callCount++
        if (callCount === 1) return [401, {}]
        return [200, { ok: true }]
      })

      const res = await http.get<{ ok: boolean }>('/api/me')
      expect(res.data.ok).toBe(true)
      // Must still be exactly 1
      expect(onRefresh).toHaveBeenCalledTimes(1)
    })
  })

  // ── __skipAuthRefresh opts a request out of the refresh machinery ─────────
  // Authentication-establishing calls (login / setup-admin) carry this flag so
  // their credential-verdict 401 surfaces inline instead of triggering a
  // refresh + bounce to /login.

  describe('__skipAuthRefresh flag', () => {
    it('rejects a 401 immediately without calling onRefresh', async () => {
      getToken.mockReturnValue(null)
      onRefresh.mockResolvedValue('new-token')
      onAuthFail.mockReturnValue(undefined)
      setupAxios(buildOpts())

      mock.onPost('/api/v1/access/sessions/login').reply(401, {
        error: { code: 'ERR_AUTH_LOGIN_FAILED', message: 'invalid credentials', details: [] },
      })

      await expect(
        http.post('/api/v1/access/sessions/login', {}, { __skipAuthRefresh: true }),
      ).rejects.toThrow()
      expect(onRefresh).not.toHaveBeenCalled()
    })

    it('attaches i18nKey to the rejected 401 (error envelope still mapped)', async () => {
      getToken.mockReturnValue(null)
      onRefresh.mockResolvedValue('new-token')
      onAuthFail.mockReturnValue(undefined)
      setupAxios(buildOpts())

      mock.onPost('/api/v1/access/sessions/login').reply(401, {
        error: { code: 'ERR_AUTH_LOGIN_FAILED', message: 'invalid credentials', details: [] },
      })

      try {
        await http.post('/api/v1/access/sessions/login', {}, { __skipAuthRefresh: true })
        expect.fail('should have thrown')
      } catch (err: unknown) {
        expect((err as GoCellRequestError).i18nKey).toBe('errors.ERR_AUTH_LOGIN_FAILED')
      }
    })

    it('does not call onAuthFail on a skipped 401', async () => {
      getToken.mockReturnValue(null)
      onRefresh.mockResolvedValue('new-token')
      onAuthFail.mockReturnValue(undefined)
      setupAxios(buildOpts())

      mock.onPost('/api/v1/access/setup/admin').reply(401, {
        error: { code: 'ERR_AUTH_BOOTSTRAP_FAILED', message: 'bootstrap failed', details: [] },
      })

      await expect(
        http.post('/api/v1/access/setup/admin', {}, { __skipAuthRefresh: true }),
      ).rejects.toThrow()
      expect(onAuthFail).not.toHaveBeenCalled()
    })

    it('skips refresh even when a token is present (auth call in an authed tab)', async () => {
      getToken.mockReturnValue('stale-token')
      onRefresh.mockResolvedValue('new-token')
      onAuthFail.mockReturnValue(undefined)
      setupAxios(buildOpts())

      mock.onPost('/api/v1/access/setup/admin').reply(401, {
        error: { code: 'ERR_AUTH_BOOTSTRAP_FAILED', message: 'bootstrap failed', details: [] },
      })

      await expect(
        http.post('/api/v1/access/setup/admin', {}, { __skipAuthRefresh: true }),
      ).rejects.toThrow()
      expect(onRefresh).not.toHaveBeenCalled()
      expect(onAuthFail).not.toHaveBeenCalled()
    })

    it('reverse self-check: a 401 WITHOUT the flag still triggers onRefresh', async () => {
      getToken.mockReturnValue('old-token')
      onRefresh.mockResolvedValue('new-token')
      onAuthFail.mockReturnValue(undefined)
      setupAxios(buildOpts())

      let callCount = 0
      mock.onGet('/api/protected').reply(() => {
        callCount++
        if (callCount === 1) return [401, {}]
        return [200, { ok: true }]
      })

      const res = await http.get<{ ok: boolean }>('/api/protected')
      expect(res.data.ok).toBe(true)
      expect(onRefresh).toHaveBeenCalledTimes(1)
    })

    it('is a no-op for non-401 errors (409 still rejects with i18nKey)', async () => {
      getToken.mockReturnValue(null)
      onRefresh.mockResolvedValue('new-token')
      onAuthFail.mockReturnValue(undefined)
      setupAxios(buildOpts())

      mock.onPost('/api/v1/access/setup/admin').reply(409, {
        error: {
          code: 'ERR_AUTH_ADMIN_ALREADY_EXISTS',
          message: 'username taken',
          details: [],
        },
      })

      try {
        await http.post('/api/v1/access/setup/admin', {}, { __skipAuthRefresh: true })
        expect.fail('should have thrown')
      } catch (err: unknown) {
        expect((err as GoCellRequestError).i18nKey).toBe('errors.ERR_AUTH_ADMIN_ALREADY_EXISTS')
        expect(onRefresh).not.toHaveBeenCalled()
      }
    })
  })
})

// ── error-helper unit tests ──────────────────────────────────────────────────

import { isGoCellRequestError, toI18nKey } from './errors'

describe('isGoCellRequestError', () => {
  it('is true for an axios-shaped error and false otherwise', () => {
    expect(isGoCellRequestError({ isAxiosError: true, i18nKey: 'errors.x' })).toBe(true)
    expect(isGoCellRequestError(new Error('plain'))).toBe(false)
    expect(isGoCellRequestError(null)).toBe(false)
    expect(isGoCellRequestError('boom')).toBe(false)
  })
})

// ── toI18nKey unit tests ────────────────────────────────────────────────────

describe('toI18nKey', () => {
  it.each([
    [
      'error envelope with code',
      (() => {
        const err = new axios.AxiosError('bad request')
        // AxiosError.response is writable — assign directly
        Object.assign(err, {
          response: {
            data: { error: { code: 'NOT_FOUND', message: 'nf', details: [] } },
            status: 404,
            statusText: 'Not Found',
            headers: {},
            config: {},
          },
        })
        return err
      })(),
      'errors.NOT_FOUND',
    ],
    [
      'no error envelope (plain 500 body)',
      (() => {
        const err = new axios.AxiosError('server error')
        Object.assign(err, {
          response: {
            data: { message: 'oops' },
            status: 500,
            statusText: 'Internal Server Error',
            headers: {},
            config: {},
          },
        })
        return err
      })(),
      'errors.unknown',
    ],
    [
      'network error (no response)',
      (() => {
        const err = new axios.AxiosError('network error')
        // response is undefined by default
        return err
      })(),
      'errors.network',
    ],
    ['non-axios error (plain Error)', new Error('something went wrong'), 'errors.unknown'],
    ['null value', null, 'errors.unknown'],
  ] as const)('%s', (_label, err, expected) => {
    expect(toI18nKey(err)).toBe(expected)
  })
})
