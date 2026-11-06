import { chromium } from 'playwright'
import { readFileSync, statSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'
import assert from 'node:assert/strict'

let browser,
  context,
  page,
  screenshots,
  phase = 'environment',
  failed = false,
  closing
const close = () =>
  (closing ??= (async () => {
    try {
      await context?.close()
    } catch {
      failed = true
    }
    try {
      await browser?.close()
    } catch {
      failed = true
    }
  })())
const stop = () => {
  failed = true
  void close()
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
const timer = setTimeout(stop, 170_000)
const responses = [],
  pageErrors = [],
  cspViolations = []
try {
  const fixture = JSON.parse(readFileSync(process.env.MDM_REACT_BROWSER_FIXTURE, 'utf8'))
  const origin = new URL(fixture.origin)
  assert.equal(origin.protocol, 'https:')
  assert.equal(origin.hostname, 'localhost')
  assert.equal(statSync(fixture.passwordFile).mode & 0o077, 0)
  browser = await chromium.launch()
  context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 960 },
  })
  let next = 0
  await context.route('**/api/v1/**', async (route) => {
    const wait = Math.max(0, next - Date.now())
    next = Date.now() + wait + 200
    if (wait) await new Promise((done) => setTimeout(done, wait))
    await route.continue()
  })
  page = await context.newPage()
  page.setDefaultTimeout(15_000)
  page.on('pageerror', (error) => pageErrors.push(error.name))
  await page.addInitScript(() => {
    window.addEventListener('securitypolicyviolation', (event) =>
      console.info(
        'mdm-csp:' +
          JSON.stringify({
            directive: event.effectiveDirective,
            blocked: event.blockedURI === 'inline' ? 'inline' : 'other',
            line: event.lineNumber,
          }),
      ),
    )
  })
  page.on('console', (message) => {
    if (message.type() === 'info' && message.text().startsWith('mdm-csp:'))
      cspViolations.push(JSON.parse(message.text().slice(8)))
    if (
      message.type() === 'error' &&
      /Content Security Policy|violates.*policy/i.test(message.text())
    )
      cspViolations.push('csp')
  })
  page.on('response', async (response) => {
    const path = new URL(response.url()).pathname
    const resource = path.endsWith('/identity-host/config.json')
      ? 'identity-host'
      : path.endsWith('/mdm-host/config.json')
        ? 'mdm-host'
        : path.endsWith('/session')
          ? 'session'
          : path.endsWith('/login')
            ? 'login'
            : path.endsWith('/context')
              ? 'context'
              : path.includes('/webauthn/')
                ? 'webauthn-' + path.split('/').slice(-2).join('-')
                : path.endsWith('/session/security')
                  ? 'session-security'
                  : path.endsWith('/reauthenticate')
                    ? 'reauthenticate'
                    : null
    if (resource) {
      const code =
        response.status() >= 400
          ? await response
              .json()
              .then((body) =>
                [
                  'malformed_request',
                  'reauthentication_required',
                  'insufficient_privilege',
                  'identity_unavailable',
                  'interaction_required',
                  'authentication_cancelled',
                  'invalid_credential',
                ].includes(body?.code)
                  ? body.code
                  : 'other',
              )
              .catch(() => 'non-json')
          : undefined
      responses.push({ resource, status: response.status(), code })
      if (responses.length > 12) responses.shift()
    }
  })
  phase = 'public-static-routes'
  for (const [path, heading] of [
    ['/downloads/agent', 'Agent 安装包'],
    ['/enrollment/windows/entra/terms', 'Windows 注册条款'],
  ]) {
    await page.goto(origin.origin + path)
    await page.getByRole('heading', { name: heading, exact: true }).waitFor()
    await page.reload()
    await page.getByRole('heading', { name: heading, exact: true }).waitFor()
    assert.equal(new URL(page.url()).pathname, path)
  }
  phase = 'login-landing'
  await page.goto(origin.origin)
  await page.getByLabel('账户', { exact: true }).fill(fixture.login)
  await page.getByLabel('密码', { exact: true }).fill('incorrect fixture password')
  phase = 'login-rejection'
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByText('账户或密码不正确。', { exact: true }).waitFor()
  phase = 'login-success'
  await page.getByLabel('密码', { exact: true }).fill(readFileSync(fixture.passwordFile, 'utf8'))
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('heading', { name: '租户初始化', exact: true }).waitFor()
  assert.equal(new URL(page.url()).pathname, '/setup')
  await page.getByRole('button', { name: '保存意图', exact: true }).waitFor()
  phase = 'design'
  const sidebar = await page.locator('.sidebar').boundingBox(),
    topbar = await page.locator('.topbar').boundingBox()
  assert.equal(sidebar.width, 218)
  assert.equal(topbar.height, 58)
  assert.equal(
    await page.locator('.main').evaluate((element) => getComputedStyle(element).paddingLeft),
    '36px',
  )
  screenshots = mkdtempSync(resolve(tmpdir(), 'rss-react-mdm-browser-'))
  await page.screenshot({
    path: resolve(screenshots, 'landing-light.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await page.getByRole('heading', { name: 'Tenant setup', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Toggle color theme' }).click()
  await page.screenshot({
    path: resolve(screenshots, 'landing-dark.png'),
    fullPage: true,
    animations: 'disabled',
  })
  assert.equal(
    await page
      .locator('.topbar .ant-btn')
      .first()
      .evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--ant-button-default-bg').trim(),
      ),
    '#1b1c1f',
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('dialog').getByRole('link', { name: 'Security', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.getByRole('heading', { name: 'Security', exact: true }).waitFor()
  assert.equal((await page.locator('.topbar').boundingBox()).height, 52)
  await page.locator('.breadcrumbs').getByText('Security', { exact: true }).waitFor()
  await page.screenshot({
    path: resolve(screenshots, 'security-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  })
  phase = 'reauthentication-csrf-feedback'
  await page.getByRole('button', { name: 'Reauthenticate', exact: true }).click()
  const reauthentication = page.getByRole('dialog', { name: 'Reauthenticate', exact: true })
  const wrongCsrf = async (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-csrf-token': '0'.repeat(64) } })
  await page.route('**/session/reauthenticate', wrongCsrf)
  await reauthentication
    .getByLabel('Password', { exact: true })
    .fill(readFileSync(fixture.passwordFile, 'utf8'))
  await reauthentication.getByRole('button', { name: 'Reauthenticate', exact: true }).click()
  await reauthentication
    .getByRole('alert')
    .getByText('Session credentials changed. Read the session again.', { exact: true })
    .waitFor()
  assert.equal(await reauthentication.getByLabel('Password', { exact: true }).inputValue(), '')
  await page.unroute('**/session/reauthenticate', wrongCsrf)
  await reauthentication.getByRole('button', { name: 'Cancel', exact: true }).click()
  await reauthentication.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Reauthenticate', exact: true }).click()
  assert.equal(await reauthentication.getByRole('alert').count(), 0)
  phase = 'reauthentication-success'
  await reauthentication
    .getByLabel('Password', { exact: true })
    .fill(readFileSync(fixture.passwordFile, 'utf8'))
  await reauthentication.getByRole('button', { name: 'Reauthenticate', exact: true }).click()
  await reauthentication.waitFor({ state: 'hidden' })
  phase = 'reauthentication-invalidation'
  await page.getByRole('button', { name: 'Reauthenticate', exact: true }).click()
  await reauthentication.getByLabel('Password', { exact: true }).fill('incorrect fixture password')
  await reauthentication.getByRole('button', { name: 'Reauthenticate', exact: true }).click()
  await page.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor()
  await page
    .getByText('Your session expired or was invalidated. Sign in again.', { exact: true })
    .waitFor()
  assert.equal(await page.getByRole('button', { name: 'Sign in', exact: true }).isEnabled(), false)
  // A failed password verification returns 401 but need not revoke the cookie session.
  // Recover only through an explicit authoritative read, never by replaying the rejected write.
  await page.getByRole('button', { name: 'Read session again', exact: true }).click()
  await page.getByRole('heading', { name: 'Tenant setup', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('dialog').getByRole('link', { name: 'Security', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.getByRole('heading', { name: 'Security', exact: true }).waitFor()
  phase = 'purpose-bound-passkey'
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  let { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  await page.getByLabel('Passkey name', { exact: true }).fill('Fixture key one')
  await page.getByRole('button', { name: 'Add passkey', exact: true }).click()
  await page.getByText('Fixture key one', { exact: true }).waitFor()
  await page
    .getByRole('button', { name: 'Verify adding with an existing passkey', exact: true })
    .click()
  await page
    .getByText('Verification for adding a passkey completed. Explicitly submit Add.', {
      exact: true,
    })
    .waitFor()
  assert.equal(await page.locator('.passkey-list li').count(), 1)
  await page.getByRole('button', { name: 'Cancel adding authorization', exact: true }).click()
  await page
    .getByText('Verification for adding a passkey completed. Explicitly submit Add.', {
      exact: true,
    })
    .waitFor({ state: 'hidden' })
  await page
    .getByRole('button', { name: 'Verify adding with an existing passkey', exact: true })
    .click()
  await page
    .getByText('Verification for adding a passkey completed. Explicitly submit Add.', {
      exact: true,
    })
    .waitFor()
  // A second passkey uses another authenticator; the first is correctly excluded by the producer.
  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId })
  ;({ authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  }))
  await page.getByLabel('Passkey name', { exact: true }).fill('Fixture key two')
  await page.getByRole('button', { name: 'Add passkey', exact: true }).click()
  await page.getByText('Fixture key two', { exact: true }).waitFor()
  await cdp.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId, enabled: false })
  phase = 'passkey-cancellation'
  const authenticationBegan = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/webauthn/authenticate/begin'),
  )
  await page
    .getByRole('button', { name: 'Verify adding with an existing passkey', exact: true })
    .click()
  assert.equal((await authenticationBegan).status(), 200)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByText('Authentication was cancelled.', { exact: true }).waitFor()
  assert.equal(await page.locator('.passkey-list li').count(), 2)
  await cdp.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId, enabled: true })
  phase = 'page-cache-lifecycle'
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
  })
  await page.getByRole('heading', { name: 'Security', exact: true }).waitFor()
  phase = 'unknown-rotation'
  let rotations = 0
  const drop = async (route) => {
    rotations++
    await route.fetch()
    await route.abort('failed')
  }
  await page.route('**/session/refresh', drop)
  await page.getByRole('button', { name: 'Refresh session', exact: true }).click()
  await page.getByText('Session could not be confirmed', { exact: true }).waitFor()
  assert.equal(rotations, 1)
  await page.unroute('**/session/refresh', drop)
  await page.getByRole('button', { name: 'Read session again', exact: true }).click()
  await page.getByRole('heading', { name: 'Security', exact: true }).waitFor()
  phase = 'logout'
  const loggedOut = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/sessions/logout-all'),
  )
  await page.getByRole('button', { name: 'Sign out all sessions', exact: true }).click()
  assert.equal((await loggedOut).status(), 204)
  await page.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor()
  const session = await context.request.get(
    `${origin.origin}/api/v1/identity/tenants/${fixture.tenant}/session`,
  )
  assert.equal(session.status(), 401)
  phase = 'unknown-login'
  const loseLogin = async (route) => {
    await route.fetch()
    await route.abort('failed')
  }
  await page.route('**/identity/tenants/*/login', loseLogin)
  await page.getByLabel('Account', { exact: true }).fill(fixture.login)
  await page
    .getByLabel('Password', { exact: true })
    .fill(readFileSync(fixture.passwordFile, 'utf8'))
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('button', { name: 'Read session again', exact: true }).waitFor()
  await page.unroute('**/identity/tenants/*/login', loseLogin)
  await page.getByRole('button', { name: 'Read session again', exact: true }).click()
  await page.getByRole('heading', { name: 'Tenant setup', exact: true }).waitFor()
  phase = 'invalid-host'
  const invalid = async (route) => {
    const response = await route.fetch(),
      config = await response.json()
    await route.fulfill({ response, json: { ...config, serviceId: '' } })
  }
  await page.route('**/mdm-host/config.json', invalid)
  await page.reload()
  await page.getByText('宿主配置不可用或绑定错误，应用无法启动。', { exact: true }).waitFor()
  await page.unroute('**/mdm-host/config.json', invalid)
  phase = 'resume'
  await page.goto(`${origin.origin}/auth/resume`)
  await page.getByText('登录流程已过期或不属于当前租户。', { exact: true }).waitFor()
  await page.getByRole('link', { name: '登录', exact: true }).click()
  await page.getByRole('heading', { name: '租户初始化', exact: true }).waitFor()
  phase = 'callback-cancellation'
  await page.evaluate(
    (tenant) =>
      sessionStorage.setItem(
        'rss.authentication-flow',
        JSON.stringify({ kind: 'sso', tenant, created: Date.now() }),
      ),
    fixture.tenant,
  )
  await page.goto(`${origin.origin}/auth/error?reason=cancelled`)
  await page.getByText('组织认证已取消。', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => sessionStorage.getItem('rss.authentication-flow')), null)
  await page.getByRole('link', { name: '登录', exact: true }).click()
  await page.getByRole('heading', { name: '租户初始化', exact: true }).waitFor()
  phase = 'management-entry'
  await page.goto(`${origin.origin}/platform/login`)
  await page.getByRole('heading', { name: '欢迎回来', exact: true }).waitFor()
  await page.locator('.eyebrow').getByText('管理租户', { exact: true }).waitFor()
  assert.deepEqual(pageErrors, [])
  assert.deepEqual(cspViolations, [])
  console.log(
    JSON.stringify({
      phase: 'react-auth-browser',
      result: 'passed',
      screenshots,
      coverage: [
        'real-https-cookie-csrf',
        'login-rejection',
        'refresh-unknown-no-replay',
        'reauthentication',
        'reauthentication-real-csrf-rejection-in-dialog',
        'reauthentication-401-invalidation',
        'purpose-bound-passkey-addition',
        'ceremony-and-authorization-cancel',
        'page-cache-lifecycle-events',
        'unknown-login-recovery',
        'oidc-error-recovery',
        'management-entry',
        'logout-all',
        'invalid-host',
        'expired-resume',
        'desktop-mobile-light-dark',
      ],
    }),
  )
} catch (error) {
  failed = true
  const startupRefused =
    page &&
    (await page
      .getByText('宿主配置不可用或绑定错误，应用无法启动。', { exact: true })
      .count()
      .catch(() => 0))
  console.error(
    JSON.stringify({
      phase,
      result: 'failed',
      classification:
        error?.name === 'TimeoutError'
          ? 'timeout'
          : error?.message?.includes('strict mode violation')
            ? 'ambiguous-selector'
            : 'assertion',
      startupRefused: Boolean(startupRefused),
      pageErrors,
      cspViolations,
      screenshots,
      responses,
    }),
  )
} finally {
  clearTimeout(timer)
  await close()
  process.removeListener('SIGINT', stop)
  process.removeListener('SIGTERM', stop)
  if (failed) process.exitCode = 1
}
