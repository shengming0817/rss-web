/**
 * guards.ts — 路由守卫三段（T020）
 *
 * 顺序（不可颠倒）：
 *   1. first-run 门：检查后端是否已初始化（hasAdmin）
 *   2. 认证门：未登录保护路由 → /login
 *   3. PDP 授权门：to.meta.requiredAction → PDP can() 评估
 *
 * 设计要点：
 *  - first-run: fail-open（请求失败放行）；**只缓存"已完成 setup"（needsSetup=false）
 *    的结果**；needsSetup=true 时不缓存，每次导航重新查，直到 setup 完成后某次
 *    查到 false 才缓存，破除 first-run 完成后仍死循环重定向的问题。
 *  - auth: requiresAuth 默认 true；meta.requiresAuth === false 或 meta.public 放行
 *  - PDP: fail-closed；await pdpClient.decide() 拿结构化决策，仅当 effect==='allow'
 *    时通过；拒绝时把 reasonCode 交给 onAccessDenied 做 i18n 提示。用 decide() 而非
 *    响应式 can()：can() 首次导航 pending→false 会误把已授权用户重定向回 home。
 *
 * 顺序安全注解（Stage 1 → Stage 2）：
 *  fetchSetupStatus 的 catch 块 return false（fail-open）是安全的，
 *  前提是 auth gate（Stage 2）在 first-run gate（Stage 1）之后执行。
 *  若 Stage 2 先于 Stage 1，fail-open 会让未初始化的后端绕过认证门。
 *  两段顺序不可颠倒。
 */
import type { Router } from 'vue-router'
import { nextTick } from 'vue'
import type { App } from 'vue'
import { useAuthStore } from '@gocell/access'
import { http } from '@gocell/request'
import type { PdpClient } from '@gocell/core'
import type { HttpAuthSetupStatusV1Response } from '@gocell/contracts'

const SETUP_STATUS_URL = '/api/v1/access/setup/status'

/**
 * Cached result: undefined = not yet fetched or setup not done yet;
 * false = setup is done (hasAdmin=true), safe to cache permanently.
 *
 * We ONLY cache the "setup done" state (needsSetup=false).
 * When needsSetup=true, we do NOT cache so that the next navigation
 * re-fetches and detects when setup has been completed.
 * This prevents an infinite redirect loop after first-run completes.
 */
let _setupStatusCache: false | undefined = undefined

/**
 * Single-flight: if concurrent navigations fire before the first request
 * settles, they reuse the same in-flight Promise instead of spawning
 * duplicate requests. Pattern mirrors @gocell/request refreshPromise.
 */
let _setupStatusPromise: Promise<boolean> | null = null

async function fetchSetupStatus(): Promise<boolean> {
  // Only serve from cache when we know setup is done
  if (_setupStatusCache === false) return false

  // Reuse the in-flight request if one is already pending
  if (_setupStatusPromise !== null) return _setupStatusPromise

  _setupStatusPromise = (async () => {
    try {
      const res = await http.get<HttpAuthSetupStatusV1Response>(SETUP_STATUS_URL)
      // hasAdmin: true  → setup done → no redirect
      // hasAdmin: false → needs setup → redirect
      const needsSetup = !res.data.data.hasAdmin
      if (!needsSetup) {
        // Cache only the "setup done" result — prevents repeated API calls once setup completes
        _setupStatusCache = false
      }
      // needsSetup=true: do NOT cache — re-fetch on next navigation until setup completes
      return needsSetup
    } catch {
      // Request failed / backend not reachable → fail-open: do not block app startup
      // Do NOT cache failure — retry on next navigation
      // Safety: fail-open is acceptable here ONLY because auth gate (Stage 2) runs AFTER
      // this first-run gate (Stage 1). The two stages must never be reordered.
      if (import.meta.env.DEV)
        console.warn('[guards] setup/status request failed; skipping first-run gate')
      return false
    } finally {
      // Clear the in-flight promise so future navigations re-fetch after failure
      // (success with needsSetup=false is handled by _setupStatusCache)
      _setupStatusPromise = null
    }
  })()

  return _setupStatusPromise
}

/**
 * Reset the first-run cache and in-flight promise — intended for test isolation.
 * @internal
 */
export function _resetSetupStatusCache(): void {
  _setupStatusCache = undefined
  _setupStatusPromise = null
}

/**
 * Register the three-stage beforeEach guard on the router.
 *
 * @param router         — Vue Router instance
 * @param _app           — Vue App instance (reserved for future app.inject() wiring)
 * @param pdpClient      — Optional PDP client override; used in tests. In production
 *                         main.ts provides it via app.provide() and passes it here.
 * @param onAccessDenied — Optional callback invoked with the deny reasonCode when the
 *                         PDP gate rejects, so the assembly layer can surface an i18n
 *                         notice. Kept out of guards.ts to keep it free of AntD / i18n
 *                         coupling (and trivially testable in isolation).
 */
export function registerGuards(
  router: Router,
  _app: App,
  pdpClient?: PdpClient,
  onAccessDenied?: (reasonCode: string) => void,
): void {
  router.beforeEach(async (to) => {
    // ── Stage 1: first-run gate ─────────────────────────────────────────────
    // PRD §5.1: needsSetup=true → always redirect to /first-run-setup, including
    // when navigating to /login (first-run setup takes precedence over login page).
    // Already on /first-run-setup → skip to avoid infinite redirect.
    if (to.name !== 'first-run-setup') {
      const needsSetup = await fetchSetupStatus()
      if (needsSetup) {
        return { name: 'first-run-setup' }
      }
    }

    // ── Stage 2: auth gate ──────────────────────────────────────────────────
    const isPublic = to.meta.requiresAuth === false || to.meta.public === true
    if (!isPublic) {
      const authStore = useAuthStore()
      if (!authStore.isAuthenticated) {
        return { name: 'login', query: { redirect: to.fullPath } }
      }
    }

    // ── Stage 3: PDP gate ───────────────────────────────────────────────────
    const requiredAction = to.meta.requiredAction
    if (typeof requiredAction === 'string') {
      if (!pdpClient) {
        // PDP client not wired (Batch 0 fallback) → fail-closed
        if (import.meta.env.DEV)
          console.warn('[guards] PDP client not provided; denying access to', to.path)
        onAccessDenied?.('error')
        return { name: 'home' }
      }

      const resource =
        typeof to.meta.requiredResource === 'string' ? to.meta.requiredResource : undefined

      // Await the structured decision rather than reading the reactive can():
      // can() is pending→false on first navigation and would wrongly redirect an
      // allowed user home. decide() resolves the real decision and carries the
      // deny reasonCode for the i18n notice.
      const decision = await pdpClient.decide(requiredAction, resource)
      if (decision.effect !== 'allow') {
        onAccessDenied?.(decision.reasonCode)
        return { name: 'home' }
      }
    }

    // All gates passed
    return true
  })

  // ── a11y: SPA 路由切换后焦点移到主内容区域 ─────────────────────────────────
  // 无刷新路由切换不会触发浏览器默认的焦点重置；screen reader 用户需要显式提示
  // 新视图已加载。将焦点移到 #shell-content（AppShell.vue <main tabindex="-1">）。
  // 用 nextTick 确保 Vue 已更新 DOM，再移焦点。
  // 注意：#shell-content 的 tabindex="-1" 在 @gocell/core/AppShell.vue 中设置；
  //   此处用 DOM id 查询，不让 apps/web 反向依赖 @gocell/core 组件实现。
  router.afterEach(() => {
    void nextTick(() => {
      const main = document.getElementById('shell-content')
      main?.focus({ preventScroll: true })
    })
  })
}
