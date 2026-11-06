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
  const path = (value) => origin + value
  run.step('independent-login')
  await p.goto(path('/login'))
  await p.locator('#da-login').fill(f.login)
  await p.locator('#da-password').fill(readFileSync(f.passwordFile, 'utf8').trim())
  await button('登录').click()
  await p.getByRole('heading', { name: 'Device Access', exact: true }).waitFor()
  checks.push('independent-da-cookie-session-and-host-config')
  run.step('computer-directory-and-detail')
  const directory = p.waitForResponse(
    (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/v1/device-views',
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
  await button('注册 WebAuthn 凭据').click()
  await p.getByLabel('凭据名称', { exact: true }).fill('Browser DA credential')
  const registered = p.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname.endsWith('/webauthn/register/finish'),
  )
  await button('明确注册').click()
  assert.equal((await registered).status(), 200)
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
      new URL(r.url()).pathname === '/api/v1/device-access/enterprise/configuration',
  )
  await p.goto(path('/applications'))
  const response = await enterprise
  if (response.status() === 403)
    blocked.push({ area: 'da-enterprise-success', status: 403, issue: 3138 })
  else assert.equal(response.status(), 200)
  const binding = await p.request.get(
    path(`/api/v1/devices/${f.executionAccess.device}/device-access?limit=1`),
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
