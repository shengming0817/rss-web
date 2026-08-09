import axios from 'axios'
import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import { toI18nKey } from './errors'
import type { SetupAxiosOptions, GoCellRequestError } from './types'

function attachI18nKey(error: AxiosError): void {
  const e = error as GoCellRequestError
  e.i18nKey = toI18nKey(error)
}

// 不设 baseURL：调用方传完整契约路径（`/api/v1/...`，与后端 contract.yaml 一致），
// 由 vite dev proxy / 生产网关按 `/api` 前缀转发。设 baseURL='/api' 会与调用方路径
// 叠加成 `/api/api/v1/...`（集成时被后端 401）。
export const http: AxiosInstance = axios.create()

// Track installed interceptor IDs so setupAxios is idempotent.
let requestInterceptorId: number | null = null
let responseInterceptorId: number | null = null

// Standard single-flight: all concurrent 401s share one Promise.
// No queue needed — all callers simply await the same Promise.
let refreshPromise: Promise<string | null> | null = null

/**
 * Exposed only for testing — resets interceptors and refresh state so each
 * test starts clean.  Not exported from index.ts.
 */
export function _resetForTesting(): void {
  if (requestInterceptorId !== null) {
    http.interceptors.request.eject(requestInterceptorId)
    requestInterceptorId = null
  }
  if (responseInterceptorId !== null) {
    http.interceptors.response.eject(responseInterceptorId)
    responseInterceptorId = null
  }
  refreshPromise = null
}

const DEFAULT_REFRESH_PATH = '/sessions/refresh'

function isRefreshPath(config: InternalAxiosRequestConfig, refreshPath: string): boolean {
  return (config.url ?? '').includes(refreshPath)
}

/**
 * Installs request + response interceptors on the shared `http` instance.
 * Idempotent: calling it more than once is a no-op (previous interceptors are
 * ejected first if already installed).
 */
export function setupAxios(opts: SetupAxiosOptions): void {
  const refreshPath = opts.refreshPath ?? DEFAULT_REFRESH_PATH

  // Eject previous interceptors to guarantee exactly one set is active.
  if (requestInterceptorId !== null) {
    http.interceptors.request.eject(requestInterceptorId)
  }
  if (responseInterceptorId !== null) {
    http.interceptors.response.eject(responseInterceptorId)
  }

  // Also reset baseURL if provided
  if (opts.baseURL !== undefined) {
    http.defaults.baseURL = opts.baseURL
  }

  // ── Request interceptor: inject Bearer token ─────────────────────────────
  requestInterceptorId = http.interceptors.request.use((config) => {
    const token = opts.getToken()
    if (token !== null) {
      config.headers.set('Authorization', `Bearer ${token}`)
    }
    return config
  })

  // ── Response interceptor: 401 single-flight refresh ──────────────────────
  responseInterceptorId = http.interceptors.response.use(
    (response) => response,
    async (error: unknown) => {
      // Narrow to AxiosError — non-axios errors pass through
      if (!axios.isAxiosError(error)) {
        return Promise.reject(error)
      }

      const config = error.config

      // Non-401, already a retry, opted out of auth-refresh, refresh endpoint
      // itself, or missing config → attach i18nKey and reject immediately.
      // __skipAuthRefresh marks authentication-establishing calls (login /
      // setup-admin) whose 401 is a credential verdict, not an expired session.
      const status = error.response?.status
      if (
        status !== 401 ||
        config === undefined ||
        config.__isRetry === true ||
        config.__skipAuthRefresh === true ||
        isRefreshPath(config, refreshPath)
      ) {
        attachI18nKey(error)
        return Promise.reject(error)
      }

      // Standard single-flight: if no refresh is in-flight, start one.
      // All concurrent 401s await the same Promise — natural deduplication,
      // no queue required, no resolve(null) race.
      if (!refreshPromise) {
        refreshPromise = Promise.resolve(opts.onRefresh()).finally(() => {
          refreshPromise = null
        })
      }

      let token: string | null
      try {
        token = await refreshPromise
      } catch {
        token = null
      }

      if (!token) {
        opts.onAuthFail()
        attachI18nKey(error)
        return Promise.reject(error)
      }

      // Replay original request with new token
      const retryConfig: InternalAxiosRequestConfig = {
        ...config,
        __isRetry: true,
      }
      retryConfig.headers.set('Authorization', `Bearer ${token}`)
      return http(retryConfig)
    },
  )
}
