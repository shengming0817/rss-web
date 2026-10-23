// Production Vue against real PG/Identity/HTTPS; faults only discard browser responses.
import { chromium } from 'playwright'
import { authorizationJourney } from './authorization-browser.mjs'
import { readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
import assert from 'node:assert/strict'
import process from 'node:process'
let browser,
  context,
  page,
  closing,
  phase = 'environment',
  result = 'failed',
  backendRevision
const coverage = []
const stop = () =>
  (closing ??= Promise.resolve().then(async () => {
    await context?.unrouteAll({ behavior: 'ignoreErrors' })
    await browser?.close()
  }))
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
  context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN' })
  page = await context.newPage()
  const pageErrors = []
  page.setDefaultTimeout(20000)
  page.on('pageerror', (error) => pageErrors.push(error.name))
  let next = 0
  await context.route('**/api/v1/**', async (route) => {
    const at = Math.max(Date.now(), next)
    next = at + 200
    if (at > Date.now()) await new Promise((r) => setTimeout(r, at - Date.now()))
    await route.continue().catch(() => {})
  })
  const login = async (base, tenant, name, secret) => {
    await page.goto(`${base}${tenant === f.managementTenant ? '/platform/login' : '/login'}`)
    await page.locator('#login-name').fill(name)
    await page.locator('#login-password').fill(secret)
    await page.locator('form').first().getByRole('button', { name: '登录', exact: true }).click()
    await page.waitForURL((url) => !url.pathname.endsWith('/login'))
  }
  const body = () => page.locator('body')
  const step = async (label) => {
    await page.getByRole('button').filter({ hasText: label }).click()
  }
  if (f.compose) {
    const retired = []
    page.on('request', (request) => {
      if (/\/policies\/(approvals|workflows)(?:[/?]|$)/.test(request.url()))
        retired.push(request.url())
    })
    phase = 'first-use-entry'
    await page.goto(origin + '/')
    await page.locator('#login-name').waitFor()
    assert.equal(new URL(page.url()).pathname, '/login')
    assert.ok(!(await body().textContent()).includes('会话已失效'))
    await page.locator('#login-name').fill(f.login)
    await page.locator('#login-password').fill(password)
    await page.locator('form').first().getByRole('button', { name: '登录', exact: true }).click()
    await page.waitForURL((url) => url.pathname.endsWith('/settings/guide'))
    await page.locator('input[value="agent"]').uncheck()
    await page.locator('input[value="windows_mdm"]').check()
    await step('通知与其他集成')
    await page.locator('[data-capability=smtp]').selectOption('skip')
    await page
      .getByPlaceholder('跳过理由', { exact: true })
      .fill('This installation does not need email')
    phase = 'first-use-original-operation'
    let operation,
      writes = 0,
      discarded = false,
      interceptionFailed = false,
      finishWrite
    const observedWrite = new Promise((resolve) => (finishWrite = resolve))
    const loseReceipt = async (route) => {
      if (route.request().method() !== 'PUT') {
        await route.continue()
        return
      }
      writes++
      operation = route.request().headers()['idempotency-key']
      try {
        const response = await route.fetch({ timeout: 45000, maxRetries: 0 })
        assert.equal(response.status(), 200)
        assert.equal((await response.json()).operationId, operation)
        discarded = true
        await route.abort('failed')
      } catch {
        interceptionFailed = true
        await route.abort('failed').catch(() => {})
      } finally {
        finishWrite()
      }
    }
    await page.route('**/api/v1/settings/first-use', loseReceipt)
    await page.getByRole('button', { name: '保存本次选择', exact: true }).click()
    await observedWrite
    await page.getByRole('button', { name: '查询原操作', exact: true }).waitFor()
    assert.ok(!interceptionFailed && discarded && operation)
    await page.unroute('**/api/v1/settings/first-use', loseReceipt)
    await page.reload()
    await page.waitForURL((url) => !url.searchParams.has('operation'))
    await step('选择管理通道')
    assert.equal(await page.locator('input[value="windows_mdm"]').isChecked(), true)
    await step('通知与其他集成')
    assert.equal(
      await page.getByPlaceholder('跳过理由', { exact: true }).inputValue(),
      'This installation does not need email',
    )
    assert.equal(writes, 1)
    coverage.push(
      'formal-compose-real-idempotent-seed',
      'anonymous-domain-entry-without-false-expiry',
      'authoritative-selection-and-explicit-skip',
      'lost-receipt-reload-original-operation-query',
    )
    phase = 'first-use-domain-facts'
    const channel = () =>
      page
        .locator('article')
        .filter({ has: page.getByRole('heading', { name: 'Windows MDM', exact: true }) })
    await page.goto(`${origin}/tenants/${f.tenant}/registration-quotas`)
    await channel().getByRole('button', { name: '暂停新注册', exact: true }).click()
    await channel().getByRole('button', { name: '恢复新注册', exact: true }).waitFor()
    await page.goto(`${origin}/tenants/${f.tenant}/settings/guide`)
    await step('注册就绪检查')
    await page.locator('[data-first-use-step=windows_mdm]').waitFor()
    assert.equal(await page.getByRole('button', { name: '完成', exact: true }).isDisabled(), true)
    await page.goto(`${origin}/tenants/${f.tenant}/registration-quotas`)
    await channel().getByRole('button', { name: '恢复新注册', exact: true }).click()
    await channel().getByRole('button', { name: '暂停新注册', exact: true }).waitFor()
    await page.goto(`${origin}/tenants/${f.tenant}/settings/guide`)
    await step('注册就绪检查')
    const readiness = await page.request.get(origin + '/api/v1/settings/first-use')
    assert.equal(readiness.status(), 200)
    const facts = await readiness.json()
    const storageReady = facts.steps.some((s) => s.id === 's3' && s.status === 'ready')
    if (!storageReady) {
      assert.equal(await page.getByRole('button', { name: '完成', exact: true }).isDisabled(), true)
      await page
        .getByText('S3 内容仓必须保存、通过资格检查并实际应用，才能完成首次配置。', { exact: true })
        .waitFor()
      coverage.push('real-domain-admission-save-and-observation', 's3-not-ready-blocks-completion')
    } else {
      await page.getByRole('button', { name: '完成', exact: true }).click()
      await page.waitForURL((url) => url.pathname.endsWith('/workspace'))
      coverage.push(
        'real-domain-admission-save-and-observation',
        'required-fact-blocks-completion',
        'backend-confirmed-completion',
      )
      phase = 'first-use-daily-reentry'
      await page.goto(`${origin}/tenants/${f.tenant}/registration-quotas`)
      await channel().getByRole('button', { name: '暂停新注册', exact: true }).click()
      await channel().getByRole('button', { name: '恢复新注册', exact: true }).waitFor()
      await page.goto(`${origin}/tenants/${f.tenant}/sessions`)
      await page.getByRole('button', { name: '退出当前会话', exact: true }).click()
      await page.waitForURL((url) => url.pathname === '/login')
      await login(origin, f.tenant, f.login, password)
      await page.waitForURL((url) => url.pathname.endsWith('/workspace'))
      await page.goto(`${origin}/tenants/${f.tenant}/settings/guide`)
      await page.getByText('首次配置已完成', { exact: true }).waitFor()
      assert.equal(await page.locator('input[value="windows_mdm"]').isDisabled(), true)
      await step('通知与其他集成')
      assert.equal(await page.locator('[data-capability=smtp]').isDisabled(), true)
      coverage.push('relogin-resumes-daily-work-despite-later-degradation')
    }
    phase = 'formal-platform-and-reader'
    await page.goto(`${origin}/tenants/${f.tenant}/settings`)
    await page.locator('[data-setting]').first().waitFor()
    const tenantIds = await page
      .locator('[data-setting]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-setting')))
    await page.goto(origin + '/platform')
    await page.waitForURL((url) => url.pathname === '/platform/login')
    await page.locator('#login-name').fill(f.platformLogin)
    await page.locator('#login-password').fill(readFileSync(f.platformPasswordFile, 'utf8').trim())
    await page.locator('form').first().getByRole('button', { name: '登录', exact: true }).click()
    await page.waitForURL((url) => url.pathname.endsWith('/settings'))
    await page.locator('[data-setting]').first().waitFor()
    const platformIds = await page
      .locator('[data-setting]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-setting')))
    assert.equal(new Set([...tenantIds, ...platformIds]).size, 43)
    assert.equal(await page.getByRole('link', { name: '设备目录', exact: true }).count(), 0)
    await page.goto(`${origin}/tenants/${f.tenant}/settings`)
    await page.waitForURL((url) => url.pathname === '/login')
    await page.locator('#login-name').waitFor()
    const readerContext = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN' })
    try {
      const reader = await readerContext.newPage()
      await reader.goto(origin + '/login')
      await reader.locator('#login-name').fill(f.reader.login)
      await reader
        .locator('#login-password')
        .fill(readFileSync(f.reader.passwordFile, 'utf8').trim())
      await reader.locator('form').getByRole('button', { name: '登录', exact: true }).click()
      await reader.waitForURL((url) => url.pathname.endsWith('/workspace'))
    } finally {
      await readerContext.close()
    }
    assert.deepEqual(retired, [])
    coverage.push(
      'independent-platform-authentication-and-scope',
      'all-43-setting-requirements-retained',
      'ordinary-reader-outside-mandatory-guide',
      'no-retired-approval-or-workflow-requests',
    )
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(origin + '/login')
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    )
    assert.deepEqual(pageErrors, [])
    result = 'passed'
  } else {
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
    await page.locator('input[value=windows_mdm]').waitFor()
    coverage.push('business-directory-and-authoritative-guide-entry')
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
    phase = 'management-authorization'
    await authorizationJourney({ page, context, origin, fixture: f, login, password, coverage })
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
    let finishWrite,
      interceptionFailed = false
    const observedWrite = new Promise((resolve) => (finishWrite = resolve))
    const discard = async (route) => {
      try {
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
        const response = await route.fetch({ timeout: 45000, maxRetries: 0 })
        assert.equal(response.status(), 202)
        receipt = await response.json()
        await route.abort('failed')
        finishWrite()
      } catch {
        // Framework request errors can include credentials; report only the classification.
        interceptionFailed = true
        finishWrite()
        await route.abort('failed').catch(() => {})
      }
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
    await observedWrite
    assert.equal(interceptionFailed, false)
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
    writeFileSync(
      f.targetRequest,
      JSON.stringify({
        tenant: receipt.result.tenantId,
        operation,
        login: 'browser-admin',
        password: newPassword,
      }),
      {
        mode: 0o600,
      },
    )
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
    const denied = await context.request.get(
      target.origin + '/api/v1/tenant-administration/tenants',
    )
    assert.ok([401, 403].includes(denied.status()))
    await page.goto(`${target.origin}/tenants/${f.tenant}/settings`)
    await page.waitForURL((url) => url.pathname === '/auth/error')
    coverage.push('real-second-host-target-login-and-scope-isolation')
    phase = 'task-material'
    await page.goto(`${target.origin}/tenants/${target.tenant}/settings/materials/task`)
    await page.getByRole('button', { name: '生成新版本', exact: true }).click()
    await page.getByText('保存版本 2', { exact: false }).waitFor()
    assert.ok((await body().textContent()).includes('服务器生成密钥不证明设备已经信任'))
    coverage.push('real-server-task-key-generation-with-separate-device-observation')
    let taskDone,
      taskFailed = false,
      taskOperation
    const taskCommitted = new Promise((resolve) => (taskDone = resolve))
    const discardTask = async (route) => {
      try {
        if (route.request().method() !== 'POST') {
          await route.continue()
          return
        }
        taskOperation = route.request().headers()['idempotency-key']
        const response = await route.fetch({ timeout: 45000, maxRetries: 0 })
        assert.equal(response.status(), 200)
        assert.equal((await response.json()).revision, 3)
        await route.abort('failed')
        taskDone()
      } catch {
        taskFailed = true
        taskDone()
        await route.abort('failed').catch(() => {})
      }
    }
    await page.route('**/api/v1/task-signing/trust', discardTask)
    await page.getByRole('button', { name: '生成新版本', exact: true }).click()
    await taskCommitted
    assert.equal(taskFailed, false)
    assert.ok(taskOperation)
    await page.unroute('**/api/v1/task-signing/trust', discardTask)
    await page.getByRole('button', { name: '查询原操作', exact: true }).click()
    await page.getByText('保存版本 3', { exact: false }).waitFor()
    await page.getByRole('button', { name: '生成新版本', exact: true }).click()
    await page.getByText('保存版本 4', { exact: false }).waitFor()
    coverage.push('task-query-recovery-refreshes-current-version-before-next-write')

    phase = 'presentation'
    await page.setViewportSize({ width: 390, height: 844 })
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    )
    assert.deepEqual(pageErrors, [])
    coverage.push('mobile-layout-and-no-page-errors')
    result = 'passed'
  }
} catch (error) {
  console.error(
    JSON.stringify({
      phase,
      result: 'failed',
      location: /settings-browser\.mjs:\d+:\d+/.exec(error?.stack ?? '')?.[0],
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
