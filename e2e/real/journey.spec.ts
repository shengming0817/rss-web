import { expect, test, type Page } from '@playwright/test'

const username = 'rss-web-real-user'
const limitedUsername = 'rss-web-limited-user'
const passwordUsername = 'rss-web-password-user'
const accountSelfUsername = 'rss-web-account-self'
const password = 'rss-web-real-e2e-password'
const replacementPassword = 'rss-web-replacement-password'
const accountTargetUserId = '44444444-4444-4444-8444-444444444444'
const accountSelfUserId = '55555555-5555-4555-8555-555555555555'

async function signIn(page: Page, login = username, credential = password): Promise<void> {
  await page.goto('/')
  await page.getByLabel('用户名').fill(login)
  await page.getByLabel('密码').fill(credential)
  await page.getByRole('button', { name: '登录', exact: true }).click()
}

async function signInAndExpectShell(page: Page, login = username, credential = password) {
  const loginResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/v1/identity/login',
  )
  const profileResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/identity/profile' && response.status() === 200,
  )
  await signIn(page, login, credential)
  expect((await loginResponse).status()).toBe(201)
  expect((await profileResponse).status()).toBe(200)
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
}

async function browserLeakSurface(page: Page): Promise<string> {
  return page.evaluate(() =>
    JSON.stringify({
      dom: document.documentElement.outerHTML,
      fields: [
        ...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea'),
      ].map((field) => field.value),
      href: window.location.href,
      history: window.history.state,
      local: { ...window.localStorage },
      session: { ...window.sessionStorage },
    }),
  )
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

  await signInAndExpectShell(page)
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: /身份/ }).click()
  await expect(page.getByRole('heading', { name: '已验证身份' })).toBeVisible()
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: /首页/ }).click()
  const runtimePanel = page.getByRole('region', { name: '运行时摘要' })
  const auditPanel = page.getByRole('region', { name: '首批审计条目' })
  for (const badge of [
    runtimePanel.locator('[data-source="rss"]'),
    auditPanel.locator('[data-source="rss"]'),
  ]) {
    await expect(badge).toBeVisible()
    await expect(badge).toHaveAttribute('data-authoritative', 'true')
    await expect(badge).toHaveAttribute('data-preview', 'false')
  }

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

  let targetRequests = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.includes('/api/v1/audit/tenants/')) targetRequests += 1
  })
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: /审计/ }).click()
  await page.getByLabel('目标 tenant ID').fill('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
  const targetDenied = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
      '/api/v1/audit/tenants/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/entries',
  )
  await page.getByRole('button', { name: '查询目标 tenant' }).click()
  expect((await targetDenied).status()).toBe(403)
  await expect(page.getByText('ERR_CORE_FORBIDDEN')).toBeVisible()
  expect(targetRequests).toBe(1)

  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: /账户状态/ })
    .click()
  let accountRequests = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.includes('/api/v1/identity/accounts/')) {
      accountRequests += 1
      expect(request.headers()['x-tenant-id']).toBeUndefined()
    }
  })
  expect(accountRequests).toBe(0)
  await page.getByLabel('User ID').fill(accountTargetUserId)
  await page.getByRole('button', { name: '读取状态' }).click()
  await expect(
    page.locator('.account-status__result dd').filter({ hasText: /^Active$/ }),
  ).toBeVisible()

  await page.getByLabel('目标状态').selectOption('active')
  await page.getByRole('button', { name: '确认变更' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '提交变更' }).click()
  await expect(page.getByText('否', { exact: true })).toBeVisible()

  await page.getByLabel('目标状态').selectOption('suspended')
  await page.getByRole('button', { name: '确认变更' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '提交变更' }).click()
  await expect(
    page.locator('.account-status__result dd').filter({ hasText: /^Suspended$/ }),
  ).toBeVisible()
  await expect(page.getByText('是', { exact: true })).toBeVisible()

  const invalidTransition = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith(`/accounts/${accountTargetUserId}/status`) &&
      response.request().method() === 'PUT',
  )
  await page.getByLabel('目标状态').selectOption('locked')
  await page.getByRole('button', { name: '确认变更' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '提交变更' }).click()
  expect((await invalidTransition).status()).toBe(409)
  await expect(page.getByText('ERR_CORE_CONFLICT')).toBeVisible()

  await page.getByLabel('User ID').fill('66666666-6666-4666-8666-666666666666')
  const missingAccount = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith(
        '/accounts/66666666-6666-4666-8666-666666666666/status',
      ) && response.request().method() === 'GET',
  )
  await page.getByRole('button', { name: '读取状态' }).click()
  expect((await missingAccount).status()).toBe(404)
  await expect(page.getByText('ERR_CORE_NOT_FOUND')).toBeVisible()
  expect(accountRequests).toBe(5)

  const policyRequests: string[] = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path.startsWith('/api/v1/identity/policies')) {
      policyRequests.push(path)
      expect(request.headers()['x-tenant-id']).toBeUndefined()
    }
  })
  const policiesList = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/v1/identity/policies',
  )
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: /^策略/ })
    .click()
  expect((await policiesList).status()).toBe(200)
  const policyButton = page.getByRole('button', { name: /rss-web-real-policies-list-read/ })
  await expect(policyButton).toBeVisible()
  const policyDetail = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
      '/api/v1/identity/policies/rss-web-real-policies-list-read',
  )
  await policyButton.click()
  expect((await policyDetail).status()).toBe(200)
  await expect(page.getByText('principal.id').first()).toBeVisible()
  await expect(page.getByText('本页面只展示结构，不在浏览器求值 ABAC')).toBeVisible()
  expect(policyRequests).toEqual([
    '/api/v1/identity/policies',
    '/api/v1/identity/policies/rss-web-real-policies-list-read',
  ])

  const navigation = page.getByRole('navigation', { name: '主导航' })
  await expect(navigation.locator('a[href^="/preview/"]')).toHaveCount(0)
  await navigation.getByRole('link', { name: /关于/ }).click()
  await expect(page).toHaveURL(/\/about$/)
  await expect(page.locator('[data-release-preview-source]')).toHaveCount(0)
  await expect(page.locator('main [data-source="mock"]')).toHaveCount(0)

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

