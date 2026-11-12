// Shared mechanics only. Journeys own their business assertions against the real host.
import { chromium } from 'playwright'
import { readFileSync, statSync } from 'node:fs'
import assert from 'node:assert/strict'
import process from 'node:process'
export async function realBrowser(fixtureVariable, journey) {
  const fixture = JSON.parse(readFileSync(process.env[fixtureVariable], 'utf8')),
    origin = new URL(fixture.origin).origin,
    passwordFile = fixture.passwordFile ?? fixture.admin.passwordFile
  assert.equal(new URL(origin).protocol, 'https:')
  assert.equal(new URL(origin).hostname, 'localhost')
  assert.equal(statSync(passwordFile).mode & 0o077, 0)
  const browser = await chromium.launch(),
    contexts = [],
    checks = [],
    errors = [],
    csp = [],
    traffic = [],
    httpFailures = []
  let failed = false,
    closing,
    nextRequest = 0,
    phase = 'browser'
  const close = () =>
    (closing ??= (async () => {
      for (const context of contexts.reverse())
        await context.close().catch(() => {
          failed = true
        })
      await browser.close().catch(() => {
        failed = true
      })
    })())
  const stop = () => {
    failed = true
    void close()
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  const timer = setTimeout(stop, 760000)
  async function page() {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 960 },
    })
    contexts.push(context)
    await context.route('**/api/v1/**', async (route) => {
      const wait = Math.max(0, nextRequest - Date.now())
      nextRequest = Date.now() + wait + 180
      if (wait) await new Promise((done) => setTimeout(done, wait))
      await route.continue()
    })
    const p = await context.newPage()
    p.setDefaultTimeout(20000)
    p.on('response', (r) => {
      const path = new URL(r.url()).pathname
      if (r.status() >= 400 && path.startsWith('/api/v1/')) {
        httpFailures.push({ area: path.split('/')[3], status: r.status() })
        if (httpFailures.length > 20) httpFailures.shift()
      }
    })
    p.on('pageerror', (e) => errors.push(e.name))
    p.on('request', (r) =>
      traffic.push({ page: p, method: r.method(), path: new URL(r.url()).pathname }),
    )
    await p.addInitScript(() =>
      window.addEventListener('securitypolicyviolation', (e) =>
        console.info('react-csp:' + e.effectiveDirective),
      ),
    )
    p.on('console', (m) => {
      if (m.text().startsWith('react-csp:')) csp.push(m.text().slice(10))
    })
    return p
  }
  async function login(p, account = fixture.admin ?? { login: fixture.login, passwordFile }) {
    assert.equal(statSync(account.passwordFile).mode & 0o077, 0)
    phase = 'login-form'
    await p.goto(origin + '/login')
    await p.getByRole('heading', { name: '欢迎回来', exact: true }).waitFor()
    await p.getByLabel('账户', { exact: true }).fill(account.login)
    await p
      .getByLabel('密码', { exact: true })
      .fill(readFileSync(account.passwordFile, 'utf8').trim())
    await p.getByRole('button', { name: '登录', exact: true }).click()
    phase = 'login-result'
    await p.getByRole('heading', { name: /^(工作台|租户初始化)$/, exact: true }).waitFor()
  }
  async function nav(p, path, title) {
    phase = 'navigate:' + path
    await p.goto(origin + path)
    await p.getByRole('heading', { name: title, exact: true }).waitFor()
  }
  async function choose(p, control, label) {
    await p.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
    await control.click()
    if (await control.isEditable()) await control.fill(label)
    await p
      .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
      .getByText(label, { exact: true })
      .click()
    await p.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
  }
  async function response(p, method, path, submit, status = 200) {
    phase = method + ':' + path
    const waiting = p.waitForResponse(
      (r) => r.request().method() === method && new URL(r.url()).pathname === path,
    )
    await submit()
    const result = await waiting
    assert.equal(result.status(), status)
    return result
  }
  async function directoryFilter(scope, expression) {
    const search = scope.locator('.directory-search:visible')
    const advanced = search.locator('.directory-advanced')
    if (!(await advanced.evaluate((node) => node.open))) await advanced.locator('summary').click()
    await search.getByRole('radio', { name: 'RSQL', exact: true }).check()
    await search.getByRole('textbox', { name: 'RSQL', exact: true }).fill(expression)
    await search.getByRole('button', { name: '应用', exact: true }).click()
  }
  const count = (p, method, path) =>
    traffic.filter((r) => r.page === p && r.method === method && r.path === path).length
  async function finish(error) {
    clearTimeout(timer)
    if (error) failed = true
    if (errors.length || csp.length) failed = true
    await close()
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
    console.log(
      JSON.stringify({
        journey,
        result: failed ? 'failed' : 'passed',
        checks,
        phase,
        httpFailures,
        pageErrors: errors,
        csp,
        failure: error?.name,
        failureLocation: error?.stack?.match(/react-[a-z-]+-browser\.mjs:\d+:\d+/)?.[0],
        failureOperation: error?.message?.match(/^((?:locator|page)\.[A-Za-z]+)/)?.[1],
        strictLocator: error?.message?.includes('strict mode violation') ?? false,
      }),
    )
    if (failed) process.exitCode = 1
  }
  return {
    fixture,
    origin,
    page,
    login,
    nav,
    choose,
    response,
    directoryFilter,
    count,
    checks,
    finish,
    step: (value) => {
      phase = value
    },
  }
}
