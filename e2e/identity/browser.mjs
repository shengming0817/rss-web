// Existing disposable Identity HTTPS host, production artifact and real Chromium.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import process from 'node:process'

const origin = process.env.IDENTITY_TEST_UI_ORIGIN
const tenant = '11111111-1111-4111-8111-111111111111'
const csp = [],
  errors = [],
  traffic = []
let browser,
  failure = 'environment',
  step = 'startup'
const stop = () => void browser?.close()
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
const timer = setTimeout(() => {
  failure = 'timeout'
  stop()
}, 180000)
try {
  assert.equal(new URL(origin).protocol, 'https:')
  assert.equal(new URL(origin).hostname, 'localhost')
  browser = await chromium.launch()
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 960 },
  })
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (error) => errors.push(error.name))
  page.on('request', (request) =>
    traffic.push({ method: request.method(), path: new URL(request.url()).pathname }),
  )
  await page.addInitScript(() =>
    window.addEventListener('securitypolicyviolation', (event) =>
      console.info('identity-csp:' + event.effectiveDirective),
    ),
  )
  page.on('console', (message) => {
    if (message.text().startsWith('identity-csp:')) csp.push(message.text().slice(13))
  })
  const button = (name) => page.getByRole('button', { name, exact: true }).filter({ visible: true })
  async function login(name, password) {
    await page.goto(`${origin}/tenants/${tenant}/login`)
    await page.locator('#login-name').fill(name)
    await page.locator('#login-password').fill(password)
    await button('登录').click()
    await page.waitForURL(`**/tenants/${tenant}/sessions`)
  }
  failure = 'assertion'
  step = 'login'
  await login('admin', 'correct horse battery staple')
  await page.getByRole('heading', { name: '我的会话', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => document.cookie.includes('identity-session')), false)
  step = 'account-directory'
  await page.goto(`${origin}/tenants/${tenant}/accounts`)
  await button('创建本地账户').click()
  await page.locator('#account-login').fill('browser-member')
  await page.locator('#account-password').fill('private browser member password')
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/accounts'),
  )
  await page
    .locator('#account-password')
    .locator('xpath=ancestor::form')
    .locator('button[type=submit]')
    .click()
  assert.equal((await created).status(), 201)
  await page.getByText('browser-member', { exact: true }).first().waitFor()
  await page.locator('#account-password').waitFor({ state: 'detached' })
  step = 'provider-management'
  await page.goto(`${origin}/tenants/${tenant}/providers`)
  await button('新增身份提供方').click()
  await page.locator('#issuer').fill('https://idp.example.test')
  await page.locator('#client-id').fill('reference')
  await page.locator('#client-secret').fill('private browser provider secret')
  const providerResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/providers'),
  )
  await page
    .locator('#issuer')
    .locator('xpath=ancestor::form')
    .locator('button[type=submit]')
    .click()
  assert.equal((await providerResponse).status(), 201)
  await page.getByRole('cell').filter({ hasText: 'https://idp.example.test' }).first().waitFor()
  await page.locator('#client-secret').waitFor({ state: 'detached' })
  step = 'resume'
  await page.evaluate(
    (tenantId) =>
      sessionStorage.setItem(
        'rss.authentication-flow',
        JSON.stringify({ kind: 'sso', tenant: tenantId, created: Date.now() }),
      ),
    tenant,
  )
  await page.goto(origin + '/auth/resume')
  await page.waitForURL(`**/tenants/${tenant}/sessions`)
  assert.equal(await page.evaluate(() => sessionStorage.getItem('rss.authentication-flow')), null)
  assert.equal(
    traffic.filter((request) => request.path === '/api/v1/identity/oidc/callback').length,
    0,
  )
  step = 'theme-and-responsive'
  const screenshots = mkdtempSync(join(tmpdir(), 'rss-identity-react-'))
  await button('切换主题').click()
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark')
  await page.screenshot({ path: join(screenshots, 'desktop-dark.png') })
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() => document.activeElement !== document.body), true)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: join(screenshots, 'mobile-dark.png') })
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
  )
  step = 'logout'
  await button('退出当前会话').click()
  await page.waitForURL(`**/tenants/${tenant}/login`)
  await login('browser-member', 'private browser member password')
  assert.equal(await page.getByRole('link', { name: '账户管理', exact: true }).count(), 0)
  await page.goto(`${origin}/tenants/${tenant}/accounts`)
  await page.getByRole('alert').first().waitFor()
  assert.deepEqual(csp, [])
  assert.deepEqual(errors, [])
  failure = null
} catch {
  // Raw browser errors and protocol payloads never leave this consumer.
} finally {
  try {
    await browser?.close()
  } catch {
    failure ??= 'environment'
  }
  clearTimeout(timer)
  process.removeListener('SIGINT', stop)
  process.removeListener('SIGTERM', stop)
  if (process.env.IDENTITY_UI_BROWSER_RECORD)
    writeFileSync(
      process.env.IDENTITY_UI_BROWSER_RECORD,
      JSON.stringify({
        stage: 'browser',
        failure,
        diagnostic: { test: 'identity-browser', file: 'e2e/identity/browser.mjs', step },
      }),
      { mode: 0o600 },
    )
  if (failure) process.exitCode = 1
}
