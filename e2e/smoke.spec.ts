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
const accountStatusUserId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
const rolesResponse = {
  data: [
    {
      roleId: 'ops:admin',
      name: 'Operations administrator',
      permissions: ['identity:role:read', 'settings.config-get'],
    },
  ],
  hasMore: false,
}
const policyFixture = {
  policyId: 'rss-web-policy-read',
  version: 2,
  contractId: 'identity.policies-list',
  permission: 'identity:policy:read',
  effectiveFrom: 1_700_000_000,
  rules: [
    {
      condition: {
        attribute: 'principal.id',
        operator: {
          family: 'equality',
          predicate: 'eq',
          operand: { kind: 'attribute', valueType: 'string', attribute: 'principal.id' },
        },
      },
      effect: 'allow',
      obligations: { rowScope: 'tenant', fieldMask: ['subject'] },
    },
  ],
}
const policiesResponse = { data: [policyFixture], hasMore: false }

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
  await page.route('**/api/v1/identity/roles**', async (route) => {
    expect(route.request().headers().authorization?.startsWith('Bearer ')).toBe(true)
    expect(route.request().headers()['x-tenant-id']).toBeUndefined()
    const url = new URL(route.request().url())
    if (route.request().method() === 'GET' && url.pathname === '/api/v1/identity/roles') {
      await route.fulfill({ status: 200, json: rolesResponse })
    } else if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({ subject: 'target@example.test' })
      await route.fulfill({ status: 201, json: { data: { assigned: true } } })
    } else if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 200, json: { data: { revoked: false } } })
    } else {
      await route.abort()
    }
  })
  await page.route('**/api/v1/identity/policies**', async (route) => {
    expect(route.request().headers().authorization?.startsWith('Bearer ')).toBe(true)
    expect(route.request().headers()['x-tenant-id']).toBeUndefined()
    const url = new URL(route.request().url())
    if (route.request().method() === 'GET' && url.pathname === '/api/v1/identity/policies') {
      await route.fulfill({ status: 200, json: policiesResponse })
    } else if (
      route.request().method() === 'POST' &&
      url.pathname === '/api/v1/identity/policies'
    ) {
      await route.fulfill({ status: 201, json: { data: { ...policyFixture, version: 1 } } })
    } else if (
      route.request().method() === 'GET' &&
      url.pathname === `/api/v1/identity/policies/${policyFixture.policyId}`
    ) {
      await route.fulfill({ status: 200, json: { data: policyFixture } })
    } else if (
      route.request().method() === 'PUT' &&
      url.pathname === `/api/v1/identity/policies/${policyFixture.policyId}`
    ) {
      await route.fulfill({ status: 200, json: { data: { ...policyFixture, version: 4 } } })
    } else if (
      route.request().method() === 'POST' &&
      url.pathname === `/api/v1/identity/policies/${policyFixture.policyId}/deactivate`
    ) {
      await route.fulfill({ status: 200, json: { data: { deactivated: true, version: 4 } } })
    } else {
      await route.abort()
    }
  })
  await page.route('**/api/v1/identity/logout', (route) =>
    route.fulfill({ status: 200, json: { data: { loggedOut: true } } }),
  )
  await page.route('**/api/v1/identity/logout-all', (route) =>
    route.fulfill({ status: 200, json: { data: { loggedOut: true } } }),
  )
  await page.route('**/api/v1/identity/password/change', async (route) => {
    expect(route.request().headers().authorization?.startsWith('Bearer ')).toBe(true)
    expect(route.request().headers()['x-tenant-id']).toBeUndefined()
    await route.fulfill({ status: 200, json: { data: { changed: true } } })
  })
  await page.route('**/api/v1/identity/accounts/*/status', async (route) => {
    expect(route.request().headers().authorization?.startsWith('Bearer ')).toBe(true)
    expect(route.request().headers()['x-tenant-id']).toBeUndefined()
    expect(new URL(route.request().url()).pathname).toBe(
      `/api/v1/identity/accounts/${accountStatusUserId}/status`,
    )
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, json: { data: { status: 'active' } } })
    } else {
      expect(route.request().postDataJSON()).toEqual({ targetStatus: 'suspended' })
      await route.fulfill({
        status: 200,
        json: { data: { status: 'suspended', changed: true } },
      })
    }
  })
  await page.route('**/api/v1/settings/configs**', async (route) => {
    expect(route.request().headers().authorization?.startsWith('Bearer ')).toBe(true)
    expect(route.request().headers()['x-tenant-id']).toBeUndefined()
    const url = new URL(route.request().url())
    if (route.request().method() === 'POST' && url.pathname === '/api/v1/settings/configs') {
      expect(route.request().postDataJSON()).toEqual({
        key: 'app.browser',
        value: 'browser-secret',
      })
      await route.fulfill({ status: 201, json: { data: { key: 'app.browser', version: 3 } } })
    } else if (
      route.request().method() === 'POST' &&
      url.pathname === '/api/v1/settings/configs/app.browser/rollbacks'
    ) {
      expect(route.request().postDataJSON()).toEqual({ toVersion: 1 })
      await route.fulfill({
        status: 201,
        json: { data: { key: 'app.browser', version: 4, sourceVersion: 1 } },
      })
    } else if (
      route.request().method() === 'GET' &&
      url.pathname === '/api/v1/settings/configs/app.browser'
    ) {
      await route.fulfill({
        status: 200,
        json: { data: { key: 'app.browser', value: 'server-secret', version: 3 } },
      })
    } else if (
      route.request().method() === 'DELETE' &&
      url.pathname === '/api/v1/settings/configs/app.browser'
    ) {
      await route.fulfill({ status: 204 })
    } else {
      await route.abort()
    }
  })
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByLabel('用户名').fill('alice')
  await page.getByLabel('密码').fill('test-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
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

  test('preserves first-paint theme and keyboard UX without browser security violations or third-party fonts', async ({
    page,
  }) => {
    const cspConsoleErrors: string[] = []
    const thirdPartyFontRequests: string[] = []
    const themeInitRequests: string[] = []

    page.on('console', (message) => {
      const text = message.text()
      if (
        /refused to (?:load|execute|apply|connect|frame)|content security policy.*(?:violat|block)|csp violation/i.test(
          text,
        )
      ) {
        cspConsoleErrors.push(text)
      }
    })
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.pathname === '/theme-init.js') themeInitRequests.push(request.url())
      if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        thirdPartyFontRequests.push(request.url())
      }
    })
    await page.addInitScript(() => {
      localStorage.setItem('rss-theme', 'dark')
      const securityProbe = window as typeof window & {
        __rssCspViolations?: Array<{
          readonly blockedUri: string
          readonly directive: string
        }>
        __rssThemeAtFirstFrame?: string
      }
      securityProbe.__rssCspViolations = []
      document.addEventListener('securitypolicyviolation', (event) => {
        securityProbe.__rssCspViolations?.push({
          blockedUri: event.blockedURI,
          directive: event.effectiveDirective,
        })
      })
      requestAnimationFrame(() => {
        securityProbe.__rssThemeAtFirstFrame = document.documentElement.dataset.theme ?? ''
      })
    })
    await installIdentityMocks(page)

    await page.goto('/')

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    const themeInitScript = page.locator('head > script[src="/theme-init.js"]')
    await expect(themeInitScript).toHaveCount(1)
    expect(
      await themeInitScript.evaluate((script) => ({
        async: (script as HTMLScriptElement).async,
        defer: (script as HTMLScriptElement).defer,
        type: (script as HTMLScriptElement).type,
      })),
    ).toEqual({ async: false, defer: false, type: '' })
    expect(themeInitRequests).toHaveLength(1)
    expect(new URL(themeInitRequests[0] ?? '').origin).toBe(new URL(page.url()).origin)
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as typeof window & {
                __rssThemeAtFirstFrame?: string
              }
            ).__rssThemeAtFirstFrame,
        ),
      )
      .toBe('dark')
    await expect(page.getByLabel('用户名')).toBeFocused()

    await page.getByLabel('用户名').fill('alice')
    await page.getByLabel('密码').fill('test-password')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: /身份/ })
      .click()
    await expect(page).toHaveURL(/\/identity$/)
    await expect(page.locator('#shell-content')).toBeFocused()

    const paletteButton = page.getByRole('button', { name: '打开命令面板' })
    await paletteButton.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: '命令面板' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '搜索命令' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: '命令面板' })).toHaveCount(0)
    await expect(paletteButton).toBeFocused()

    expect(thirdPartyFontRequests).toEqual([])
    expect(cspConsoleErrors).toEqual([])
    expect(
      await page.evaluate(
        () =>
          (
            window as typeof window & {
              __rssCspViolations?: ReadonlyArray<unknown>
            }
          ).__rssCspViolations ?? [],
      ),
    ).toEqual([])
  })

  test('enters the shell only after verified profile and reload returns to login', async ({
    page,
  }) => {
    await installIdentityMocks(page)
    await signIn(page)
    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: /身份/ })
      .click()
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
    await expect(navigation.getByRole('link')).toHaveCount(10)
    await expect(navigation.getByRole('link', { name: /Bindings Preview/ })).toHaveCount(0)
    await expect(navigation.locator('[data-source="mock"]')).toHaveCount(0)
    await expect(navigation.getByRole('link', { name: /首页/ })).toContainText('RSS')
    await expect(navigation.getByRole('link', { name: /角色/ })).toContainText('RSS')
    await expect(navigation.getByRole('link', { name: /^策略/ })).toContainText('RSS')
    await expect(navigation.getByRole('link', { name: /^配置/ })).toContainText('RSS')
    await expect(navigation.getByRole('link', { name: /Secret 引用发布/ })).toContainText('RSS')
    await expect(navigation.getByRole('link', { name: /Secret Material Reveal/ })).toContainText(
      'RSS',
    )
    await navigation.getByRole('link', { name: /运行时/ }).click()
    await expect(page).toHaveURL(/\/runtime$/)
    await expect(page.getByRole('heading', { name: '运行时详情' })).toBeVisible()
    await expect(page.getByText('admin-main')).toBeVisible()
    await expect(page.getByText('audit-log')).toBeVisible()
    await expect(page.getByText('hidden.internal')).toHaveCount(0)
    await expect(page.getByText('hidden-placement.internal')).toHaveCount(0)
    await expect(page.getByText('spiffe://hidden/runtime')).toHaveCount(0)

    await page.evaluate(() => {
      window.history.pushState({}, '', '/preview/role-bindings')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await expect(page.getByRole('heading', { name: '页面不存在' })).toBeVisible()

    await page.evaluate(() => {
      window.history.pushState({}, '', '/removed-capability')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await expect(page.getByRole('heading', { name: '页面不存在' })).toBeVisible()
    await expect(page.getByText('WEB_NOT_FOUND')).toBeVisible()
  })

  test('changes password once, releases secret fields, and clears local authority', async ({
    page,
  }) => {
    let passwordRequests = 0
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/v1/identity/password/change') {
        passwordRequests += 1
        expect(request.headers()['x-tenant-id']).toBeUndefined()
      }
    })
    await installIdentityMocks(page)
    await signIn(page)
    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: /身份/ })
      .click()
    await page.getByLabel('当前密码').fill('current-browser-secret')
    await page.getByLabel('新密码', { exact: true }).fill('replacement-browser-secret')
    await page.getByLabel('确认新密码').fill('replacement-browser-secret')
    await page.getByRole('button', { name: '修改密码', exact: true }).click()

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: '登录' })).toBeVisible()
    expect(passwordRequests).toBe(1)
    await expect(page.getByText('current-browser-secret')).toHaveCount(0)
    await expect(page.getByText('replacement-browser-secret')).toHaveCount(0)
  })

  test('reads and confirms Account Status only for an explicit userId', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.includes('/api/v1/identity/accounts/')) {
        requests.push(request.method())
      }
    })
    await installIdentityMocks(page)
    await signIn(page)
    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: /账户状态/ })
      .click()
    await expect(page).toHaveURL(/\/account-status$/)
    expect(requests).toEqual([])

    for (const invalid of [
      'not-a-user',
      'F47AC10B-58CC-4372-A567-0E02B2C3D479',
      '00000000-0000-0000-0000-000000000000',
    ]) {
      await page.getByLabel('User ID').fill(invalid)
      await page.getByRole('button', { name: '读取状态' }).click()
      await expect(page.getByRole('alert')).toContainText('canonical non-nil UUID')
      await expect(page.getByLabel('User ID')).toBeFocused()
      expect(requests).toEqual([])
    }

    await page.getByLabel('User ID').fill(accountStatusUserId)
    await page.getByRole('button', { name: '读取状态' }).click()
    await expect(
      page.locator('.account-status__result dd').filter({ hasText: /^Active$/ }),
    ).toBeVisible()
    expect(requests).toEqual(['GET'])

    await page.getByLabel('目标状态').selectOption('suspended')
    await page.getByRole('button', { name: '确认变更' }).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText(accountStatusUserId)
    await dialog.getByRole('button', { name: '提交变更' }).click()
    await expect(
      page.locator('.account-status__result dd').filter({ hasText: /^Suspended$/ }),
    ).toBeVisible()
    expect(requests).toEqual(['GET', 'PUT'])
  })

  test('lists opaque Roles and submits explicit assign/revoke receipts without a binding view', async ({
    page,
  }) => {
    const requests: string[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/v1/identity/roles')) {
        requests.push(request.method())
        expect(request.headers()['x-tenant-id']).toBeUndefined()
      }
    })
    await installIdentityMocks(page)
    await signIn(page)
    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: /角色/ })
      .click()
    await expect(page).toHaveURL(/\/roles$/)
    await expect(page.getByText('settings.config-get')).toBeVisible()
    expect(requests).toEqual(['GET'])

    await page.getByLabel('Role ID').fill('ops:admin')
    await page.getByLabel('Subject').fill('target@example.test')
    await page.getByRole('button', { name: 'Assign', exact: true }).click()
    const assignDialog = page.getByRole('alertdialog')
    await expect(assignDialog).toContainText('target@example.test')
    await assignDialog.getByRole('button', { name: '提交命令' }).click()
    await expect(page.getByText(/本次 assign receipt：是/)).toBeVisible()
    await expect(page.getByText('target@example.test')).toHaveCount(0)

    await page.getByLabel('Subject').fill('target@example.test')
    await page.getByRole('button', { name: 'Revoke', exact: true }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: '提交命令' }).click()
    await expect(page.getByText(/本次 revoke receipt：否/)).toBeVisible()
    expect(requests).toEqual(['GET', 'POST', 'DELETE'])
    await expect(page.getByText(/已绑定|未绑定/)).toHaveCount(0)
  })

  test('loads Policies detail only after explicit selection and never claims browser evaluation', async ({
    page,
  }) => {
    const requests: string[] = []
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname
      if (path.startsWith('/api/v1/identity/policies')) {
        requests.push(path)
        expect(request.headers()['x-tenant-id']).toBeUndefined()
      }
    })
    await installIdentityMocks(page)
    await signIn(page)
    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: /^策略/ })
      .click()
    await expect(page).toHaveURL(/\/policies$/)
    await expect(page.getByText('rss-web-policy-read')).toBeVisible()
    expect(requests).toEqual(['/api/v1/identity/policies'])
    await page.getByRole('button', { name: /rss-web-policy-read/ }).click()
    await expect(page.getByRole('heading', { name: 'ABAC rules' })).toBeVisible()
    const detail = page.getByRole('region', { name: '服务端详情' })
    await expect(detail.getByText('equality', { exact: true })).toBeVisible()
    await expect(detail.getByText('tenant', { exact: true })).toBeVisible()
    await expect(page.getByText('本页面只展示结构，不在浏览器求值 ABAC')).toBeVisible()
    expect(requests).toEqual([
      '/api/v1/identity/policies',
      '/api/v1/identity/policies/rss-web-policy-read',
    ])

    const updateRequest = page.waitForRequest(
      (request) =>
        request.method() === 'PUT' &&
        new URL(request.url()).pathname === '/api/v1/identity/policies/rss-web-policy-read',
    )
    await page.getByRole('button', { name: '准备更新', exact: true }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: '确认提交' }).click()
    expect((await updateRequest).postDataJSON()).toMatchObject({ expectedVersion: 2 })
    await expect(page.getByText(/已由 RSS 确认成功/)).toBeVisible()
  })

  test('publishes, reads, rolls back, and deletes one Config key without retaining values', async ({
    page,
  }) => {
    const requests: Array<{ method: string; path: string }> = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.pathname.startsWith('/api/v1/settings/configs')) {
        requests.push({ method: request.method(), path: url.pathname })
        expect(request.headers()['x-tenant-id']).toBeUndefined()
      }
    })
    await installIdentityMocks(page)
    await signIn(page)
    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: /^配置/ })
      .click()
    await expect(page).toHaveURL(/\/settings$/)
    expect(requests).toEqual([])

    await page.getByLabel('配置 key').fill('app.browser')
    await page.getByLabel('配置 value').fill('browser-secret')
    await page.getByRole('button', { name: '准备发布' }).click()
    const publishDialog = page.getByRole('alertdialog')
    await expect(publishDialog).toContainText('app.browser')
    await expect(publishDialog).not.toContainText('browser-secret')
    await publishDialog.getByRole('button', { name: '确认' }).click()
    await expect(page.getByText(/RSS 已确认发布 app\.browser，版本 3/)).toBeVisible()
    await expect(page.getByText('browser-secret')).toHaveCount(0)
    expect(page.url()).not.toContain('browser-secret')
    expect(
      await page.evaluate(() =>
        JSON.stringify({
          local: { ...localStorage },
          session: { ...sessionStorage },
        }),
      ),
    ).not.toContain('browser-secret')

    await page.getByRole('button', { name: '读取当前配置' }).click()
    await expect(page.getByText('server-secret')).toHaveCount(0)
    expect(page.url()).not.toContain('server-secret')
    await page.getByRole('button', { name: '显示敏感 value' }).click()
    await expect(page.getByText('server-secret')).toBeVisible()
    await page.getByRole('button', { name: '隐藏敏感 value' }).click()
    await expect(page.getByText('server-secret')).toHaveCount(0)

    await page.getByLabel('回滚源版本').fill('1')
    await page.getByRole('button', { name: '准备回滚' }).click()
    const rollbackDialog = page.getByRole('alertdialog')
    await expect(rollbackDialog).toContainText('app.browser')
    await expect(rollbackDialog).toContainText('1')
    await expect(rollbackDialog).not.toContainText('server-secret')
    await rollbackDialog.getByRole('button', { name: '确认' }).click()
    await expect(page.getByText(/源版本 1.*新版本 4/)).toBeVisible()

    await page.getByRole('button', { name: '准备删除' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: '确认' }).click()
    await expect(page.getByText(/RSS 已确认删除 app\.browser/)).toBeVisible()
    expect(requests).toEqual([
      { method: 'POST', path: '/api/v1/settings/configs' },
      { method: 'GET', path: '/api/v1/settings/configs/app.browser' },
      { method: 'POST', path: '/api/v1/settings/configs/app.browser/rollbacks' },
      { method: 'DELETE', path: '/api/v1/settings/configs/app.browser' },
    ])
  })

  test('reveals Base64 once through the protected no-store browser path and clears it', async ({
    page,
  }) => {
    const material = 'AAECAwQ='
    const key = 'vault.browser'
    const requests: string[] = []
    await page.route('**/api/v1/settings/secrets/*/material', async (route) => {
      const request = route.request()
      requests.push(new URL(request.url()).pathname)
      expect(request.method()).toBe('GET')
      expect(request.postData()).toBeNull()
      expect(request.headers()['cache-control']).toBe('no-store')
      expect(request.headers().authorization?.startsWith('Bearer ')).toBe(true)
      expect(request.headers()['x-tenant-id']).toBeUndefined()
      await route.fulfill({
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
        json: { data: { materialBase64: material } },
      })
    })
    await installIdentityMocks(page)
    await signIn(page)
    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: /Secret Material Reveal/ })
      .click()
    await expect(page).toHaveURL(/\/settings\/secret-material$/)
    expect(requests).toEqual([])

    await page.getByLabel('Secret 配置 key').fill(key)
    await page.getByRole('button', { name: '准备危险 Reveal' }).click()
    expect(requests).toEqual([])
    await page.getByRole('alertdialog').getByRole('button', { name: '确认并 Reveal 一次' }).click()
    await expect(page.locator('[data-secret-material-active]')).toHaveText(material)
    expect(requests).toEqual([`/api/v1/settings/secrets/${key}/material`])
    expect(page.url()).not.toContain(key)
    expect(
      await page.evaluate(() =>
        JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
      ),
    ).not.toContain(material)

    await page.getByRole('button', { name: '立即隐藏并释放页面引用' }).click()
    await expect(page.getByText(material, { exact: true })).toHaveCount(0)

    await page.getByLabel('Secret 配置 key').fill(key)
    await page.getByRole('button', { name: '准备危险 Reveal' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: '确认并 Reveal 一次' }).click()
    await expect(page.locator('[data-secret-material-active]')).toHaveText(material)
    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: /^配置/ })
      .click()
    await expect(page.getByText(material, { exact: true })).toHaveCount(0)
    expect(requests).toHaveLength(2)
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
