import { expect, test, type Page } from '@playwright/test'

const username = 'rss-web-real-user'
const limitedUsername = 'rss-web-limited-user'
const password = 'rss-web-real-e2e-password'

async function signIn(page: Page, login = username): Promise<void> {
  await page.goto('/')
  await page.getByLabel('用户名').fill(login)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
}

test('@main completes tenant bootstrap, verified profile, Admin facts, refresh, and logout', async ({
  page,
}) => {
  const browserHeaders: string[][] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) {
      browserHeaders.push(Object.keys(request.headers()))
    }
  })

  await signIn(page)
  await expect(page.getByRole('heading', { name: '已验证身份' })).toBeVisible()
  const runtimePanel = page.getByRole('region', { name: '运行时摘要' })
  const auditPanel = page.getByRole('region', { name: '首批审计条目' })
  await expect(runtimePanel.locator('[data-source="rss"]')).toBeVisible()
  await expect(auditPanel.locator('[data-source="rss"]')).toBeVisible()

  await page.waitForTimeout(2_500)
  const refreshed = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/identity/refresh' && response.status() === 201,
  )
  await page.getByRole('button', { name: '刷新首批条目' }).click()
  await refreshed
  await expect
    .poll(
      async () => {
        const count = await auditPanel.locator('ol.audit-list > li').count()
        if (count === 0) {
          await page.waitForTimeout(500)
          await page.getByRole('button', { name: '刷新首批条目' }).click()
        }
        return count
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0)
  await expect(auditPanel.getByText('浏览器未验证').first()).toBeVisible()

  expect(browserHeaders.every((headers) => !headers.includes('x-tenant-id'))).toBe(true)
  const loggedOut = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/v1/identity/logout',
  )
  await page.getByTestId('logout-current').click()
  await expect(page).toHaveURL(/\/login/)
  const logoutResponse = await loggedOut
  expect(logoutResponse.status()).toBe(200)
  expect(await logoutResponse.json()).toEqual({ data: { loggedOut: true } })
})

test('@main keeps real 403 authoritative for a limited account', async ({ page }) => {
  await signIn(page, limitedUsername)
  await expect(page.getByRole('heading', { name: '已验证身份' })).toBeVisible()
  await expect(page.locator('[data-source="unavailable"]')).toHaveCount(2)
  await expect(page.getByText('ERR_CORE_FORBIDDEN')).toHaveCount(2)
})

test('@main observes canonical 401 and 429 through the browser Edge', async ({ page }) => {
  await page.goto('/login')
  const statuses = await page.evaluate(async () => {
    const unauthorized = await fetch('/api/v1/identity/profile')
    const attempts = await Promise.all(
      Array.from({ length: 24 }, () =>
        fetch('/api/v1/identity/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'invalid', password: 'invalid' }),
        }),
      ).then(async (response) => ({ status: response.status, body: await response.json() })),
    )
    return { unauthorized: unauthorized.status, attempts }
  })
  expect(statuses.unauthorized).toBe(401)
  const rateLimited = statuses.attempts.find((attempt) => attempt.status === 429)
  expect(rateLimited?.body).toEqual({
    error: {
      code: 'ERR_CORE_TOO_MANY_REQUESTS',
      message: 'too many requests',
      retryable: true,
      details: [],
      requestId: expect.stringMatching(/^[!-~]{1,128}$/),
    },
  })
  const uiRateLimit = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/identity/login' && response.status() === 429,
  )
  await signIn(page)
  await uiRateLimit
  await expect(page.getByRole('alert')).toContainText('尝试过于频繁，请稍后重试。')
})

test('@budget-exhausted reports the real RSS request-budget 503 without a mock fallback', async ({
  page,
}) => {
  const unavailable = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/v1/identity/login',
  )
  await signIn(page)
  const response = await unavailable
  expect(response.status()).toBe(503)
  expect(await response.json()).toEqual({
    error: {
      code: 'ERR_CORE_UNAVAILABLE',
      message: 'service unavailable',
      retryable: false,
      details: [],
      requestId: expect.stringMatching(/^[!-~]{1,128}$/),
    },
  })
  await expect(page.getByRole('alert')).toContainText('身份服务暂时不可用')
  await expect(page.getByRole('navigation', { name: '主导航' })).toHaveCount(0)
})

test('@admin-down keeps Primary login and shell available while Admin panels fail', async ({
  page,
}) => {
  await signIn(page)
  await expect(page.getByRole('heading', { name: '已验证身份' })).toBeVisible()
  await expect(page.locator('[data-source="unavailable"]')).toHaveCount(2)
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
})

test('@primary-down keeps the SPA reachable and Admin listener independently alive', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '登录' })).toBeVisible()
  const status = await page.evaluate(async () => (await fetch('/api/v1/runtime/inventory')).status)
  expect(status).toBe(401)
  await signIn(page)
  await expect(page.getByRole('alert')).toContainText('身份服务返回了无效响应')
  await expect(page.getByText('502 Bad Gateway')).toHaveCount(0)
})
