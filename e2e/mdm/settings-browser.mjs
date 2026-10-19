// Production Vue against real PG/Identity/HTTPS; faults only discard browser responses.
import { chromium } from 'playwright'
import { readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
import assert from 'node:assert/strict'
import process from 'node:process'
let browser,
  closing,
  phase = 'environment',
  result = 'failed',
  backendRevision
const coverage = []
const stop = () => (closing ??= Promise.resolve().then(() => browser?.close()))
const interrupt = () =>
  void stop().catch(() => {
    process.exitCode = 1
  })
process.once('SIGINT', interrupt)
process.once('SIGTERM', interrupt)
const timer = setTimeout(interrupt, 410000)
try {
  const f = JSON.parse(readFileSync(process.env.MDM_SETTINGS_BROWSER_FIXTURE, 'utf8')),
    origin = new URL(f.origin).origin
  backendRevision = f.backendRevision
  assert.equal(new URL(origin).protocol, 'https:')
  assert.equal(new URL(origin).hostname, 'localhost')
  assert.equal(statSync(f.passwordFile).mode & 0o077, 0)
  const password = readFileSync(f.passwordFile, 'utf8').trim()
  browser = await chromium.launch()
  const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN' }),
    page = await context.newPage(),
    pageErrors = []
  page.setDefaultTimeout(20000)
  page.on('pageerror', (error) => pageErrors.push(error.name))
  let next = 0
  await context.route('**/api/v1/**', async (route) => {
    const at = Math.max(Date.now(), next)
    next = at + 200
    if (at > Date.now()) await new Promise((r) => setTimeout(r, at - Date.now()))
    await route.continue()
  })
  const login = async (base, tenant, name, secret) => {
    await page.goto(`${base}/tenants/${tenant}/login`)
    await page.locator('#login-name').fill(name)
    await page.locator('#login-password').fill(secret)
    await page.locator('form').first().getByRole('button', { name: '登录', exact: true }).click()
    await page.waitForURL((url) => !url.pathname.endsWith('/login'))
  }
  const body = () => page.locator('body')
  phase = 'business-catalog'
  await login(origin, f.tenant, f.login, password)
  await page.goto(`${origin}/tenants/${f.tenant}/settings`)
  await page.locator('[data-setting]').first().waitFor()
  const tenantIds = await page
    .locator('[data-setting]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-setting')))
  assert.ok(
    tenantIds.includes('apns-key') &&
      tenantIds.includes('task-key') &&
      tenantIds.includes('storage'),
  )
  await page.getByRole('link', { name: '配置引导', exact: true }).click()
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  assert.equal(await page.locator('[data-setting="apns-key"]').count(), 0)
  await page.getByRole('checkbox', { name: 'Apple 原生接入', exact: true }).check()
  assert.equal(await page.locator('[data-setting="apns-key"]').count(), 1)
  coverage.push('business-directory-and-selected-channel-guide')
  phase = 'platform-scope'
  await page.goto(origin + '/platform')
  // A business cookie does not authenticate the installation-management tenant.
  await page.waitForURL((url) => url.pathname.endsWith('/login'))
  await page.locator('#login-name').fill(f.login)
  await page.locator('#login-password').fill(password)
  await page.locator('form').first().getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL((url) => url.pathname.endsWith('/settings'))
  await page.locator('[data-setting]').first().waitFor()
  const platformIds = await page
    .locator('[data-setting]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-setting')))
  assert.equal(new Set([...tenantIds, ...platformIds]).size, 43)
  assert.ok(!platformIds.includes('apns-key'))
  assert.equal(await page.getByRole('link', { name: '设备目录', exact: true }).count(), 0)
  coverage.push(
    'all-43-requirements-across-authorized-scopes',
    'platform-independent-local-authentication',
  )
  phase = 'provisioning-unknown'
  await page.goto(`${origin}/tenants/${f.managementTenant}/settings/tenants`)
  const form = page.locator('form').first()
  await form.getByLabel('组织名称', { exact: true }).fill('Browser provisioned team')
  await form.getByLabel('初始管理员登录名', { exact: true }).fill('browser-admin')
  const newPassword = 'Browser-fixture-only-password-2026!'
  await form.getByLabel('初始管理员密码', { exact: true }).fill(newPassword)
  let attempts = 0,
    receipt,
    operation
  const discard = async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    attempts++
    const id = route.request().headers()['idempotency-key']
    if (operation) assert.equal(id, operation)
    operation = id
    if (attempts === 1) {
      await route.abort('failed')
      return
    }
    const response = await route.fetch()
    assert.equal(response.status(), 202)
    receipt = await response.json()
    await route.abort('failed')
  }
  await page.route('**/api/v1/tenant-administration/provisionings', discard)
  await form.getByRole('button', { name: '开通业务租户', exact: true }).click()
  await page.getByRole('button', { name: '按原输入显式重试', exact: true }).waitFor()
  assert.equal(await form.getByLabel('初始管理员密码', { exact: true }).inputValue(), '')
  assert.equal(
    await page.getByRole('button', { name: '按原输入显式重试', exact: true }).isDisabled(),
    true,
  )
  await page.getByRole('button', { name: '查询原操作', exact: true }).first().click()
  await page.waitForFunction(() =>
    [...document.querySelectorAll('button')].some(
      (button) => button.textContent.trim() === '按原输入显式重试' && !button.disabled,
    ),
  )
  await form.getByLabel('初始管理员密码', { exact: true }).fill(newPassword)
  await page.getByRole('button', { name: '按原输入显式重试', exact: true }).click()
  await page.waitForFunction(
    () => document.querySelector('input[autocomplete="new-password"]')?.value === '',
  )
  await page.unroute('**/api/v1/tenant-administration/provisionings', discard)
  assert.equal(attempts, 2)
  assert.equal(receipt.operationId, operation)
  await page.getByRole('button', { name: '查询原操作', exact: true }).first().click()
  await page.getByRole('heading', { name: receipt.result.tenantId, exact: true }).waitFor()
  assert.equal(receipt.result.phase, 'host_pending')
  assert.equal(receipt.result.origin, null)
  assert.ok(receipt.result.administratorId)
  assert.equal(await page.locator('a[href^="https:"]').count(), 0)
  assert.ok(!(await body().textContent()).includes(newPassword))
  coverage.push(
    'unknown-write-lock-query-before-exact-replay',
    'committed-response-loss-query-original',
    'independent-administrator-and-host-pending',
  )
  phase = 'target-host'
  writeFileSync(f.targetRequest, JSON.stringify({ tenant: receipt.result.tenantId, operation }), {
    mode: 0o600,
  })
  const until = Date.now() + 60000
  while (!existsSync(f.targetReady)) {
    assert.ok(Date.now() < until, 'target-host deadline')
    await new Promise((r) => setTimeout(r, 200))
  }
  const target = JSON.parse(readFileSync(f.targetReady, 'utf8'))
  // The fixture starts an actual second host, without fabricating an enabled deployment receipt.
  await page.goto(`${target.origin}/tenants/${target.tenant}/settings`)
  await page.waitForURL((url) => url.pathname.endsWith('/login'))
  await page.locator('#login-name').fill('browser-admin')
  await page.locator('#login-password').fill(newPassword)
  await page.locator('form').first().getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL((url) => !url.pathname.endsWith('/login'))
  await page.goto(`${target.origin}/tenants/${target.tenant}/settings`)
  await page.locator('[data-setting]').first().waitFor()
  const denied = await context.request.get(target.origin + '/api/v1/tenant-administration/tenants')
  assert.ok([401, 403].includes(denied.status()))
  await page.goto(`${target.origin}/tenants/${f.tenant}/settings`)
  await page.waitForURL((url) => url.pathname === '/auth/error')
  coverage.push('real-second-host-target-login-and-scope-isolation')
  phase = 'task-material'
  await page.goto(`${target.origin}/tenants/${target.tenant}/settings/materials/task`)
  await page.getByRole('button', { name: '生成新版本', exact: true }).click()
  await page.getByText('保存版本 1', { exact: false }).waitFor()
  assert.ok((await body().textContent()).includes('服务器生成密钥不证明设备已经信任'))
  coverage.push('real-server-task-key-generation-with-separate-device-observation')
  phase = 'presentation'
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  )
  assert.deepEqual(pageErrors, [])
  coverage.push('mobile-layout-and-no-page-errors')
  result = 'passed'
} catch (error) {
  console.error(
    JSON.stringify({
      phase,
      result: 'failed',
      classification:
        error?.name === 'AssertionError'
          ? 'assertion'
          : error?.name === 'TimeoutError'
            ? 'timeout'
            : 'browser',
    }),
  )
  process.exitCode = 1
} finally {
  clearTimeout(timer)
  let cleanup = true
  try {
    await stop()
  } catch {
    cleanup = false
    process.exitCode = 1
  }
  console.log(
    JSON.stringify({
      phase: 'settings-browser',
      backendRevision,
      result,
      coverage,
      blocked: [
        'external-provider-qualification',
        'controlled-deployment-enabled-receipt',
        'Windows-macOS-device-effects',
      ],
      browserCleanup: cleanup,
    }),
  )
}
