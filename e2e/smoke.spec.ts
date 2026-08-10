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

async function installIdentityMocks(page: Page, profileStatus = 200): Promise<void> {
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
