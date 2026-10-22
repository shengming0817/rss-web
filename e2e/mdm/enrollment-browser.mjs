import { exercisePki } from './pki-browser.mjs'
// Current production UI against a disposable real HTTPS host. No response/credential/trace output.
import { chromium } from 'playwright'
import { readFileSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { assertNativeCallback } from './enrollment-callback.mjs'
let browser,
  context,
  employeeContext,
  phase = 'environment',
  result = 'failed',
  cleanup = 'passed',
  interrupted = false,
  failure,
  collectorTerminate
const coverage = [],
  gaps = [],
  httpFailures = []
const temp = mkdtempSync(join(tmpdir(), 'rss-enrollment-browser-'))
async function stop() {
  interrupted = true
  collectorTerminate?.()
  await browser?.close().catch(() => {})
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
const deadline = setTimeout(stop, 300000)
function active() {
  assert.equal(interrupted, false, 'Browser run cancelled')
}
// Full production bootstraps share the gateway's per-peer budget across contexts.
function observe(target) {
  target.on('response', (response) => {
    if (response.status() >= 400 && httpFailures.length < 64)
      httpFailures.push({
        status: response.status(),
        area: new URL(response.url()).pathname.split('/')[3] ?? 'page',
      })
  })
}
async function go(target, url) {
  await delay(1500)
  active()
  await target.goto(url)
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
  async function freshPage() {
    await context?.close()
    context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN' })
    const target = await context.newPage()
    observe(target)
    target.setDefaultTimeout(10000)
    return target
  }
  let page = await freshPage()
  active()
  phase = 'anonymous-downloads'
  await go(page, `${origin}/downloads/agent`)
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
  let downloadedInstallers = 0
  for (const item of packages) {
    await page.getByLabel('平台').selectOption(item.target.platform)
    await page.getByLabel('原生架构').selectOption(item.target.architecture)
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
    downloadedInstallers++
  }
  if (fixture.agentListener !== 'disabled')
    coverage.push(
      downloadedInstallers
        ? 'anonymous-real-installers'
        : packages.length
          ? 'anonymous-no-supported-installers'
          : 'anonymous-empty-catalog',
    )
  if (!downloadedInstallers) gaps.push('published-real-installers')
  assert.equal(
    (await context.request.get(`${origin}/api/v1/agent-enrollment-settings`)).status(),
    401,
  )
  coverage.push('anonymous-private-boundary')
  async function login(account, target) {
    active()
    if (!target) {
      page = await freshPage()
      target = page
    }
    await go(target, `${origin}/login`)
    await target.locator('#login-name').fill(account.login)
    await target.locator('#login-password').fill(secret(account.passwordFile))
    await target.locator('form').evaluate((f) => f.requestSubmit())
    await target.waitForURL((url) => /\/(?:workspace|settings\/guide)$/.test(url.pathname))
  }
  if (fixture.reader) {
    active()
    phase = 'ordinary-user'
    await login(fixture.reader)
    assert.equal(await page.getByRole('link', { name: 'Agent 安装配置', exact: true }).count(), 0)
    await go(page, `${origin}/tenants/${fixture.tenant}/agent-configurations`)
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
      await go(page, `${origin}/tenants/${fixture.tenant}/operations/${route}`)
      const read = await response
      assert.equal(read.status(), 200)
      const facts = await read.json()
      await page.locator('section.console-page:not([aria-busy="true"])').waitFor()
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
    const organizationRoutes = ['apple-account', 'apple-ade', 'windows-entra']
    const enabledRoutes = fixture.organizationReadRoutes ?? organizationRoutes
    assert.ok(Array.isArray(enabledRoutes))
    assert.equal(new Set(enabledRoutes).size, enabledRoutes.length)
    assert.ok(enabledRoutes.every((route) => organizationRoutes.includes(route)))
    for (const route of enabledRoutes) await organizationRead(route)
    if (enabledRoutes.length) coverage.push('authenticated-organization-reads')
    for (const route of organizationRoutes)
      if (!enabledRoutes.includes(route)) gaps.push(`configured-${route}-backend`)
    if (fixture.probeOrganizationReadFailure) {
      for (const status of [500, 200]) {
        let served = false
        await page.route('**/api/v1/apple/organizations', (route) => {
          served = true
          return route.fulfill({
            status,
            contentType: 'application/json',
            body:
              status === 500 ? '{"code":"service_unavailable"}' : '{"items":[{"invalid":true}]}',
          })
        })
        await assert.rejects(() => organizationRead('apple-account'))
        assert.equal(served, true)
        await page.unroute('**/api/v1/apple/organizations')
      }
      coverage.push('organization-read-failure-oracles')
    }
    if (fixture.configurationReady) {
      active()
      phase = 'configuration-readiness'
      const channelFacts = await context.request.get(`${origin}/api/v1/registration-channels`)
      if (channelFacts.status() !== 200) {
        const body = await channelFacts.json().catch(() => ({}))
        failure = {
          apiCode:
            typeof body.code === 'string' && /^[a-z_]{1,64}$/.test(body.code)
              ? body.code
              : 'invalid',
        }
      }
      assert.equal(channelFacts.status(), 200)
      const agentFacts = (await channelFacts.json()).channels.find((c) => c.channel === 'agent')
      assert.equal(agentFacts.availability, 'ready')
      assert.equal(agentFacts.admission, 'allowed')
      phase = 'configuration-lost-response'
      await go(page, `${origin}/tenants/${fixture.tenant}/agent-configurations`)
      await page.locator('summary').filter({ hasText: '生成完整 JSON' }).click()
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
      const found = page.waitForResponse(
        (r) =>
          r.request().method() === 'GET' &&
          new URL(r.url()).pathname.startsWith('/api/v1/agent-configuration-operations/'),
      )
      await page.getByRole('button', { name: '查询原操作结果', exact: true }).click()
      const metadataResponse = await found
      assert.equal(metadataResponse.status(), 200)
      const metadata = await metadataResponse.json()
      await page.getByText('后端剩余数量', { exact: true }).waitFor()
      assert.equal(commits, 1)
      assert.equal(await page.locator('a[download="rss-agent-enrollment.json"]').count(), 0)
      phase = 'configuration-revoke'
      const revocation = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          new URL(r.url()).pathname ===
            `/api/v1/agent-configurations/${metadata.configuration.configurationId}/revoke`,
      )
      const readAfter = page.waitForResponse(
        (r) =>
          r.request().method() === 'GET' &&
          new URL(r.url()).pathname ===
            `/api/v1/agent-configurations/${metadata.configuration.configurationId}`,
      )
      await page.getByRole('button', { name: '确认撤销配置', exact: true }).click()
      assert.equal((await revocation).status(), 204)
      const reloaded = await readAfter
      assert.equal(reloaded.status(), 200)
      assert.equal((await reloaded.json()).state, 'revoked')
      await page.getByText('revoked', { exact: true }).waitFor()
      coverage.push('configuration-unknown-query-and-revoke')
    } else gaps.push('configuration-PKI-and-signer')
  } else gaps.push('administrator-organization-configuration')
  if (fixture.admission) {
    active()
    phase = 'admission-two-sessions'
    assert.ok(fixture.admin && fixture.reader && fixture.configurationReady)
    employeeContext = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN' })
    const employee = await employeeContext.newPage()
    observe(employee)
    employee.setDefaultTimeout(10000)
    await login(fixture.reader, employee)
    await go(employee, `${origin}/tenants/${fixture.tenant}/registration-quotas`)
    await employee.getByRole('heading', { name: '注册通道与准入', exact: true }).waitFor()
    assert.equal(await employee.getByRole('button', { name: '暂停新注册', exact: true }).count(), 0)
    coverage.push('ordinary-user-readonly-channels')
    const adminChannel = (name) =>
      page.locator('article').filter({ has: page.getByRole('heading', { name, exact: true }) })
    async function admission(action) {
      await delay(1500)
      active()
      const response = page.waitForResponse(
        (r) =>
          r.request().method() === 'PUT' &&
          new URL(r.url()).pathname === '/api/v1/registration-channels/windows_mdm/admission',
      )
      await adminChannel('Windows MDM').getByRole('button', { name: action, exact: true }).click()
      assert.equal((await response).status(), 200)
      await adminChannel('Windows MDM')
        .getByRole('button', {
          name: action === '暂停新注册' ? '恢复新注册' : '暂停新注册',
          exact: true,
        })
        .waitFor()
    }
    await go(page, `${origin}/tenants/${fixture.tenant}/registration-quotas`)
    await adminChannel('Windows MDM')
      .getByRole('button', { name: '暂停新注册', exact: true })
      .waitFor()
    await go(employee, `${origin}/tenants/${fixture.tenant}/my-enrollments`)
    const create = employee.getByRole('button', { name: '授权注册', exact: true })
    async function prepare() {
      await employee.getByRole('button', { name: '生成一次性交付口令', exact: true }).click()
      await employee.locator('form').first().locator('input[type=checkbox]').check()
    }
    await prepare()
    await admission('暂停新注册')
    // No route interception: the stale page must reach the actual server and be rejected.
    const rejected = employee.waitForResponse(
      (r) =>
        r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/self-enrollments',
    )
    await create.click()
    const rejection = await rejected
    assert.equal(rejection.status(), 409)
    assert.equal((await rejection.json()).code, 'enrollment_paused')
    await employee.getByText('此通道已暂停新注册，请刷新通道状态。', { exact: true }).waitFor()
    await employee.waitForFunction(() =>
      [...document.querySelectorAll('button')].some(
        (b) => b.textContent.trim() === '授权注册' && b.disabled,
      ),
    )
    coverage.push('stale-page-real-admission-rejection-and-refresh')
    assert.ok(fixture.existingDevice)
    const existing = await context.request.get(
      `${origin}/api/v1/devices/${fixture.existingDevice}/registrations`,
    )
    assert.equal(existing.status(), 200)
    assert.ok((await existing.json()).items.some((r) => r.status === 'active'))
    coverage.push('established-device-management-reads-during-pause')
    // The Agent channel remains available while Windows admission is paused.
    const agent = page
    await go(agent, `${origin}/tenants/${fixture.tenant}/agent-configurations`)
    await agent.locator('summary').filter({ hasText: '生成完整 JSON' }).click()
    const issued = agent.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        new URL(r.url()).pathname === '/api/v1/agent-configurations',
    )
    await agent.getByRole('button', { name: '生成完整 JSON', exact: true }).click()
    assert.equal((await issued).status(), 200)
    const delivery = agent.locator('a[download="rss-agent-enrollment.json"]')
    await delivery.waitFor()
    const downloaded = agent.waitForEvent('download')
    await delivery.click()
    const file = await downloaded
    const filename = join(temp, 'configuration.json')
    await file.saveAs(filename)
    const json = JSON.parse(readFileSync(filename, 'utf8'))
    assert.ok(json.configuration && json.secret && json.signature)
    rmSync(filename)
    coverage.push('other-channel-continues-and-complete-JSON-download')
    await go(page, `${origin}/tenants/${fixture.tenant}/registration-quotas`)
    await admission('恢复新注册')
    await employee.getByRole('button', { name: '刷新状态与额度', exact: true }).click()
    await prepare()
    const created = employee.waitForResponse(
      (r) =>
        r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/self-enrollments',
    )
    await create.click()
    const creation = await created
    assert.equal(creation.status(), 200)
    const receipt = await creation.json()
    await employee
      .getByRole('heading', { name: '系统原生注册步骤与当前事实', exact: true })
      .waitFor()
    await admission('暂停新注册')
    // Existing authorization stays readable/cancellable; pausing does not rewrite its expiry.
    const read = await employeeContext.request.get(
      `${origin}/api/v1/enrollments/${receipt.enrollmentId}`,
    )
    assert.equal(read.status(), 200)
    const current = await read.json()
    assert.equal(current.expiresAt, receipt.expiresAt)
    const cancelled = employee.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        new URL(r.url()).pathname === `/api/v1/enrollments/${receipt.enrollmentId}/cancel`,
    )
    await employee.getByRole('button', { name: '取消', exact: true }).click()
    const cancellation = await cancelled
    assert.equal(cancellation.status(), 200)
    const cancellationReceipt = await cancellation.json()
    assert.equal(cancellationReceipt.enrollmentId, receipt.enrollmentId)
    assert.equal(cancellationReceipt.status, 'cancelled')
    const confirmed = await employeeContext.request.get(
      `${origin}/api/v1/enrollments/${receipt.enrollmentId}`,
    )
    assert.equal(confirmed.status(), 200)
    assert.equal((await confirmed.json()).status, 'cancelled')
    await admission('恢复新注册')
    coverage.push('admission-restored-create-original-expiry-and-confirmed-cancel-during-pause')
    gaps.push('established-device-native-protocol-contact')
  } else gaps.push('two-session-registration-admission')
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
    await go(page, `${origin}/enrollment/windows/entra/terms`)
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
  if (fixture.pki) { phase = 'administrator-pki-and-recovery'; await login(fixture.admin); await exercisePki({page,context,fixture,coverage,temp,go,collectorLifecycle:{interrupted:()=>interrupted,onChild:(_child,terminate)=>{collectorTerminate=terminate;if(interrupted)terminate()},onRelease:()=>{collectorTerminate=undefined}}}) }
  gaps.push('native-OS-installation-and-Apple-Entra-interoperability')
  assert.equal(interrupted, false)
  result = 'passed'
} catch (error) {
  failure = {
    ...failure,
    kind: error.name,
    location: error.stack?.match(/enrollment-browser\.mjs:([0-9]+):([0-9]+)/)?.slice(1),
    operator: error.code === 'ERR_ASSERTION' ? error.operator : undefined,
    actual:
      typeof error.actual === 'number' || typeof error.actual === 'boolean'
        ? error.actual
        : undefined,
    expected:
      typeof error.expected === 'number' || typeof error.expected === 'boolean'
        ? error.expected
        : undefined,
  }
  result = 'failed'
} finally {
  // exercisePki awaits the collector close/release before this cleanup owns the host.
  collectorTerminate?.()
  clearTimeout(deadline)
  process.removeListener('SIGINT', stop)
  process.removeListener('SIGTERM', stop)
  for (const resource of [employeeContext, context, browser]) {
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
  console.log(
    JSON.stringify({
      result,
      phase,
      cleanup,
      coverage,
      gaps,
      interrupted,
      failure,
      httpFailures: failure ? httpFailures : undefined,
    }),
  )
  if (result !== 'passed' || cleanup !== 'passed' || interrupted) process.exitCode = 1
}
