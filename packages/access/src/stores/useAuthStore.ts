import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { http } from '@gocell/request'
import type {
  HttpAuthLoginV1Request,
  HttpAuthLoginV1Response,
  HttpAuthRefreshV1Request,
  HttpAuthRefreshV1Response,
} from '@gocell/contracts'

/**
 * Session view-model (not a wire contract).
 * accessToken lives only in Pinia state — never written to
 * localStorage or sessionStorage (security iron rule §7.1).
 */
export interface AuthUser {
  id: string
}

/** Payload shape derived from the refresh response contract */
type SessionData = HttpAuthRefreshV1Response['data']

const LOGIN_URL = '/api/v1/access/sessions/login'
const REFRESH_URL = '/api/v1/access/sessions/refresh'
/** DELETE /sessions/{id} — logout revokes the current session server-side. */
const SESSION_URL = '/api/v1/access/sessions/'

/**
 * Cap the silent refresh so an unresponsive backend cannot block app mount
 * forever — apps/web bootstrapSession() awaits refresh() before app.mount().
 */
const REFRESH_TIMEOUT_MS = 10_000

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return null
  }
}

function extractTenantId(token: string): string | null {
  const tenantId = decodeJwtPayload(token)?.['tenant_id']
  return typeof tenantId === 'string' && tenantId.trim() ? tenantId : null
}

export const useAuthStore = defineStore('access.auth', () => {
  // ─── state (all in-memory, never persisted) ───────────────────────────────
  const user = ref<AuthUser | null>(null)
  const accessToken = ref<string | null>(null)
  // Tenant the session belongs to — needed by tenant-scoped mutations (e.g.
  // accesscore role assign/revoke). Populated from the access token's `tenant_id`
  // claim in setSession (extractTenantId); stays null when the claim is absent so
  // consumers guard the null case rather than send a fabricated tenant (BR-009).
  const tenantId = ref<string | null>(null)
  // refreshToken is write-only from outside; only refresh() reads it internally
  const _refreshToken = ref<string | null>(null)
  // sessionId is internal; only logout() reads it to revoke the session server-side
  const _sessionId = ref<string | null>(null)
  const passwordResetRequired = ref(false)

  // ─── getters ──────────────────────────────────────────────────────────────
  const isAuthenticated = computed(() => accessToken.value !== null)

  // ─── actions ──────────────────────────────────────────────────────────────

  /** Write session from login or refresh response .data into state. */
  function setSession(payload: SessionData): void {
    user.value = { id: payload.userId }
    accessToken.value = payload.accessToken
    tenantId.value = extractTenantId(payload.accessToken)
    _refreshToken.value = payload.refreshToken
    _sessionId.value = payload.sessionId
    passwordResetRequired.value = payload.passwordResetRequired
  }

  /** Clear all session state (called on logout or failed refresh). */
  function clearSession(): void {
    user.value = null
    accessToken.value = null
    tenantId.value = null
    _refreshToken.value = null
    _sessionId.value = null
    passwordResetRequired.value = false
  }

  /**
   * Exchange username + password for a token pair and persist the session.
   *
   * Carries __skipAuthRefresh so a 401 (bad credentials) surfaces inline at the
   * login form instead of triggering the refresh interceptor's bounce to
   * /login (see @gocell/request). On failure the error propagates (with its
   * i18nKey attached by the interceptor) for the caller to display; the store
   * is left untouched. Navigation is the view's responsibility, not the store's.
   *
   * withCredentials lets the browser accept the backend's Set-Cookie for the
   * httpOnly refresh cookie (`__Host-gocell_rt`) that powers cold-start renewal.
   */
  async function login(credentials: HttpAuthLoginV1Request): Promise<void> {
    const res = await http.post<HttpAuthLoginV1Response>(LOGIN_URL, credentials, {
      __skipAuthRefresh: true,
      withCredentials: true,
    })
    setSession(res.data.data)
  }

  /**
   * Revoke the current session server-side then clear local state.
   *
   * Best-effort: a failed DELETE (network / already-expired) must not block the
   * local sign-out, so the session is always cleared in `finally`. Navigation
   * to /login is the caller's responsibility.
   *
   * withCredentials lets the browser receive the backend's cookie-clearing
   * Set-Cookie (Max-Age=0) so a subsequent cold start does not silently renew.
   */
  async function logout(): Promise<void> {
    const sid = _sessionId.value
    try {
      if (sid) {
        await http.delete(`${SESSION_URL}${sid}`, { withCredentials: true })
      }
    } catch {
      // Swallowed by design — local sign-out proceeds regardless.
    } finally {
      clearSession()
    }
  }

  /**
   * Attempt to exchange the refresh token for a new access token.
   *
   * Cookie-first: the backend reads the refresh token from the httpOnly
   * `__Host-gocell_rt` cookie (which survives a reload), so we always attempt the
   * call — including on a cold start when nothing is in memory. The in-memory
   * token, when present, is sent as a body fallback for the backend's dual
   * channel; with no token we POST an empty body and rely purely on the cookie.
   * withCredentials lets the browser attach the cookie and accept the rotated one.
   *
   * Returns the new accessToken on success, null otherwise.
   * On network/server failure (e.g. no valid cookie): clearSession() + return null.
   *
   * This function is the onRefresh callback for apps/web setupAxios (PR-06) and
   * the engine behind bootstrapSession()'s cold-start restore. Do NOT call
   * setupAxios here — that is the app assembly layer's job.
   */
  async function refresh(): Promise<string | null> {
    // Cookie-only cold start sends an empty body; an in-memory token, when
    // present, rides along as the backend's documented body fallback. Typed
    // against the contract so a future schema rename surfaces here at compile
    // time instead of silently sending a stale field name.
    const body: HttpAuthRefreshV1Request | Record<string, never> = _refreshToken.value
      ? { refreshToken: _refreshToken.value }
      : {}
    try {
      const res = await http.post<HttpAuthRefreshV1Response>(REFRESH_URL, body, {
        withCredentials: true,
        timeout: REFRESH_TIMEOUT_MS,
      })
      setSession(res.data.data)
      return res.data.data.accessToken
    } catch {
      clearSession()
      return null
    }
  }

  return {
    // state (expose as readonly refs via Pinia's reactive proxy)
    user,
    accessToken,
    tenantId,
    passwordResetRequired,
    // getters
    isAuthenticated,
    // actions
    setSession,
    clearSession,
    login,
    logout,
    refresh,
  }
})
