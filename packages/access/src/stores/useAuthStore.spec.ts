import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from './useAuthStore'

// Mock @gocell/request — http is the only thing we need
vi.mock('@gocell/request', () => ({
  http: {
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

import { http } from '@gocell/request'

const mockHttp = http as unknown as {
  post: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

const sessionPayload = {
  accessToken: 'access-tok-1',
  refreshToken: 'refresh-tok-1',
  expiresAt: '2026-06-01T00:00:00Z',
  sessionId: 'sess-1',
  userId: 'user-123',
  passwordResetRequired: false,
}
const tenantToken = 'e30.eyJ0ZW5hbnRfaWQiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDEifQ.sig'

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('starts unauthenticated with null state', () => {
    const store = useAuthStore()
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
    expect(store.accessToken).toBeNull()
    expect(store.tenantId).toBeNull()
    // refreshToken is internal (write-only from outside) — not exposed on store
    expect(store.passwordResetRequired).toBe(false)
  })

  it('setSession sets user, accessToken and passwordResetRequired correctly', () => {
    const store = useAuthStore()
    store.setSession(sessionPayload)

    expect(store.isAuthenticated).toBe(true)
    expect(store.user).toEqual({ id: 'user-123' })
    expect(store.accessToken).toBe('access-tok-1')
    expect(store.tenantId).toBeNull()
    // refreshToken is internal — validated indirectly via refresh() call below
    expect(store.passwordResetRequired).toBe(false)
  })

  it('setSession with passwordResetRequired=true reflects in state', () => {
    const store = useAuthStore()
    store.setSession({ ...sessionPayload, passwordResetRequired: true })
    expect(store.passwordResetRequired).toBe(true)
  })

  it('setSession extracts tenant_id from the access JWT when present', () => {
    const store = useAuthStore()
    store.setSession({ ...sessionPayload, accessToken: tenantToken })
    expect(store.tenantId).toBe('00000000-0000-0000-0000-000000000001')
  })

  it('clearSession resets all state to null/false', () => {
    const store = useAuthStore()
    store.setSession(sessionPayload)
    store.clearSession()

    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
    expect(store.accessToken).toBeNull()
    expect(store.tenantId).toBeNull()
    expect(store.passwordResetRequired).toBe(false)
  })

  it('clearSession resets tenantId to null', () => {
    const store = useAuthStore()
    // Simulate a future session that carries a tenant (BR-009).
    store.tenantId = 'tenant-abc'
    store.clearSession()
    expect(store.tenantId).toBeNull()
  })

  // Security: access token must NEVER touch localStorage
  it('localStorage is always empty after setSession (token not persisted)', () => {
    const store = useAuthStore()
    store.setSession(sessionPayload)
    expect(localStorage.length).toBe(0)
  })

  it('localStorage.setItem is never called', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem')
    const store = useAuthStore()
    store.setSession(sessionPayload)
    store.clearSession()
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('sessionStorage is always empty after setSession (token not persisted)', () => {
    const store = useAuthStore()
    store.setSession(sessionPayload)
    expect(sessionStorage.length).toBe(0)
  })

  describe('refresh()', () => {
    // Every refresh opts the browser into sending/receiving the httpOnly refresh
    // cookie (`__Host-gocell_rt`) and is timeout-bounded so a hung backend cannot
    // block app mount (bootstrapSession awaits refresh() before app.mount()).
    const REFRESH_CONFIG = { withCredentials: true, timeout: 10_000 }

    it('cookie mode: with no in-memory token, posts an empty body and restores the session from the cookie', async () => {
      const store = useAuthStore()
      // Cold start: nothing in memory; the refresh token lives only in the
      // browser's httpOnly cookie, which the backend reads server-side.
      mockHttp.post.mockResolvedValueOnce({ data: { data: sessionPayload } })

      const result = await store.refresh()

      expect(mockHttp.post).toHaveBeenCalledWith(
        '/api/v1/access/sessions/refresh',
        {},
        REFRESH_CONFIG,
      )
      expect(result).toBe('access-tok-1')
      expect(store.isAuthenticated).toBe(true)
      expect(store.accessToken).toBe('access-tok-1')
    })

    it('cookie mode: clears session and returns null when refresh fails (no valid cookie)', async () => {
      const store = useAuthStore()
      mockHttp.post.mockRejectedValueOnce(new Error('401'))

      const result = await store.refresh()

      expect(mockHttp.post).toHaveBeenCalledWith(
        '/api/v1/access/sessions/refresh',
        {},
        REFRESH_CONFIG,
      )
      expect(result).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })

    it('sends the in-memory refresh token as a body fallback and returns the new accessToken on success', async () => {
      const store = useAuthStore()
      store.setSession(sessionPayload)

      const newPayload = {
        ...sessionPayload,
        accessToken: 'access-tok-new',
        refreshToken: 'refresh-tok-new',
      }
      // Axios response shape: res.data = { data: { ...sessionData } }
      mockHttp.post.mockResolvedValueOnce({ data: { data: newPayload } })

      const result = await store.refresh()

      // Validates that the internal refreshToken was correctly stored from setSession
      expect(mockHttp.post).toHaveBeenCalledWith(
        '/api/v1/access/sessions/refresh',
        { refreshToken: 'refresh-tok-1' },
        REFRESH_CONFIG,
      )
      expect(result).toBe('access-tok-new')
      expect(store.accessToken).toBe('access-tok-new')
      // refreshToken is internal; verify it works by doing a second refresh
      mockHttp.post.mockResolvedValueOnce({
        data: { data: { ...newPayload, accessToken: 'access-tok-3' } },
      })
      await store.refresh()
      expect(mockHttp.post).toHaveBeenLastCalledWith(
        '/api/v1/access/sessions/refresh',
        { refreshToken: 'refresh-tok-new' },
        REFRESH_CONFIG,
      )
    })

    it('clearSession and returns null when http.post rejects', async () => {
      const store = useAuthStore()
      store.setSession(sessionPayload)

      mockHttp.post.mockRejectedValueOnce(new Error('network error'))

      const result = await store.refresh()

      expect(result).toBeNull()
      expect(store.isAuthenticated).toBe(false)
      expect(store.user).toBeNull()
      expect(store.accessToken).toBeNull()
    })

    it('localStorage still empty after successful refresh', async () => {
      const store = useAuthStore()
      store.setSession(sessionPayload)
      mockHttp.post.mockResolvedValueOnce({
        data: { data: { ...sessionPayload, accessToken: 'tok-2' } },
      })
      await store.refresh()
      expect(localStorage.length).toBe(0)
    })
  })

  describe('login()', () => {
    const credentials = { username: 'admin', password: 'SecretPass!23' }

    it('posts credentials and stores the session on success', async () => {
      const store = useAuthStore()
      mockHttp.post.mockResolvedValueOnce({ data: { data: sessionPayload } })

      await store.login(credentials)

      expect(store.isAuthenticated).toBe(true)
      expect(store.user).toEqual({ id: 'user-123' })
      expect(store.accessToken).toBe('access-tok-1')
    })

    it('calls the login endpoint with __skipAuthRefresh so a 401 does not refresh', async () => {
      const store = useAuthStore()
      mockHttp.post.mockResolvedValueOnce({ data: { data: sessionPayload } })

      await store.login(credentials)

      expect(mockHttp.post).toHaveBeenCalledWith('/api/v1/access/sessions/login', credentials, {
        __skipAuthRefresh: true,
        withCredentials: true,
      })
    })

    it('propagates passwordResetRequired from the login response', async () => {
      const store = useAuthStore()
      mockHttp.post.mockResolvedValueOnce({
        data: { data: { ...sessionPayload, passwordResetRequired: true } },
      })

      await store.login(credentials)
      expect(store.passwordResetRequired).toBe(true)
    })

    it('rethrows on failure and leaves the store unauthenticated', async () => {
      const store = useAuthStore()
      mockHttp.post.mockRejectedValueOnce(new Error('401'))

      await expect(store.login(credentials)).rejects.toThrow()
      expect(store.isAuthenticated).toBe(false)
      expect(store.user).toBeNull()
    })

    it('never persists the access token to storage', async () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem')
      const store = useAuthStore()
      mockHttp.post.mockResolvedValueOnce({ data: { data: sessionPayload } })
      await store.login(credentials)
      expect(spy).not.toHaveBeenCalled()
      expect(localStorage.length).toBe(0)
      spy.mockRestore()
    })
  })

  describe('logout()', () => {
    it('deletes the current session by id then clears the store', async () => {
      const store = useAuthStore()
      store.setSession(sessionPayload)
      mockHttp.delete.mockResolvedValueOnce({ data: {} })

      await store.logout()

      expect(mockHttp.delete).toHaveBeenCalledWith('/api/v1/access/sessions/sess-1', {
        withCredentials: true,
      })
      expect(store.isAuthenticated).toBe(false)
      expect(store.user).toBeNull()
    })

    it('still clears the store when the DELETE request fails (best-effort)', async () => {
      const store = useAuthStore()
      store.setSession(sessionPayload)
      mockHttp.delete.mockRejectedValueOnce(new Error('network'))

      await store.logout()

      expect(store.isAuthenticated).toBe(false)
      expect(store.accessToken).toBeNull()
    })

    it('is a no-op DELETE when there is no active session', async () => {
      const store = useAuthStore()
      await store.logout()
      expect(mockHttp.delete).not.toHaveBeenCalled()
      expect(store.isAuthenticated).toBe(false)
    })
  })
})