test('@policies-write keeps all real policy writes server-authoritative', async ({ page }) => {
  await signInAndExpectShell(page, username)
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: /^策略/ })
    .click()
  const policyButton = page.getByRole('button', { name: /rss-web-real-policies-list-read/ })
  await expect(policyButton).toBeVisible()
  await policyButton.click()
  await expect(page.getByRole('region', { name: '准备更新' })).toBeVisible()

  const createPanel = page.getByRole('region', { name: '准备创建' })
  await createPanel.getByLabel('Policy ID').fill('rss-web-real-policy-write-denied')
  await createPanel.getByLabel('Contract ID').fill('identity.policies-list')
  await createPanel.getByLabel('Permission').fill('identity:policy:read')
  await createPanel.getByLabel('生效起点（epoch seconds）').fill('1700000000')
  await createPanel.getByLabel('Attribute', { exact: true }).fill('principal.kind')
  await createPanel.getByLabel('Operand value').fill('admin')
  const createDenied = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v1/identity/policies',
  )
  await createPanel.getByRole('button', { name: '准备创建', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '确认提交' }).click()
  expect((await createDenied).status()).toBe(403)
  await expect(page.getByText('ERR_CORE_FORBIDDEN')).toBeVisible()

  const updateDenied = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      new URL(response.url()).pathname ===
        '/api/v1/identity/policies/rss-web-real-policies-list-read',
  )
  await page.getByRole('button', { name: '准备更新', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '确认提交' }).click()
  expect((await updateDenied).status()).toBe(403)
  await expect(page.getByText('ERR_CORE_FORBIDDEN')).toBeVisible()

  const deactivateDenied = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname ===
        '/api/v1/identity/policies/rss-web-real-policies-list-read/deactivate',
  )
  await page.getByRole('button', { name: '准备停用', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '确认提交' }).click()
  expect((await deactivateDenied).status()).toBe(403)
  await expect(page.getByText('ERR_CORE_FORBIDDEN')).toBeVisible()
})

