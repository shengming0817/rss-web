// Current production UI against a disposable real HTTPS host. No response/credential/trace output.
import { chromium } from 'playwright'
import { readFileSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import process from 'node:process'
import { assertNativeCallback } from './enrollment-callback.mjs'
let browser,
  context,
  phase = 'environment',
  result = 'failed',
  cleanup = 'passed',
  interrupted = false
const coverage = [],
  gaps = []
const temp = mkdtempSync(join(tmpdir(), 'rss-enrollment-browser-'))
async function stop() {
  interrupted = true
  await browser?.close().catch(() => {})
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
const deadline = setTimeout(stop, 180000)
function active() {
  assert.equal(interrupted, false, 'Browser run cancelled')
}
function secret(path) {
  const mode = statSync(path).mode & 0o777
  assert.equal(mode & 0o077, 0)
  return readFileSync(path, 'utf8').trim()
}
try {
  const fixture = JSON.parse(readFileSync(process.env.MDM_ENROLLMENT_BROWSER_FIXTURE, 'utf8')),
    parsed = new URL(fixture.origin)
  assert.equal(parsed.protocol, 'https:')
  assert.equal(parsed.hostname, 'localhost')
  assert.equal(parsed.origin, fixture.origin)
  assert.match(fixture.tenant, /^[0-9a-f-]{36}$/)
  const origin = parsed.origin
  browser = await chromium.launch({ timeout: 10000 })
  active()
  context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN' })
  active()
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  active()
  phase = 'anonymous-downloads'
  await page.goto(`${origin}/downloads/agent`)
  await page.getByRole('heading', { name: '下载 Agent 安装器', exact: true }).waitFor()
  assert.equal(new URL(page.url()).pathname, '/downloads/agent')
  const catalog = await context.request.get(`${origin}/api/v1/agent/enroll/packages`)
  let packages = []
  if (fixture.agentListener === 'disabled') {
    assert.ok([404, 502, 503].includes(catalog.status()))
    await page.locator('[role=alert]').waitFor()
    assert.equal(await page.locator('a[download]').count(), 0)
    coverage.push('anonymous-disabled-listener-failure')
    gaps.push('configured-Agent-listener')
  } else {
    assert.equal(catalog.status(), 200)
    packages = await catalog.json()
  }
  assert.ok(Array.isArray(packages))
  for (const item of packages) {
    await page.getByLabel('平台', { exact: true }).selectOption(item.target.platform)
    await page.getByLabel('原生架构', { exact: true }).selectOption(item.target.architecture)
    await page.getByLabel('发布渠道', { exact: true }).selectOption(item.channel)
    const link = page.locator(`a[href="/api/v1/agent/enroll/packages/${item.releaseId}/content"]`)
    const download = page.waitForEvent('download')
    await link.click()
    const file = await download
    assert.equal(file.suggestedFilename(), item.filename)
    const path = join(temp, item.releaseId)
    await file.saveAs(path)
    assert.equal(statSync(path).size, item.length)
    assert.equal(
      createHash('sha256').update(readFileSync(path)).digest('hex'),
      item.installerSha256.map((n) => n.toString(16).padStart(2, '0')).join(''),
    )
  }
  if (fixture.agentListener !== 'disabled')
    coverage.push(packages.length ? 'anonymous-real-installers' : 'anonymous-empty-catalog')
  if (!packages.length) gaps.push('published-real-installers')
  assert.equal(
    (await context.request.get(`${origin}/api/v1/agent-enrollment-settings`)).status(),
    401,
  )
  coverage.push('anonymous-private-boundary')
  async function login(account) {
    active()
    await page.goto(`${origin}/tenants/${fixture.tenant}/login`)
    await page.locator('#login-name').fill(account.login)
    await page.locator('#login-password').fill(secret(account.passwordFile))
    await page.locator('form').evaluate((f) => f.requestSubmit())
    await page.waitForURL(/workspace/)
  }
  if (fixture.reader) {
    active()
    phase = 'ordinary-user'
    await login(fixture.reader)
    assert.equal(await page.getByRole('link', { name: 'Agent 安装配置', exact: true }).count(), 0)
    await page.goto(`${origin}/tenants/${fixture.tenant}/agent-configurations`)
    await page.getByText('请求被拒绝', { exact: false }).waitFor()
    assert.equal(await page.locator('form').count(), 0)
    coverage.push('ordinary-user-no-configuration-form')
  } else gaps.push('ordinary-user-permissions')
  if (fixture.admin) {
    active()
    phase = 'organization-read'
    await login(fixture.admin)
    async function organizationRead(route) {
      active()
      const api =
        route === 'windows-entra' ? '/api/v1/windows/entra-policy' : '/api/v1/apple/organizations'
      const response = page.waitForResponse(
        (value) => value.request().method() === 'GET' && new URL(value.url()).pathname === api,
      )
      await page.goto(`${origin}/tenants/${fixture.tenant}/operations/${route}`)
      const read = await response
      assert.equal(read.status(), 200)
      const facts = await read.json()
      await page.locator('section.device-console[aria-busy=false]').waitFor()
      assert.equal(await page.locator('[role=alert]').count(), 0)
      assert.equal(await page.getByText('请求被拒绝', { exact: false }).count(), 0)
      if (route === 'windows-entra') {
        await page.locator('pre.enrollment-terms').waitFor({ state: 'attached' })
        assert.equal(
          await page.locator('pre.enrollment-terms').textContent(),
          facts.policy.termsText,
        )
      } else {
        assert.ok(Array.isArray(facts.items))
        assert.equal(
          await page.locator('select').first().locator('option').count(),
          facts.items.length + 1,
        )
      }
      assert.equal(new URL(page.url()).pathname, `/tenants/${fixture.tenant}/operations/${route}`)
    }
    for (const route of ['apple-account', 'apple-ade', 'windows-entra'])
      await organizationRead(route)
    coverage.push('authenticated-organization-reads')
    if (fixture.probeOrganizationReadFailure) {
      for (const status of [500, 200]) {
        await page.route('**/api/v1/apple/organizations', (route) =>
          route.fulfill({
            status,
            contentType: 'application/json',
            body:
              status === 500 ? '{"code":"service_unavailable"}' : '{"items":[{"invalid":true}]}',
          }),
        )
        await assert.rejects(() => organizationRead('apple-account'))
        await page.unroute('**/api/v1/apple/organizations')
      }
      coverage.push('organization-read-failure-oracles')
    }
    if (fixture.configurationReady) {
      active()
      phase = 'configuration-lost-response'
      await page.goto(`${origin}/tenants/${fixture.tenant}/agent-configurations`)
      await page.getByRole('button', { name: '生成完整 JSON', exact: true }).waitFor()
      let commits = 0
      await page.route('**/api/v1/agent-configurations', async (route) => {
        if (route.request().method() !== 'POST') return route.continue()
        active()
        const response = await route.fetch({ timeout: 10000 })
        assert.equal(response.status(), 200)
        commits++
        await route.abort('failed')
      })
      active()
      await page.getByRole('button', { name: '生成完整 JSON', exact: true }).click()
      await page.getByText('提交结果未知', { exact: false }).first().waitFor()
      await page.unroute('**/api/v1/agent-configurations')
      await page.getByRole('button', { name: '查询原操作结果', exact: true }).click()
      await page.getByText('后端剩余数量', { exact: true }).waitFor()
      assert.equal(commits, 1)
      assert.equal(await page.locator('a[download="rss-agent-enrollment.json"]').count(), 0)
      await page.getByRole('button', { name: '确认撤销配置', exact: true }).click()
      await page.getByText('revoked', { exact: true }).waitFor()
      coverage.push('configuration-unknown-query-and-revoke')
    } else gaps.push('configuration-PKI-and-signer')
  } else gaps.push('administrator-organization-configuration')
  if (fixture.nativeStart) {
    active()
    phase = 'native-tou'
    await context.clearCookies()
    const flow = fixture.nativeStart,
      requestId = randomUUID(),
      query = new URLSearchParams({
        redirect_uri: flow.callback,
        'client-request-id': requestId,
        'api-version': '1.0',
        ...(flow.join ? { mode: 'azureadjoin' } : {}),
      })
    const start = await context.request.get(`${origin}/api/v1/windows/entra/terms?${query}`, {
      headers: { Authorization: `Bearer ${secret(flow.tokenFile)}` },
      maxRedirects: 0,
    })
    assert.equal(start.status(), 302)
    await page.goto(`${origin}/enrollment/windows/entra/terms`)
    await page.locator('form[action="/api/v1/windows/entra/terms/finish"]').waitFor()
    assert.equal(await page.locator('pre img, pre script').count(), 0)
    assert.equal(await page.locator('button[value=false]').count(), flow.join ? 0 : 1)
    let finished = false
    await page.route('**/api/v1/windows/entra/terms/finish', async (route) => {
      assert.equal(route.request().method(), 'POST')
      active()
      const response = await route.fetch({ maxRedirects: 0, timeout: 10000 })
      assert.equal(response.status(), 302)
      const callback = new URL(response.headers()['location'])
      assertNativeCallback(callback, flow.callback)
      assert.equal(callback.searchParams.get('IsAccepted'), 'true')
      assert.equal(callback.searchParams.get('client-request-id'), requestId)
      assert.ok(callback.searchParams.get('OpaqueBlob'))
      finished = true
      await route.fulfill({ status: 200, contentType: 'text/plain', body: 'completed' })
    })
    await page.getByRole('button', { name: '接受并继续', exact: true }).click()
    await page.getByText('completed', { exact: true }).waitFor()
    assert.equal(finished, true)
    coverage.push('real-browser-native-tou-form')
  } else gaps.push('native-Entra-start-material')
  gaps.push('native-OS-installation-and-Apple-Entra-interoperability')
  assert.equal(interrupted, false)
  result = 'passed'
} catch {
  result = 'failed'
} finally {
  clearTimeout(deadline)
  process.removeListener('SIGINT', stop)
  process.removeListener('SIGTERM', stop)
  for (const resource of [context, browser]) {
    try {
      let timer
      try {
        await Promise.race([
          resource?.close(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('Cleanup deadline')), 10000)
          }),
        ])
      } finally {
        clearTimeout(timer)
      }
    } catch {
      cleanup = 'failed'
    }
  }
  try {
    rmSync(temp, { recursive: true, force: true })
  } catch {
    cleanup = 'failed'
  }
  console.log(JSON.stringify({ result, phase, cleanup, coverage, gaps, interrupted }))
  if (result !== 'passed' || cleanup !== 'passed' || interrupted) process.exitCode = 1
}
