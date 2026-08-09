/**
 * Application route guards.
 *
 * 顺序（不可颠倒）：
 *   1. 认证门：未登录保护路由 → /login
 *   2. PDP 授权门：to.meta.requiredAction → PDP decide() 评估
 *
 * 设计要点：
 *  - auth: requiresAuth 默认 true；meta.requiresAuth === false 或 meta.public 放行
 *  - PDP: fail-closed；await pdpClient.decide() 拿结构化决策，仅当 effect==='allow'
 *    时通过；拒绝时把 reasonCode 交给 onAccessDenied 做 i18n 提示。用 decide() 而非
 *    响应式 can()：can() 首次导航 pending→false 会误把已授权用户重定向回 home。
 *
 */
import type { Router } from 'vue-router'
import { nextTick } from 'vue'
import type { App } from 'vue'
import { useAuthStore } from '@gocell/access'
import type { PdpClient } from '@gocell/core'

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
    // ── Stage 1: auth gate ──────────────────────────────────────────────────
    const isPublic = to.meta.requiresAuth === false || to.meta.public === true
    if (!isPublic) {
      const authStore = useAuthStore()
      if (!authStore.isAuthenticated) {
        return { name: 'login', query: { redirect: to.fullPath } }
      }
    }

    // ── Stage 2: PDP gate ───────────────────────────────────────────────────
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