test('@main keeps real 403 authoritative for a limited account', async ({ page }) => {
  await signInAndExpectShell(page, limitedUsername)
  await expect(page.locator('[data-source="unavailable"]')).toHaveCount(2)
  await expect(page.getByText('ERR_CORE_FORBIDDEN')).toHaveCount(2)
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: /账户状态/ })
    .click()
  await page.getByLabel('User ID').fill(accountTargetUserId)
  const denied = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith(`/accounts/${accountTargetUserId}/status`) &&
      response.request().method() === 'GET',
  )
  await page.getByRole('button', { name: '读取状态' }).click()
  expect((await denied).status()).toBe(403)
  await expect(page.getByText('ERR_CORE_FORBIDDEN')).toBeVisible()

  const policiesDenied = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/v1/identity/policies',
  )
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: /^策略/ })
    .click()
  expect((await policiesDenied).status()).toBe(403)
  await expect(page.getByText('ERR_CORE_FORBIDDEN')).toBeVisible()
})

test('@password-change changes a real password once and revokes every existing session', async ({
  browser,
}) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()
  const passwordRequests: string[] = []
  pageA.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/v1/identity/password/change') {
      passwordRequests.push(request.method())
      expect(request.headers()['x-tenant-id']).toBeUndefined()
    }
  })

  await signInAndExpectShell(pageA, passwordUsername)
  await signInAndExpectShell(pageB, passwordUsername)
  await pageA
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: /身份/ })
    .click()
  await pageA.getByLabel('当前密码').fill(password)
  await pageA.getByLabel('新密码', { exact: true }).fill(replacementPassword)
  await pageA.getByLabel('确认新密码').fill(replacementPassword)
  await pageA.getByRole('button', { name: '修改密码', exact: true }).click()
  await expect(pageA).toHaveURL(/\/login$/)
  expect(passwordRequests).toEqual(['POST'])

  await pageB
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: /运行时/ })
    .click()
  await expect(pageB).toHaveURL(/\/login$/)

  await pageA.getByLabel('用户名').fill(passwordUsername)
  await pageA.getByLabel('密码').fill(password)
  await pageA.getByRole('button', { name: '登录', exact: true }).click()
  await expect(pageA.getByRole('alert')).toContainText('凭据无效')
  await signInAndExpectShell(pageA, passwordUsername, replacementPassword)

  await contextA.close()
  await contextB.close()
})

test('@account-status-self invalidates every session after a real self-status change', async ({
  browser,
}) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()
  await signInAndExpectShell(pageA, accountSelfUsername)
  await signInAndExpectShell(pageB, accountSelfUsername)
  await pageA
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: /账户状态/ })
    .click()
  await pageA.getByLabel('User ID').fill(accountSelfUserId)
  await pageA.getByRole('button', { name: '读取状态' }).click()
  await expect(
    pageA.locator('.account-status__result dd').filter({ hasText: /^Active$/ }),
  ).toBeVisible()
  await pageA.getByLabel('目标状态').selectOption('suspended')
  const changed = pageA.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith(`/accounts/${accountSelfUserId}/status`) &&
      response.request().method() === 'PUT',
  )
  await pageA.getByRole('button', { name: '确认变更' }).click()
  await pageA.getByRole('alertdialog').getByRole('button', { name: '提交变更' }).click()
  expect((await changed).status()).toBe(200)
  await expect(pageA).toHaveURL(/\/login$/)

  await pageB
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: /运行时/ })
    .click()
  await expect(pageB).toHaveURL(/\/login$/)
  await contextA.close()
  await contextB.close()
})

