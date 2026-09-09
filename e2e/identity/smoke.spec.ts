import { test, expect, type Page } from '@playwright/test'
const tenant = '11111111-1111-4111-8111-111111111111'
const id = '22222222-2222-4222-8222-222222222222'
const csrf = 'a'.repeat(64)
const profile = {
  session: { id, auth_time: 1, idle_expires_at: 4102444800, absolute_expires_at: 4102444900 },
  identity: { principal_id: id, administrator: true, has_local_password: true },
  csrf_token: csrf,
}
async function fixture(page: Page) {
  let active = false
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    expect(request.headers()['authorization']).toBeUndefined()
    expect(request.headers()['x-tenant-id']).toBeUndefined()
    const path = new URL(request.url()).pathname
    if (request.method() === 'POST' && !path.endsWith('/login') && active)
      expect(request.headers()['x-csrf-token']).toBe(csrf)
    let body: unknown = {}
    let status = 200
    if (path.endsWith('/login')) {
      active = true
      body = profile
    } else if (path.endsWith('/login-options')) body = { providers: [] }
    else if (!active) {
      status = 401
      body = { code: 'invalid_credential' }
    } else if (path.endsWith('/session')) body = profile
    else if (path.endsWith('/sessions')) body = { sessions: [profile.session], next_cursor: null }
    else if (path.endsWith('/accounts')) body = { accounts: [], next_cursor: null }
    else if (path.endsWith('/providers')) body = { providers: [] }
    else if (path.endsWith('/logout') || path.endsWith('/logout-all')) {
      active = false
      status = 204
    } else {
      status = 400
      body = { code: 'malformed_request' }
    }
    await route.fulfill({
      status,
      contentType: 'application/json',
      ...(status === 204 ? {} : { body: JSON.stringify(body) }),
    })
  })
}
test('central login, management navigation, theme and signout use cookie protocol', async ({
  page,
}) => {
  await fixture(page)
  await page.goto(`/tenants/${tenant}/login`)
  await page.getByLabel('账户名', { exact: true }).fill('admin')
  await page.getByLabel('密码', { exact: true }).fill('private fixture password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '我的会话' })).toBeVisible()
  await page.getByRole('link', { name: '账户管理' }).click()
  await expect(page.getByRole('heading', { name: '创建本地账户' })).toBeVisible()
  await page.getByRole('link', { name: '身份提供方' }).click()
  await expect(page.getByRole('heading', { name: '新增身份提供方' })).toBeVisible()
  await page.getByRole('button', { name: '切换主题' }).click()
  await page.getByRole('link', { name: '我的会话' }).click()
  await page.getByRole('button', { name: '退出当前会话' }).click()
  await expect(page.getByRole('heading', { name: '登录', exact: true })).toBeVisible()
})
test('callback error clears per-tab flow and never reflects provider text', async ({ page }) => {
  await page.goto('/auth/error?reason=failed&error_description=private-upstream-marker')
  await expect(page.getByRole('heading', { name: '登录未完成' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('private-upstream-marker')
})
