import type { AxiosError } from 'axios'

export interface SetupAxiosOptions {
  baseURL?: string
  getToken: () => string | null
  onRefresh: () => Promise<string | null>
  onAuthFail: () => void
  /**
   * URL substring used to identify the refresh endpoint itself.
   * Requests whose URL contains this string are never retried on 401
   * to prevent recursive refresh loops.
   *
   * Default: '/sessions/refresh'
   */
  refreshPath?: string
}

export interface GoCellRequestError extends AxiosError {
  i18nKey?: string
}

declare module 'axios' {
  interface AxiosRequestConfig {
    /**
     * Opt this request out of the 401 → single-flight-refresh → onAuthFail
     * machinery. A 401 is rejected immediately (with i18nKey attached) and
     * neither onRefresh nor onAuthFail fire.
     *
     * Set on authentication-establishing calls whose own 401 is a *credential*
     * verdict, not an expired session: login (`/sessions/login`) and first-run
     * bootstrap (`/setup/admin`). Without it, a wrong-credentials 401 on those
     * endpoints would spuriously attempt a refresh and bounce the operator to
     * /login instead of surfacing the inline error.
     *
     * Passable at the call site because it lives on AxiosRequestConfig (the
     * third `http.post(url, data, config)` argument); the interceptor reads it
     * via InternalAxiosRequestConfig, which extends this interface.
     */
    __skipAuthRefresh?: boolean
  }
  interface InternalAxiosRequestConfig {
    __isRetry?: boolean
  }
}
