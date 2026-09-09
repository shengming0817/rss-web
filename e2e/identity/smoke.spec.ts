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

test('SSO resumes a prepared Hydra flow and consumes the locator before accept', async ({
  page,
}) => {
  let active = false
  let accepts = 0
  let consumed = false
  const flow = { tenant_id: tenant, grant_id: id }
  await page.route('https://idp.example.test/authorize', (route) =>
    route.fulfill({ status: 302, headers: { location: 'http://localhost:5175/auth/resume' } }),
  )
  await page.route('https://consumer.example.test/done', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Consumer continuation</h1>' }),
  )
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    let body: unknown
    let status = 200
    if (path === '/api/v1/downstream/login') body = flow
    else if (path.endsWith('/session')) {
      body = active ? profile : { code: 'invalid_credential' }
      status = active ? 200 : 401
    } else if (path.endsWith('/login-options'))
      body = { providers: [{ provider_id: id, label: 'Example SSO' }] }
    else if (path.endsWith(`/oidc/${id}/login`)) {
      active = true
      body = { authorization_url: 'https://idp.example.test/authorize' }
    } else if (path === '/api/v1/downstream/login/accept') {
      accepts++
      expect(route.request().postDataJSON()).toEqual({ flow, challenge: 'fixture-challenge' })
      expect(route.request().headers()['x-csrf-token']).toBe(csrf)
      consumed = await page.evaluate(
        () => sessionStorage.getItem('rss.identity.pending-flow') === null,
      )
      body = { redirect_to: 'https://consumer.example.test/done' }
    } else {
      status = 400
      body = { code: 'malformed_request' }
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.goto('/login?login_challenge=fixture-challenge')
  await expect(page.getByRole('button', { name: '组织 SSO · Example SSO' })).toBeVisible()
  expect(page.url()).not.toContain('fixture-challenge')
  await page.getByRole('button', { name: '组织 SSO · Example SSO' }).click()
  await expect(page.getByRole('heading', { name: 'Consumer continuation' })).toBeVisible()
  expect(accepts).toBe(1)
  expect(consumed).toBe(true)
})

test('an unknown consent result cannot replay after reload', async ({ page }) => {
  let accepts = 0
  const flow = { tenant_id: tenant, grant_id: id }
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    let body: unknown
    let status = 200
    if (path === '/api/v1/downstream/consent') body = flow
    else if (path.endsWith('/session')) body = profile
    else if (path.endsWith('/login-options')) body = { providers: [] }
    else if (path === '/api/v1/downstream/consent/accept') {
      accepts++
      status = 503
      body = { code: 'identity_unavailable', correlation_id: id }
    } else {
      status = 400
      body = { code: 'malformed_request' }
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.goto('/consent?consent_challenge=fixture-consent')
  await page.getByRole('button', { name: '继续', exact: true }).click()
  await expect(page.getByRole('heading', { name: '身份服务暂时不可用', exact: true })).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('rss.identity.pending-flow'))).toBeNull()
  await page.reload()
  await expect(page.getByRole('heading', { name: '身份服务暂时不可用', exact: true })).toBeVisible()
  expect(accepts).toBe(1)
})
