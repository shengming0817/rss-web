import { test, expect } from '@playwright/test'
import { loginAs, stubSetupDone, stubHealthEndpoints } from './helpers'

/**
 * 冒烟测试 — AppShell 骨架 + 主题切换
 *
 * ① shell 渲染：登录后落在 '/'，sidebar（nav）+ topbar（header）存在
 * ② shell 挂载：'/' 渲染 LandingView 的页面标题 h1
 * ③ 主题切换：点击主题按钮后 html[data-theme] 在 light/dark 间切换
 *
 * 说明：Batch 7 起 '/' 为 requiresAuth:true（health overview），故需先登录。
 *   loginAs 经登录后重定向落在 '/'（AppShell 挂载），不做二次 page.goto——刷新会
 *   清空仅存内存的 token，被守卫弹回 /login。详见 e2e/helpers.ts。
 *   LandingView 在 '/' 挂载即轮询 health/system；这些端点必须 stub，否则未拦截的
 *   请求经 dev proxy 触发 401 → 刷新失败 → 会话过期弹回 /login，shell 随之消失。
 */

test.describe('AppShell 骨架渲染', () => {
  test('sidebar nav 和 topbar header 存在', async ({ page }) => {
    await stubSetupDone(page)
    await stubHealthEndpoints(page)
    await loginAs(page) // lands on '/' inside the AppShell

    // Sidebar renders a <nav> element
    await expect(page.locator('nav').first()).toBeVisible()

    // TopBar renders a <header> element
    await expect(page.locator('header').first()).toBeVisible()
  })

  test('页面标题或品牌文案可见（shell 正常挂载）', async ({ page }) => {
    await stubSetupDone(page)
    await stubHealthEndpoints(page)
    await loginAs(page)

    // LandingView renders an h1 page title
    const heading = page.locator('h1').first()
    await expect(heading).toBeVisible()
  })
})

test.describe('主题切换', () => {
  test('点击主题按钮后 html[data-theme] 变化', async ({ page }) => {
    await stubSetupDone(page)
    await stubHealthEndpoints(page)
    await loginAs(page)

    // TopBar 主题切换按钮：用 data-testid 稳定定位（与 locale 无关，避免 aria-label i18n 文案耦合）
    const themeBtn = page.locator('[data-testid="theme-toggle"]')
    await expect(themeBtn).toBeVisible()

    // 读取当前主题
    const before = await page.locator('html').getAttribute('data-theme')

    await themeBtn.click()

    // 等待 data-theme 变化（点击后 nextTick 写入 html[data-theme]）
    await expect.poll(async () => page.locator('html').getAttribute('data-theme')).not.toBe(before)
    const after = await page.locator('html').getAttribute('data-theme')

    // 验证值域：只允许 light 或 dark
    expect(['light', 'dark']).toContain(after)
  })
})