test('@roles keeps the RSS user authority boundary for list, assign, and revoke', async ({
  page,
}) => {
  await signInAndExpectShell(page)
  const roleRequests: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/v1/identity/roles')) {
      roleRequests.push(request.method())
      expect(request.headers()['x-tenant-id']).toBeUndefined()
    }
  })
  const catalogResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/v1/identity/roles',
  )
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: /角色/ }).click()
  const catalog = await catalogResponse
  expect(catalog.status()).toBe(403)
  expect(await catalog.json()).toEqual({
    error: {
      code: 'ERR_CORE_FORBIDDEN',
      message: 'forbidden',
      retryable: false,
      details: [],
      requestId: expect.stringMatching(/^[!-~]{1,128}$/),
    },
  })
  await expect(page.getByText('FORBIDDEN')).toBeVisible()

  await page.getByLabel('Role ID').fill('rss-web-real')
  await page.getByLabel('Subject').fill('roles-target@example.test')
  await page.getByRole('button', { name: 'Assign', exact: true }).click()
  const assign = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v1/identity/roles/rss-web-real/bindings',
  )
  await page.getByRole('alertdialog').getByRole('button', { name: '提交命令' }).click()
  expect((await assign).status()).toBe(403)
  await expect(page.getByText('FORBIDDEN')).toHaveCount(2)
  await expect(page.getByText('roles-target@example.test')).toHaveCount(0)

  await page.getByLabel('Subject').fill('roles-target@example.test')
  await page.getByRole('button', { name: 'Revoke', exact: true }).click()
  const revoke = page.waitForResponse(
    (response) =>
      response.request().method() === 'DELETE' &&
      new URL(response.url()).pathname.endsWith(
        '/roles/rss-web-real/bindings/roles-target%40example.test',
      ),
  )
  await page.getByRole('alertdialog').getByRole('button', { name: '提交命令' }).click()
  expect((await revoke).status()).toBe(403)
  await expect(page.getByText('FORBIDDEN')).toHaveCount(2)
  expect(roleRequests).toEqual(['GET', 'POST', 'DELETE'])
  await expect(page.getByText(/本次 (?:assign|revoke) receipt/)).toHaveCount(0)
  await expect(page.getByText(/已绑定|未绑定/)).toHaveCount(0)
})

