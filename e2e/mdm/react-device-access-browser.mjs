// Independent DA artifact through the existing real HTTPS/PG/Identity fixture.
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { realBrowser } from './react-mdm-browser.mjs'

const run = await realBrowser('MDM_DEVICE_BROWSER_FIXTURE', 'react-device-access')
const blocked = []
let failure
try {
  const { fixture: f, origin, checks } = run,
    p = await run.page()
  const button = (name) => p.getByRole('button', { name, exact: true }).filter({ visible: true })
  const base = `/tenants/${f.tenant}`
  const path = (value) => origin + base + value
  run.step('independent-login')
  await p.goto(path('/login'))
  await p.locator('#da-login').fill(f.login)
  await p.locator('#da-password').fill(readFileSync(f.passwordFile, 'utf8').trim())
  await button('登录').click()
  await p.getByRole('heading', { name: 'Device Access', exact: true }).waitFor()
  checks.push('independent-da-cookie-session-and-host-config')
  run.step('computer-directory-and-detail')
  const directory = p.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      new URL(r.url()).pathname === '/api/v1' + base + '/device-views',
  )
  await p.goto(path('/computers'))
  assert.equal((await directory).status(), 200)
  await p.getByRole('heading', { name: '计算机', exact: true }).waitFor()
  await p.goto(path(`/computers/${f.alone}/status`))
  await p.getByRole('heading', { name: f.alone, exact: true }).waitFor()
  await p.getByRole('tab', { name: '诊断与修复', exact: true }).click()
  await p.getByRole('link', { name: '查看此计算机时间线', exact: true }).click()
  await p.getByRole('heading', { name: '计算机时间线', exact: true }).waitFor()
  checks.push('real-device-views-deep-link-and-audit-navigation')
  run.step('account-webauthn')
  await p.goto(path('/security'))
  await p.getByRole('heading', { name: '账户安全', exact: true }).waitFor()
  const cdp = await p.context().newCDPSession(p)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  run.step('same-session-unknown-write')
  const completion = Promise.withResolvers()
  await p.route(
    '**/webauthn/register/finish',
    async (route) => {
      try {
        const result = await route.fetch({ maxRetries: 0 })
        const status = result.status()
        await result.dispose()
        await route.abort('failed')
        completion.resolve(status)
      } catch {
        await route.abort('failed').catch(() => undefined)
        completion.resolve(undefined)
      }
    },
    { times: 1 },
  )
  await button('注册 WebAuthn 凭据').click()
  await p.getByLabel('凭据名称', { exact: true }).fill('Browser DA credential')
  await button('明确注册').click()
  const original = p
    .getByRole('dialog')
    .getByRole('status')
    .filter({ hasText: /原操作.*unknown/ })
  await original.waitFor()
  assert.equal(await completion.promise, 200)
  const operationId = await original.locator('code').textContent()
  assert.match(operationId, /^[a-f0-9-]{36}$/)
  const revalidated = p.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      new URL(r.url()).pathname === '/api/v1/identity' + base + '/session',
  )
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  assert.equal((await revalidated).status(), 200)
  await original.waitFor()
  assert.equal(await original.locator('code').textContent(), operationId)
  assert.equal(await button('明确注册').isDisabled(), true)
  checks.push('same-session-revalidation-retains-unknown-write')
  await p.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })),
  )
  await original.waitFor({ state: 'hidden' })
  const restored = p.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      new URL(r.url()).pathname === '/api/v1/identity' + base + '/session',
  )
  await p.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  )
  assert.equal((await restored).status(), 200)
  const restoredRecord = p
    .locator('.da-surface')
    .getByRole('status')
    .filter({
      hasText: /原操作.*unknown/,
    })
  await restoredRecord.waitFor()
  assert.equal(await restoredRecord.locator('code').textContent(), operationId)
  assert.equal(await button('注册 WebAuthn 凭据').isDisabled(), true)
  checks.push('page-cache-restoration-retains-unknown-write')
  await button('刷新凭据目录').click()
  await p.getByText('Browser DA credential', { exact: true }).waitFor()
  await p
    .getByRole('row')
    .filter({ hasText: 'Browser DA credential' })
    .getByRole('button', { name: '移除', exact: true })
    .click()
  const removed = p.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      /\/webauthn\/credentials\/[^/]+\/remove$/.test(new URL(r.url()).pathname),
  )
  await button('确认移除').click()
  assert.equal((await removed).status(), 200)
  checks.push('real-browser-webauthn-registration-and-purpose-bound-removal')
  run.step('formal-enterprise-and-binding-seams')
  const enterprise = p.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      new URL(r.url()).pathname === '/api/v1' + base + '/device-access/enterprise/configuration',
  )
  await p.goto(path('/applications'))
  const response = await enterprise
  if (response.status() === 403)
    blocked.push({ area: 'da-enterprise-success', status: 403, issue: 3138 })
  else assert.equal(response.status(), 200)
  const binding = await p.request.get(
    `${origin}/api/v1${base}/devices/${f.executionAccess.device}/device-access?limit=1`,
  )
  if (binding.status() === 403)
    blocked.push({ area: 'da-binding-and-material-success', status: 403, issue: 3138 })
  else assert.equal(binding.status(), 200)
  await binding.dispose()
  run.step('responsive-theme-and-unavailable')
  await p.goto(path('/configurations'))
  await p
    .getByText(/正式.*未|尚未.*接|不可用/)
    .first()
    .waitFor()
  await p.getByRole('switch', { name: '深色主题', exact: true }).click()
  assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'dark')
  await p.waitForFunction(() => {
    const surface = document.querySelector('.da-surface')
    const color = surface && getComputedStyle(surface).backgroundColor
    return (
      color &&
      color !== 'rgba(0, 0, 0, 0)' &&
      color
        .match(/[\d.]+/g)
        .slice(0, 3)
        .every((value) => Number(value) < 128)
    )
  })
  const screenshots = mkdtempSync(join(tmpdir(), 'rss-da-react-'))
  await p.screenshot({ path: join(screenshots, 'desktop-dark.png'), animations: 'disabled' })
  await p.setViewportSize({ width: 768, height: 1024 })
  await p.keyboard.press('Tab')
  assert.equal(await p.evaluate(() => document.activeElement !== document.body), true)
  await p.setViewportSize({ width: 390, height: 844 })
  await p.screenshot({ path: join(screenshots, 'mobile-dark.png'), animations: 'disabled' })
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
  checks.push('strict-csp-theme-responsive-and-formal-unavailable')
  run.step('logout')
  await button('退出').click()
  await p.locator('#da-login').waitFor()
  checks.push('real-independent-da-session-logout')
  if (blocked.length) throw new Error('FormalSuccessBlocked')
} catch (error) {
  failure = error
} finally {
  if (blocked.length) console.log(JSON.stringify({ blocked }))
  await run.finish(failure)
}
