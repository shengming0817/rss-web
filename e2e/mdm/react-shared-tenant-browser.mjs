import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { realBrowser } from './react-mdm-browser.mjs'

async function holdRead(page, url) {
  const received = Promise.withResolvers()
  const release = Promise.withResolvers()
  const settled = Promise.withResolvers()
  await page.route(
    url,
    async (route) => {
      let response
      try {
        response = await route.fetch({ maxRetries: 0 })
        received.resolve(response.status())
        await release.promise
        await route.fulfill({ response })
      } catch {
        received.resolve(undefined)
        await route.abort('failed').catch(() => undefined)
      } finally {
        await response?.dispose().catch(() => undefined)
        settled.resolve()
      }
    },
    { times: 1 },
  )
  return { received: received.promise, release: release.resolve, settled: settled.promise }
}

const run = await realBrowser('MDM_SHARED_BROWSER_FIXTURE', 'react-shared-tenant', {
  ignoreDefaultArgs: ['--disable-back-forward-cache'],
})
let failure
try {
  const { fixture, origin, checks } = run
  const a = await run.page(),
    manager = await run.page()
  const path = (tenant) => '/tenants/' + tenant
  const api = (tenant, suffix) => origin + '/api/v1' + path(tenant) + suffix
  const ready = async (p) => {
    const deadline = Date.now() + 120000
    while (Date.now() < deadline) {
      const response = await p.request.get(origin + '/readyz')
      if (response.ok()) {
        const body = await response.json()
        return body.observation?.processGeneration
      }
      assert.equal(response.status(), 503)
      await new Promise((resolve) => setTimeout(resolve, 1100))
    }
    assert.fail('fixed candidate did not recover readiness')
  }
  const signIn = async (p, login, password) => {
    await p.getByLabel('账户', { exact: true }).fill(login)
    await p.getByLabel('密码', { exact: true }).fill(password)
    await p.getByRole('button', { name: '登录', exact: true }).click()
  }
  run.step('tenant-a')
  await run.login(a)
  assert.equal((await a.request.get(api(fixture.tenant, '/resources'))).status(), 200)
  const before = await ready(a)
  assert.ok(before)
  await run.nav(a, '/enroll', '设备注册')
  const packageRead = a.waitForResponse((r) => {
    const url = new URL(r.url())
    return (
      url.origin === origin &&
      url.pathname === '/api/v1/agent/enroll/packages' &&
      url.searchParams.get('tenantId') === fixture.tenant
    )
  })
  await a.getByRole('link', { name: '公开 Agent 安装包', exact: true }).click()
  const packages = await packageRead
  assert.ok([200, 403].includes(packages.status()))
  await a.getByRole('heading', { name: 'Agent 安装包', exact: true }).waitFor()
  if (packages.status() === 403) {
    await a
      .getByRole('alert')
      .filter({ hasText: /没有此操作权限|无法读取当前数据/ })
      .waitFor()
    checks.push('public-installers-rejected-by-candidate')
  }
  checks.push('scoped-public-download-link')
  await a.goto(origin + path(fixture.tenant) + '/setup')
  await a.getByRole('button', { name: '保存意图', exact: true }).waitFor()
  const retainedA = await run.page(a.context())
  await retainedA.goto(origin + path(fixture.tenant) + '/setup')
  await retainedA.getByRole('button', { name: '保存意图', exact: true }).waitFor()

  await run.choose(a, a.getByRole('combobox', { name: '邮件', exact: true }), '显式跳过')
  const draft = a.getByRole('textbox', { name: '邮件 跳过原因', exact: true })
  await draft.fill('A-only unsaved draft')
  const settingsPath = '/api/v1' + path(fixture.tenant) + '/settings/first-use'
  const originalReads = run.count(a, 'GET', settingsPath)
  const validation = await holdRead(
    a,
    origin + '/api/v1/identity' + path(fixture.tenant) + '/session',
  )
  await a.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  try {
    assert.equal(await validation.received, 200)
    await draft.waitFor({ state: 'hidden' })
  } finally {
    validation.release()
  }
  await draft.waitFor()
  assert.equal(await draft.inputValue(), 'A-only unsaved draft')
  assert.equal(run.count(a, 'GET', settingsPath), originalReads)
  checks.push('same-session-revalidation-retains-draft')

  run.step('provision-original-operation')
  await manager.goto(origin + '/platform/login')
  await signIn(manager, 'platform', readFileSync(fixture.platformPasswordFile, 'utf8').trim())
  await manager.getByRole('link', { name: '租户管理', exact: true }).first().click()
  await manager.getByRole('button', { name: '创建租户', exact: true }).click()
  const dialog = manager.getByRole('dialog', { name: '创建并供应业务租户' })
  const password = 'Disposable-' + randomUUID()
  await dialog.getByLabel('租户名称', { exact: true }).fill('Shared browser tenant')
  await dialog.getByLabel('初始管理员登录名', { exact: true }).fill('tenant-admin')
  await dialog.getByLabel('初始管理员密码', { exact: true }).fill(password)
  const provisioning = '/api/v1/tenant-administration/provisionings'
  let operation, intercepted
  const submission = new Promise((resolve) => {
    intercepted = resolve
  })
  const lose = async (route) => {
    if (route.request().method() !== 'POST') return route.fallback().catch(() => undefined)
    operation = route.request().headers()['idempotency-key']
    let status
    try {
      const response = await route.fetch({ maxRetries: 0 })
      status = response.status()
      await response.dispose()
      await route.abort('failed')
    } catch {
      status = undefined
      await route.abort('failed').catch(() => undefined)
    } finally {
      intercepted(status)
    }
  }
  await manager.route('**' + provisioning, lose)
  await dialog.getByRole('button', { name: '创建并供应租户', exact: true }).click()
  await dialog.getByRole('button', { name: '查询原供应操作', exact: true }).waitFor()
  const committed = await submission
  assert.ok([200, 202].includes(committed), 'provisioning interception HTTP ' + committed)
  await manager.unroute('**' + provisioning, lose)
  const entry = dialog.getByRole('link', { name: '进入业务租户', exact: false })
  const deadline = Date.now() + 120000
  let progress
  while (!(await entry.count()) && Date.now() < deadline) {
    const response = manager.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        new URL(r.url()).pathname === provisioning + '/' + operation,
    )
    await dialog.getByRole('button', { name: '查询原供应操作', exact: true }).click()
    const original = await response
    assert.equal(original.status(), 200)
    progress = (await original.json()).result
    assert.ok(['pending', 'blocked', 'configured'].includes(progress.phase))
    await entry.waitFor({ timeout: 1200 }).catch(() => undefined)
  }
  assert.ok(await entry.count(), 'provisioning entry missing after ' + progress?.phase)
  assert.equal(run.count(manager, 'POST', provisioning), 1)
  assert.ok(operation)
  const href = await entry.getAttribute('href')
  assert.match(href, /^\/tenants\/[0-9a-f-]{36}$/)
  const tenantB = href.split('/')[2]
  assert.notEqual(tenantB, fixture.tenant)
  assert.ok([401, 403].includes((await a.request.get(api(tenantB, '/resources'))).status()))
  assert.ok([401, 403].includes((await manager.request.get(api(tenantB, '/resources'))).status()))
  checks.push('original-provisioning-read-without-write-replay')

  run.step('tenant-b')
  const lateRead = await holdRead(retainedA, api(fixture.tenant, '/settings/first-use'))
  await retainedA.getByRole('button', { name: '刷新当前状态', exact: true }).click()
  assert.equal(await lateRead.received, 200)
  await entry.click()
  await manager.getByRole('heading', { name: '欢迎回来', exact: true }).waitFor()
  await a.goto(origin + href)
  await a.getByRole('heading', { name: '欢迎回来', exact: true }).waitFor()
  const unknown = await a.request.get(api(randomUUID(), '/resources'))
  // The fixed backend can report the missing execution scope as unavailable.
  assert.ok(
    [401, 403, 404, 503].includes(unknown.status()),
    'unknown tenant HTTP ' + unknown.status(),
  )
  await signIn(a, 'tenant-admin', password)
  await a.waitForURL((url) => url.pathname === href + '/setup')
  assert.equal(await a.getByRole('textbox', { name: '邮件 跳过原因', exact: true }).count(), 0)
  const skip = a.getByRole('textbox', { name: '邮件 跳过原因', exact: true })
  await run.choose(a, a.getByRole('combobox', { name: '邮件', exact: true }), '显式跳过')
  await skip.fill('This tenant does not use mail')
  await run.response(a, 'PUT', '/api/v1/tenants/' + tenantB + '/settings/first-use', () =>
    a.getByRole('button', { name: '保存意图', exact: true }).click(),
  )
  await a.reload()
  await skip.waitFor()
  assert.equal(await skip.inputValue(), 'This tenant does not use mail')
  assert.equal((await a.request.get(api(tenantB, '/resources'))).status(), 200)
  assert.ok([401, 403].includes((await a.request.get(api(fixture.tenant, '/resources'))).status()))
  assert.equal(await ready(a), before)
  await retainedA.bringToFront()
  // Headless Chromium can keep both tabs visible. Exercise the same visibility handler.
  await retainedA.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  try {
    await retainedA.getByRole('heading', { name: '欢迎回来', exact: true }).waitFor()
  } finally {
    lateRead.release()
  }
  await lateRead.settled
  assert.equal(await retainedA.getByRole('heading', { name: '租户初始化', exact: true }).count(), 0)
  checks.push('tenant-change-fences-in-flight-old-response')
  await a.bringToFront()
  await a.goto(origin + path(fixture.tenant) + '/setup')
  await a.getByRole('heading', { name: '欢迎回来', exact: true }).waitFor()
  await a.goBack()
  await skip.waitFor()
  assert.equal(await skip.inputValue(), 'This tenant does not use mail')
  checks.push(
    'same-origin-tenants',
    'cross-tenant-session-and-history',
    'unchanged-process-generation',
  )
} catch (error) {
  failure = error
}
await run.finish(failure)