test('@settings-config keeps Settings writes server-authoritative', async ({ page }) => {
  const consoleMessages: string[] = []
  page.on('console', (message) => consoleMessages.push(message.text()))
  await signInAndExpectShell(page, limitedUsername)
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: /^配置/ })
    .click()
  await page.getByLabel('配置 key').fill('rss-web.real.config')

  const getDenied = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/v1/settings/configs/rss-web.real.config',
  )
  await page.getByRole('button', { name: '读取当前配置' }).click()
  expect((await getDenied).status()).toBe(403)
  await expect(page.getByText('ERR_CORE_FORBIDDEN')).toBeVisible()

  await page.getByLabel('配置 value').fill('real-config-secret')
  await page.getByRole('button', { name: '准备发布' }).click()
  const publishDenied = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v1/settings/configs',
  )
  await page.getByRole('alertdialog').getByRole('button', { name: '确认' }).click()
  expect((await publishDenied).status()).toBe(403)
  await expect(page.getByText('ERR_CORE_FORBIDDEN')).toBeVisible()
  await expect(page.getByText('real-config-secret')).toHaveCount(0)

  await page.getByLabel('回滚源版本').fill('1')
  const rollbackDenied = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v1/settings/configs/rss-web.real.config/rollbacks',
  )
  await page.getByRole('button', { name: '准备回滚' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '确认' }).click()
  expect((await rollbackDenied).status()).toBe(403)
  await expect(page.getByText('ERR_CORE_FORBIDDEN')).toBeVisible()

  const deleteDenied = page.waitForResponse(
    (response) =>
      response.request().method() === 'DELETE' &&
      new URL(response.url()).pathname === '/api/v1/settings/configs/rss-web.real.config',
  )
  await page.getByRole('button', { name: '准备删除' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '确认' }).click()
  expect((await deleteDenied).status()).toBe(403)
  await expect(page.getByText('ERR_CORE_FORBIDDEN')).toBeVisible()

  const secretCoordinates = [
    'rss-web.real.secret-key',
    'real-secret-store-marker',
    'real/secret-ref-marker',
    'real-secret-version-marker',
  ] as const
  const secretRequests: string[] = []
  const materialRequests: string[] = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path === '/api/v1/settings/secrets') {
      secretRequests.push(request.method())
      expect(request.headers()['x-tenant-id']).toBeUndefined()
    }
    if (path.startsWith('/api/v1/settings/secrets/') && path.endsWith('/material')) {
      materialRequests.push(path)
    }
  })
  await page.locator('a[href="/settings/secret-reference"]').click()
  await page.locator('#secret-key').fill(secretCoordinates[0])
  await page.locator('#secret-store-id').fill(secretCoordinates[1])
  await page.locator('#secret-ref-key').fill(secretCoordinates[2])
  await page.locator('#secret-ref-version').fill(secretCoordinates[3])
  await page.locator('[data-action="prepare-secret-publish"]').click()
  const secretDenied = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v1/settings/secrets',
  )
  await page.locator('[data-action="confirm-secret-publish"]').click()
  const secretResponse = await secretDenied
  expect(secretResponse.status()).toBe(403)
  expect(secretResponse.request().postDataJSON()).toEqual({
    key: secretCoordinates[0],
    storeId: secretCoordinates[1],
    refKey: secretCoordinates[2],
    refVersion: secretCoordinates[3],
  })
  expect(await secretResponse.json()).toEqual({
    error: {
      code: 'ERR_CORE_FORBIDDEN',
      message: 'forbidden',
      retryable: false,
      details: [],
      requestId: expect.stringMatching(/^[!-~]{1,128}$/),
    },
  })
  await expect(page.getByText('ERR_CORE_FORBIDDEN')).toBeVisible()
  await page.waitForTimeout(250)
  expect(secretRequests).toEqual(['POST'])
  expect(materialRequests).toEqual([])
  for (const selector of [
    '#secret-key',
    '#secret-store-id',
    '#secret-ref-key',
    '#secret-ref-version',
  ]) {
    await expect(page.locator(selector)).toHaveValue('')
  }
  for (const coordinate of secretCoordinates)
    await expect(page.getByText(coordinate)).toHaveCount(0)

  const secretMaterialKey = 'rss-web.real.secret-material-key'
  const secretMaterialPath = `/api/v1/settings/secrets/${secretMaterialKey}/material`
  await page.locator('a[href="/settings/secret-material"]').click()
  await page.locator('#secret-material-key').fill(secretMaterialKey)
  await page.locator('[data-action="prepare-secret-material"]').click()
  const materialDenied = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === secretMaterialPath,
  )
  await page.locator('[data-action="confirm-secret-material"]').click()
  const materialResponse = await materialDenied
  expect(materialResponse.status()).toBe(403)
  expect(materialResponse.request().method()).toBe('GET')
  expect(materialResponse.request().postData()).toBeNull()
  expect(materialResponse.request().headers()['cache-control']).toBe('no-store')
  expect(materialResponse.request().headers()['x-tenant-id']).toBeUndefined()
  expect(materialResponse.headers()['cache-control']).toBe('no-store')
  expect(await materialResponse.json()).toEqual({
    error: {
      code: 'ERR_CORE_FORBIDDEN',
      message: 'forbidden',
      retryable: false,
      details: [],
      requestId: expect.stringMatching(/^[!-~]{1,128}$/),
    },
  })
  await expect(page.getByText('ERR_CORE_FORBIDDEN')).toBeVisible()
  await page.waitForTimeout(250)
  expect(materialRequests).toEqual([secretMaterialPath])
  await expect(page.locator('[data-secret-material-active]')).toHaveCount(0)
  await expect(page.getByText('materialBase64')).toHaveCount(0)
  await page.locator('a[href="/settings"]').click()
  await expect(page.locator('[data-secret-material-view]')).toHaveCount(0)

  const leakSurface = `${await browserLeakSurface(page)}\n${consoleMessages.join('\n')}`
  for (const marker of [
    'real-config-secret',
    ...secretCoordinates,
    secretMaterialKey,
    'materialBase64',
  ]) {
    expect(leakSurface).not.toContain(marker)
  }
})

