import { expect, test, type Page } from '@playwright/test'

const loginResponse = {
  data: {
    sessionId: 'test-session',
    expiresAt: 2_000_003_600,
    accessToken: 'test-access',
    refreshToken: 'test-refresh',
    accessExpiresAt: 2_000_000_600,
  },
}
const profileResponse = {
  data: {
    subject: 'verified-subject',
    tenantId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    kind: 'user',
  },
}
const digest = `sha256:${'a'.repeat(64)}`
const runtimeResponse = {
  data: {
    schemaVersion: 1,
    assemblyFingerprint: digest,
    runtimePlanFingerprint: digest,
    activatedWorkflows: [
      {
        mode: 'projection',
        id: 'audit-log',
        definitionVersion: 'v1',
        definitionSchemaDigest: digest,
        activation: 'shadow',
      },
    ],
    domains: ['identity', 'audit'],
    listeners: [
      {
        id: 'admin-main',
        kind: 'admin',
        endpoint: { scheme: 'http', host: 'hidden.internal', port: 8082 },
        authScheme: 'rssAccessToken',
      },
    ],
    providerPosture: [{ id: 'ledger', state: 'unobserved' }],
    placements: [
      {
        domain: 'audit',
        workload: 'audit',
        mode: 'remote',
        endpoint: { scheme: 'https', host: 'hidden-placement.internal', port: 443 },
        spiffeIdentity: 'spiffe://hidden/runtime',
        readiness: 'ready',
      },
    ],
  },
}
const auditResponse = {
  data: [
    {
      seq: 0,
      tenantId: '<redacted>',
      actor: '<redacted>',
      actorKind: 'user',
      action: 'identity.login',
      resourceKind: 'session',
      resourceId: '<redacted>',
      outcome: 'success',
      recordedAt: 1_800_000_000,
      entryHash: 'opaque-fixture',
    },
  ],
  hasMore: false,
}
const targetAuditResponse = {
  data: [
    {
      seq: 41,
      tenantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      actor: 'target-sensitive-actor',
      actorKind: 'admin',
      action: 'settings.config-get',
      resourceKind: 'config',
      resourceId: 'target-sensitive-resource',
      outcome: 'success',
      recordedAt: 1_800_000_100,
      entryHash: 'opaque-target-fixture',
    },
  ],
  hasMore: true,
  nextCursor: 'opaque-next-page',
}

async function installAdminMocks(
  page: Page,
  auditStatus = 200,
  runtimeStatus = 200,
  targetAuditStatus = 200,
): Promise<void> {
  await page.route('**/api/v1/runtime/inventory', async (route) => {
    expect(route.request().headers().authorization?.startsWith('Bearer ')).toBe(true)
    expect(route.request().headers()['x-tenant-id']).toBeUndefined()
    if (runtimeStatus === 200) await route.fulfill({ status: 200, json: runtimeResponse })
    else if (runtimeStatus === 403) {
      await route.fulfill({
        status: 403,
        json: {
          error: {
            code: 'ERR_CORE_FORBIDDEN',
            message: 'runtime secret denial must not render',
            retryable: false,
            details: [],
            requestId: 'runtime-denied',
          },
        },
      })
    } else await route.fulfill({ status: runtimeStatus, body: '<html>gateway unavailable</html>' })
  })
  await page.route('**/api/v1/audit/entries**', async (route) => {
    expect(route.request().headers().authorization?.startsWith('Bearer ')).toBe(true)
    expect(route.request().headers()['x-tenant-id']).toBeUndefined()
    if (auditStatus === 200) await route.fulfill({ status: 200, json: auditResponse })
    else await route.fulfill({ status: auditStatus, body: '<html>gateway unavailable</html>' })
  })
  await page.route('**/api/v1/audit/tenants/*/entries**', async (route) => {
    expect(route.request().headers().authorization?.startsWith('Bearer ')).toBe(true)
    expect(route.request().headers()['x-tenant-id']).toBeUndefined()
    if (targetAuditStatus === 200) {
      const cursor = new URL(route.request().url()).searchParams.get('cursor')
      await route.fulfill({
        status: 200,
        json:
          cursor === null
            ? targetAuditResponse
            : { data: [{ ...targetAuditResponse.data[0], seq: 42 }], hasMore: false },
      })
    } else if (targetAuditStatus === 403) {
      await route.fulfill({
        status: 403,
        json: {
          error: {
            code: 'ERR_CORE_FORBIDDEN',
            message: 'target audit secret denial must not render',
            retryable: false,
            details: [],
            requestId: 'target-audit-denied',
          },
        },
      })
    } else if (targetAuditStatus === 401) {
      await route.fulfill({
        status: 401,
        json: {
          error: {
            code: 'ERR_CORE_UNAUTHENTICATED',
            message: 'target audit authentication expired',
            retryable: false,
            details: [],
            requestId: 'target-audit-expired',
          },
        },
      })
    } else
      await route.fulfill({ status: targetAuditStatus, body: '<html>target unavailable</html>' })
  })
}