test('@preview-isolation keeps demo fixtures local and real RSS final', async ({ page }) => {
  await signInAndExpectShell(page)
  const runtimePanel = page.getByRole('region', { name: '运行时摘要' })
  const auditPanel = page.getByRole('region', { name: '首批审计条目' })
  await expect(runtimePanel.locator('[data-source="rss"]')).toBeVisible()
  await expect(auditPanel.locator('[data-source="rss"]')).toBeVisible()

  const businessRequests: string[] = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path.startsWith('/api/')) businessRequests.push(`${request.method()} ${path}`)
  })

  await page.locator('a[href="/preview/role-bindings"]').click()
  await expect(page.getByRole('heading', { name: 'Role Bindings Preview' })).toBeVisible()
  const roleSource = page.locator('main [data-source="mock"]')
  await expect(roleSource).toHaveAttribute('data-authoritative', 'false')
  await expect(roleSource).toHaveAttribute('data-preview', 'true')
  expect(businessRequests).toEqual([])

  await page.locator('a[href="/preview/config-history"]').click()
  await expect(page.getByRole('heading', { name: 'Config History Preview' })).toBeVisible()
  const historySources = page.locator('[data-history-row] [data-source="mock"]')
  expect(await historySources.count()).toBeGreaterThan(0)
  await expect(historySources.first()).toHaveAttribute('data-authoritative', 'false')
  await expect(historySources.first()).toHaveAttribute('data-preview', 'true')
  expect(businessRequests).toEqual([])

  await page.locator('a[href="/preview/config-catalog"]').click()
  await expect(page.getByRole('heading', { name: 'Config Catalog Preview' })).toBeVisible()
  const candidate = page.locator('.catalog-preview__rows > li').first()
  const candidateKey = (await candidate.locator('code').textContent())?.trim()
  if (candidateKey === undefined) throw new Error('missing Config Catalog Preview candidate key')
  expect(candidateKey).toMatch(/^preview\.example\./)
  const catalogSource = candidate.locator('[data-source="mock"]')
  await expect(catalogSource).toHaveAttribute('data-authoritative', 'false')
  await expect(catalogSource).toHaveAttribute('data-preview', 'true')
  expect(businessRequests).toEqual([])

  await candidate.getByRole('button', { name: '准备复制到 Manual 草稿' }).click()
  const handoff = page.getByRole('alertdialog')
  await expect(handoff).toContainText(candidateKey)
  expect(businessRequests).toEqual([])
  await handoff.getByRole('button', { name: '复制并前往配置页' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByLabel('配置 key')).toHaveValue(candidateKey)
  await expect(page.getByText(/Mock 建议已复制为 Manual 草稿/)).toBeVisible()
  const manualSource = page.locator('main [data-source="manual"]')
  await expect(manualSource).toHaveAttribute('data-authoritative', 'false')
  await expect(manualSource).toHaveAttribute('data-preview', 'false')
  expect(businessRequests).toEqual([])

  const denied = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === `/api/v1/settings/configs/${candidateKey}` &&
      response.status() === 403,
  )
  await page.getByRole('button', { name: '读取当前配置' }).click()
  expect((await denied).status()).toBe(403)
  await expect(page.getByText('ERR_CORE_FORBIDDEN')).toBeVisible()
  await expect(page.locator('main [data-source="unavailable"]')).toHaveAttribute(
    'data-authoritative',
    'false',
  )
  await expect(page.locator('main [data-source="mock"]')).toHaveCount(0)
  expect(
    businessRequests.filter(
      (request) => request === `GET /api/v1/settings/configs/${candidateKey}`,
    ),
  ).toHaveLength(1)
})

test('@rate-limited observes canonical 401 and 429 through the browser Edge and UI', async ({
  page,
}) => {
  await page.goto('/login')
  const statuses = await page.evaluate(async () => {
    const unauthorized = await fetch('/api/v1/identity/profile')
    const attempts = await Promise.all(
      Array.from({ length: 24 }, () =>
        fetch('/api/v1/identity/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'invalid', password: 'invalid' }),
        }).then(async (response) => ({ status: response.status, body: await response.json() })),
      ),
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
  const uiResponse = await uiRateLimit
  expect(await uiResponse.json()).toEqual({
    error: {
      code: 'ERR_CORE_TOO_MANY_REQUESTS',
      message: 'too many requests',
      retryable: true,
      details: [],
      requestId: expect.stringMatching(/^[!-~]{1,128}$/),
    },
  })
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
  let runtimeRequests = 0
  let auditRequests = 0
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path === '/api/v1/runtime/inventory') runtimeRequests += 1
    if (path === '/api/v1/audit/entries') auditRequests += 1
  })
  await signInAndExpectShell(page)
  const runtimePanel = page.getByRole('region', { name: '运行时摘要' })
  const auditPanel = page.getByRole('region', { name: '首批审计条目' })
  await expect(runtimePanel.locator('[data-source="unavailable"]')).toHaveAttribute(
    'data-authoritative',
    'false',
  )
  await expect(auditPanel.locator('[data-source="unavailable"]')).toHaveAttribute(
    'data-authoritative',
    'false',
  )
  expect(runtimeRequests).toBe(1)
  expect(auditRequests).toBe(1)

  const retry = runtimePanel.getByRole('button', { name: '重试' })
  await retry.evaluate((button) => {
    const observations: Array<{ attribute: string; oldValue: string | null }> = []
    const busySnapshots: Array<{ busy: string | null; disabled: boolean; focused: boolean }> = []
    ;(
      window as typeof window & {
        __runtimeRetryObservations?: typeof observations
        __runtimeRetryBusySnapshots?: typeof busySnapshots
      }
    ).__runtimeRetryObservations = observations
    ;(
      window as typeof window & { __runtimeRetryBusySnapshots?: typeof busySnapshots }
    ).__runtimeRetryBusySnapshots = busySnapshots
    const setAttribute = button.setAttribute.bind(button)
    button.setAttribute = (name, value) => {
      setAttribute(name, value)
      if (name === 'aria-busy' && value === 'true') {
        queueMicrotask(() =>
          busySnapshots.push({
            busy: button.getAttribute('aria-busy'),
            disabled: (button as HTMLButtonElement).disabled,
            focused: document.activeElement === button,
          }),
        )
      }
    }
    new MutationObserver((records) => {
      observations.push(
        ...records.map((record) => ({
          attribute: record.attributeName ?? '',
          oldValue: record.oldValue,
        })),
      )
    }).observe(button, {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['aria-busy', 'disabled'],
    })
    ;(button as HTMLButtonElement).focus()
  })
  await expect(retry).toBeFocused()
  await retry.click()
  const observations = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __runtimeRetryObservations?: Array<{ attribute: string; oldValue: string | null }>
        }
      ).__runtimeRetryObservations ?? [],
  )
  expect(observations).toContainEqual({ attribute: 'aria-busy', oldValue: 'false' })
  expect(observations).toContainEqual({ attribute: 'disabled', oldValue: null })
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __runtimeRetryBusySnapshots?: Array<{
              busy: string | null
              disabled: boolean
              focused: boolean
            }>
          }
        ).__runtimeRetryBusySnapshots ?? [],
    ),
  ).toContainEqual({ busy: 'true', disabled: true, focused: true })
  await expect(runtimePanel.locator('[data-source="unavailable"]')).toBeVisible()
  await expect(runtimePanel.getByRole('heading', { name: '运行时摘要' })).toBeFocused()
  expect(runtimeRequests).toBe(2)
  expect(auditRequests).toBe(1)
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