async function installIdentityMocks(
  page: Page,
  profileStatus = 200,
  auditStatus = 200,
  runtimeStatus = 200,
  targetAuditStatus = 200,
): Promise<void> {
  await installAdminMocks(page, auditStatus, runtimeStatus, targetAuditStatus)
  await page.route('**/api/v1/identity/login', async (route) => {
    expect(route.request().headers()['x-tenant-id']).toBeUndefined()
    await route.fulfill({ status: 201, json: loginResponse })
  })
  await page.route('**/api/v1/identity/profile', async (route) => {
    expect(route.request().headers().authorization?.startsWith('Bearer ')).toBe(true)
    expect(route.request().headers()['x-tenant-id']).toBeUndefined()
    if (profileStatus === 200) await route.fulfill({ status: 200, json: profileResponse })
    else {
      await route.fulfill({
        status: profileStatus,
        json: {
          error: {
            code: 'ERR_CORE_FORBIDDEN',
            message: 'must not render',
            retryable: false,
            details: [],
            requestId: 'profile-denied',
          },
        },
      })
    }
  })
  await page.route('**/api/v1/identity/logout', (route) =>
    route.fulfill({ status: 200, json: { data: { loggedOut: true } } }),
  )
  await page.route('**/api/v1/identity/logout-all', (route) =>
    route.fulfill({ status: 200, json: { data: { loggedOut: true } } }),
  )
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByLabel('用户名').fill('alice')
  await page.getByLabel('密码').fill('test-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '已验证身份' })).toBeVisible()
}

test.describe('RSS Web Identity UX', () => {
  test('starts anonymous on login without backend bootstrap traffic', async ({ page }) => {
    const apiRequests: string[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url())
    })
    await page.goto('/')

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: '登录' })).toBeVisible()
    await expect(page.getByLabel('用户名')).toBeFocused()
    expect(apiRequests).toEqual([])
  })

  test('toggles the theme on the standalone login page', async ({ page }) => {
    await page.goto('/')
    const before = await page.locator('html').getAttribute('data-theme')
    await page.getByTestId('theme-toggle').click()
    await expect.poll(() => page.locator('html').getAttribute('data-theme')).not.toBe(before)
  })

  test('enters the shell only after verified profile and reload returns to login', async ({
    page,
  }) => {
    await installIdentityMocks(page)
    await signIn(page)
    const profile = page.getByRole('region', { name: '已验证身份' })
    await expect(profile.getByText('verified-subject')).toBeVisible()
    await expect(profile.getByText('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBeVisible()

    await page.reload()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: '登录' })).toBeVisible()
  })

  test('loads Runtime and first Audit facts from the protected Admin routes', async ({ page }) => {
    await installIdentityMocks(page)
    await signIn(page)
    await expect(page.getByRole('heading', { name: '运行时摘要' })).toBeVisible()
    await expect(page.getByText(digest).first()).toBeVisible()
    await expect(page.getByText('opaque-fixture')).toBeVisible()
    await expect(page.getByText('浏览器未验证')).toBeVisible()
    await expect(
      page.getByText('已验证身份，并独立加载 Runtime 与 Audit 的服务端事实。'),
    ).toBeVisible()
    await expect(page.getByText('<redacted>')).toHaveCount(0)
  })

  test('keeps the Runtime panel and shell available when Audit is unavailable', async ({
    page,
  }) => {
    await installIdentityMocks(page, 200, 502)
    await signIn(page)
    await expect(page.getByText(digest).first()).toBeVisible()
    await expect(page.getByText('INVALID_RESPONSE')).toBeVisible()
    await expect(page.getByText('gateway unavailable')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
  })

  test('keeps the Audit panel and shell available when Runtime is unavailable', async ({
    page,
  }) => {
    await installIdentityMocks(page, 200, 200, 504)
    await signIn(page)
    await expect(page.getByText('opaque-fixture')).toBeVisible()
    await expect(page.getByText('INVALID_RESPONSE')).toBeVisible()
    await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
  })

  test('keeps the shell and sanitizes a final Runtime forbidden result', async ({ page }) => {
    await installIdentityMocks(page, 200, 200, 403)
    await signIn(page)
    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: /运行时/ })
      .click()
    await expect(page).toHaveURL(/\/runtime$/)
    await expect(page.getByText('ERR_CORE_FORBIDDEN')).toBeVisible()
    await expect(page.getByText('runtime-denied')).toBeVisible()
    await expect(page.getByText('runtime secret denial must not render')).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
    await expect(page.locator('main')).toHaveCount(1)
  })

  test('profile denial leaves no half-valid shell or raw server message', async ({ page }) => {
    await installIdentityMocks(page, 403)
    await page.goto('/')
    await page.getByLabel('用户名').fill('alice')
    await page.getByLabel('密码').fill('test-password')
    await page.getByRole('button', { name: '登录', exact: true }).click()

    await expect(page.getByRole('alert')).toContainText('当前账户不能进入此应用')
    await expect(page.getByText('must not render')).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: '主导航' })).toHaveCount(0)
  })

  test('shows only implemented RSS navigation and protects the unknown-route 404', async ({
    page,
  }) => {
    await page.goto('/removed-capability')
    await expect(page).toHaveURL(/\/login$/)

    await installIdentityMocks(page)
    await page.getByLabel('用户名').fill('alice')
    await page.getByLabel('密码').fill('test-password')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    const navigation = page.getByRole('navigation', { name: '主导航' })
    await expect(navigation.getByRole('link')).toHaveCount(3)
    await expect(navigation.getByRole('link', { name: /首页/ })).toContainText('RSS')
    await navigation.getByRole('link', { name: /运行时/ }).click()
    await expect(page).toHaveURL(/\/runtime$/)
    await expect(page.getByRole('heading', { name: '运行时详情' })).toBeVisible()
    await expect(page.getByText('admin-main')).toBeVisible()
    await expect(page.getByText('audit-log')).toBeVisible()
    await expect(page.getByText('hidden.internal')).toHaveCount(0)
    await expect(page.getByText('hidden-placement.internal')).toHaveCount(0)
    await expect(page.getByText('spiffe://hidden/runtime')).toHaveCount(0)

    await page.evaluate(() => {
      window.history.pushState({}, '', '/removed-capability')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await expect(page.getByRole('heading', { name: '页面不存在' })).toBeVisible()
    await expect(page.getByText('WEB_NOT_FOUND')).toBeVisible()
  })

  test('queries target Audit only on explicit actions without leaking target authority or PII', async ({
    page,
  }) => {
    const targetRequests: string[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.includes('/api/v1/audit/tenants/'))
        targetRequests.push(request.url())
    })
    await installIdentityMocks(page)
    await signIn(page)
    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: /审计/ })
      .click()
    await expect(page).toHaveURL(/\/audit$/)
    expect(targetRequests).toHaveLength(0)

    await page.getByLabel('目标 tenant ID').fill('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    await page.getByRole('button', { name: '查询目标 tenant' }).click()
    const targetPanel = page.getByRole('region', { name: '显式跨租户查询' })
    await expect(targetPanel.getByText('opaque-target-fixture')).toBeVisible()
    expect(targetRequests).toHaveLength(1)
    await expect(targetPanel.getByText('target-sensitive-actor')).toHaveCount(0)
    await targetPanel.getByRole('button', { name: '显示 Actor（PII）' }).click()
    await expect(targetPanel.getByText('target-sensitive-actor')).toBeVisible()

    const next = targetPanel.getByRole('button', { name: '显式加载下一页' })
    await next.click()
    await expect(page.getByText('#42 · settings.config-get')).toBeVisible()
    expect(targetRequests).toHaveLength(2)
    expect(new URL(targetRequests[1]!).searchParams.get('cursor')).toBe('opaque-next-page')
  })

  test('keeps one target Audit 403 final without retry, fallback, or raw message', async ({
    page,
  }) => {
    let targetRequests = 0
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.includes('/api/v1/audit/tenants/')) targetRequests += 1
    })
    await installIdentityMocks(page, 200, 200, 200, 403)
    await signIn(page)
    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: /审计/ })
      .click()
    await page.getByLabel('目标 tenant ID').fill('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    await page.getByRole('button', { name: '查询目标 tenant' }).click()
    await expect(page.getByText('ERR_CORE_FORBIDDEN')).toBeVisible()
    await expect(page.getByText('target-audit-denied')).toBeVisible()
    await expect(page.getByText('target audit secret denial must not render')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '重试' })).toHaveCount(0)
    expect(targetRequests).toBe(1)
  })

  test('invalidates the session after one target Audit 401 without refresh or replay', async ({
    page,
  }) => {
    let targetRequests = 0
    let refreshRequests = 0
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname
      if (path.includes('/api/v1/audit/tenants/')) targetRequests += 1
      if (path === '/api/v1/identity/refresh') refreshRequests += 1
    })
    await installIdentityMocks(page, 200, 200, 200, 401)
    await signIn(page)
    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: /审计/ })
      .click()
    await page.getByLabel('目标 tenant ID').fill('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    await page.getByRole('button', { name: '查询目标 tenant' }).click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: '登录' })).toBeVisible()
    expect(targetRequests).toBe(1)
    expect(refreshRequests).toBe(0)
  })

  test('logout and confirmed logout-all invalidate local authority immediately', async ({
    page,
  }) => {
    await installIdentityMocks(page)
    await signIn(page)
    await page.getByTestId('logout-current').click()
    await expect(page).toHaveURL(/\/login/)

    await signIn(page)
    await page.getByTestId('logout-all').click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('confirm-logout-all').click()
    await expect(page).toHaveURL(/\/login/)
  })
})
