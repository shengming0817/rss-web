// Production UI, real HTTPS product APIs; synthetic registration facts do not prove device effects.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import assert from 'node:assert/strict'
let browser,
  context,
  page,
  phase = 'login',
  result = 'failed',
  interrupted = false
const coverage = [],
  statuses = [],
  pageErrors = []
const timer = setTimeout(() => {
  interrupted = true
  void browser?.close()
}, 300000)
const stop = () => {
  interrupted = true
  void browser?.close()
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
try {
  const fixture = JSON.parse(readFileSync(process.env.MDM_DEVICE_BROWSER_FIXTURE, 'utf8'))
  const origin = new URL(fixture.origin).origin
  assert.equal(new URL(origin).protocol, 'https:')
  assert.equal(new URL(origin).hostname, 'localhost')
  browser = await chromium.launch()
  context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN' })
  page = await context.newPage()
  page.setDefaultTimeout(10000)
  page.on('pageerror', (error) =>
    pageErrors.push({
      name: error.name,
      detail:
        error.message.match(
          /^(?:Cannot read properties of [a-z]+ \(reading '[a-zA-Z]+'\)|Cannot access '[a-zA-Z]+' before initialization|[a-zA-Z.]+ is not a function|Maximum recursive updates)/,
        )?.[0] ?? 'unclassified',
    }),
  )
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname
    if (path.startsWith('/api/v1/')) {
      statuses.push({
        resource: path.split('/')[3],
        method: response.request().method(),
        status: response.status(),
      })
      if (statuses.length > 30) statuses.shift()
    }
  })
  let next = 0
  const pace = async () => {
    const at = Math.max(Date.now(), next)
    next = at + 200
    if (at > Date.now()) await new Promise((resolve) => setTimeout(resolve, at - Date.now()))
  }
  await context.route('**/api/v1/**', async (route) => {
    await pace()
    await route.continue()
  })
  const request = async (method, path, options) => {
    await pace()
    const reply = await context.request[method](origin + path, options)
    statuses.push({ resource: path.split('/')[3], method, status: reply.status() })
    if (statuses.length > 30) statuses.shift()
    return reply
  }
  const get = async (path) => {
    const reply = await request('get', path)
    assert.equal(reply.status(), 200)
    return reply.json()
  }
  const at = (route) => `${origin}/tenants/${fixture.tenant}/${route}`
  await page.goto(origin + '/login')
  await page.locator('#login-name').fill(fixture.login)
  await page.locator('#login-password').fill(readFileSync(fixture.passwordFile, 'utf8').trim())
  const loginReply = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === `/api/v1/identity/tenants/${fixture.tenant}/login`,
  )
  await page.locator('form').evaluate((form) => form.requestSubmit())
  assert.equal((await loginReply).status(), 200)
  await page.waitForURL((url) => /\/(?:workspace|settings\/guide)$/.test(url.pathname))
  const session = await get(`/api/v1/identity/tenants/${fixture.tenant}/session`)
  const headers = { Origin: origin, 'X-Identity-Request': '1', 'X-CSRF-Token': session.csrfToken }
  const create = async (id = randomUUID()) => {
    const reply = await request('post', `/api/v1/devices/${fixture.mdm}/operations`, {
      headers,
      data: {
        operationId: id,
        action: { kind: 'restart' },
        deadline: Math.floor(Date.now() / 1000) + 3600,
      },
    })
    assert.equal(reply.status(), 202)
    const value = await reply.json()
    assert.equal(value.operationId, id)
    return value
  }
  const load = () => page.locator('section.console-page:not([aria-busy="true"])').waitFor()
  phase = 'directory-and-pagination'
  const unprepared = await request('post', `/api/v1/devices/${fixture.alone}/operations`, {
    headers,
    data: {
      operationId: randomUUID(),
      action: { kind: 'restart' },
      deadline: Math.floor(Date.now() / 1000) + 3600,
    },
  })
  assert.equal(unprepared.status(), 501)
  coverage.push('real-unprepared-device-control-501')
  const first = await create()
  for (let i = 0; i < 20; i++) await create()
  const sample = await get('/api/v1/operations?kind=command&limit=1')
  const filterStatus = sample.items[0].status
  const directory = await get(`/api/v1/operations?kind=command&status=${filterStatus}&limit=1`)
  assert.ok(directory.nextCursor)
  const following = await get(
    `/api/v1/operations?kind=command&status=${filterStatus}&limit=1&after=${directory.nextCursor.id}&afterKind=${directory.nextCursor.kind}`,
  )
  assert.notEqual(directory.items[0].id, following.items[0].id)
  await page.goto(at('policies/executions'))
  await load()
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await load()
  coverage.push('formal-operation-kind-status-filter-and-compound-pagination')
  phase = 'control-unknown-original-query'
  await page.goto(at(`policies/executions?device=${fixture.mdm}`))
  await load()
  const panel = page
    .locator('section.console-panel')
    .filter({ has: page.getByRole('heading', { name: '远程管理', exact: true }) })
  await panel.getByRole('button', { name: '重启', exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  let original
  await context.route(`**/api/v1/devices/${fixture.mdm}/operations`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    original = route.request().postDataJSON()
    statuses.push({ resource: 'intercepted-control', method: 'POST', status: 0 })
    const reply = await route.fetch()
    assert.equal(reply.status(), 202)
    statuses.push({ resource: 'intercepted-control', method: 'POST', status: reply.status() })
    await route.abort('failed')
  })
  await dialog
    .getByRole('button', { name: '我已核对目标、当前注册和风险，确认操作', exact: true })
    .click()
  await panel.getByRole('alert').filter({ hasText: '提交结果未知' }).waitFor()
  assert.equal(new URL(page.url()).searchParams.get('operation'), original.operationId)
  await context.unroute(`**/api/v1/devices/${fixture.mdm}/operations`)
  await panel.getByRole('button', { name: '查询原操作', exact: true }).click()
  await panel.getByRole('link', { name: '来源与历史证据', exact: true }).click()
  await load()
  assert.equal(
    (await get(`/api/v1/devices/${fixture.mdm}/operations/${original.operationId}`)).observation
      .effect,
    'waiting',
  )
  coverage.push('real-control-202-unknown-response-original-locator-and-waiting-effect')
  phase = 'cancel-unknown-cas'
  let cancellation
  await context.route(
    `**/api/v1/devices/${fixture.mdm}/operations/${original.operationId}/cancel`,
    async (route) => {
      cancellation = route.request().postDataJSON()
      const reply = await route.fetch()
      assert.equal(reply.status(), 200)
      await route.abort('failed')
    },
  )
  await page.getByRole('button', { name: '请求取消', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '提交结果未知' }).waitFor()
  await context.unroute(
    `**/api/v1/devices/${fixture.mdm}/operations/${original.operationId}/cancel`,
  )
  await page.getByRole('button', { name: '核实状态', exact: true }).click()
  await load()
  const replay = page.waitForRequest(
    (r) =>
      r.method() === 'POST' &&
      new URL(r.url()).pathname.endsWith(`/${original.operationId}/cancel`),
  )
  await page.getByRole('button', { name: '重放同一操作', exact: true }).click()
  assert.deepEqual((await replay).postDataJSON(), cancellation)
  await load()
  assert.equal(
    (await get(`/api/v1/devices/${fixture.mdm}/operations/${original.operationId}`)).commandStatus,
    'cancelled',
  )
  const stale = await request(
    'post',
    `/api/v1/devices/${fixture.mdm}/operations/${original.operationId}/cancel`,
    { headers, data: { ...cancellation, requestId: randomUUID() } },
  )
  assert.equal(stale.status(), 409)
  coverage.push('real-cancel-unknown-compare-exact-request-replay-and-terminal-409')
  phase = 'reauthorize-and-device-authority'
  const changeRule = async (grants) => {
    const rule = (await get('/api/v1/authorization/rules')).items.find(
      (r) => r.id === fixture.ruleId,
    )
    const reply = await request('put', `/api/v1/authorization/rules/${fixture.ruleId}`, {
      headers,
      data: {
        operationId: randomUUID(),
        expectedRevision: rule.revision,
        value: { ...fixture.rule, grants },
      },
    })
    assert.equal(reply.status(), 200)
  }
  await changeRule(fixture.rule.grants.filter((g) => g.operation !== 'device_control'))
  assert.equal(
    (await get(`/api/v1/devices/${fixture.mdm}/operations/${first.operationId}`)).authorization,
    'blocked',
  )
  await changeRule(fixture.rule.grants)
  await page.goto(at(`policies/executions/${first.operationId}?device=${fixture.mdm}`))
  await load()
  const beforeAuthorization = await get(
    `/api/v1/devices/${fixture.mdm}/operations/${first.operationId}`,
  )
  statuses.push({
    resource: 'before-reauthorization',
    revision: beforeAuthorization.revision,
    commandStatus: beforeAuthorization.commandStatus,
    authorization: beforeAuthorization.authorization,
  })
  const [authorizationReply] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith(`/${first.operationId}/reauthorize`),
    ),
    page.getByRole('button', { name: '重新授权', exact: true }).click(),
  ])
  const authorizationSnapshot = await get(
    `/api/v1/devices/${fixture.mdm}/operations/${first.operationId}`,
  )
  statuses.push({
    resource: 'reauthorization-observation',
    status: authorizationReply.status(),
    expectedRevision: authorizationReply.request().postDataJSON().expectedRevision,
    revision: authorizationSnapshot.revision,
    commandStatus: authorizationSnapshot.commandStatus,
    authorization: authorizationSnapshot.authorization,
  })
  assert.equal(authorizationReply.status(), 200)
  await load()
  assert.equal(authorizationSnapshot.authorization, 'authorized')
  await changeRule(fixture.rule.grants.filter((g) => g.operation !== 'operation_cancel'))
  await page.getByRole('button', { name: '请求取消', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '请求被拒绝' }).waitFor()
  await changeRule(
    fixture.rule.grants.map((g) =>
      g.operation === 'operation_read' ? { ...g, scope: { kind: 'device', id: fixture.agent } } : g,
    ),
  )
  assert.equal(
    (
      await request('get', `/api/v1/devices/${fixture.mdm}/operations/${first.operationId}`)
    ).status(),
    403,
  )
  assert.equal((await get('/api/v1/operations')).items.length, 0)
  phase = 'formal-audit-timeline-diagnostics'
  // AuditRead is independent of the operation/device scope narrowed above.
  const auditQuery = `/api/v1/audit-events?action=command_cancel&operationId=${original.operationId}`
  let audit
  const indexedDeadline = Date.now() + 30000
  do {
    audit = await get(auditQuery)
    if (audit.items.some((f) => f.operationId === cancellation.requestId)) break
    await new Promise((resolve) => setTimeout(resolve, 500))
  } while (Date.now() < indexedDeadline)
  const cancelFact = audit.items.find((f) => f.operationId === cancellation.requestId)
  assert.ok(cancelFact, 'actual cancellation audit indexed within the bounded window')
  assert.ok(cancelFact.relatedOperationIds.includes(original.operationId))
  assert.equal(cancelFact.supported, true)
  assert.equal('body' in cancelFact, false)
  const timeline = await get(`/api/v1/devices/${fixture.mdm}/timeline?action=command_cancel&operationId=${original.operationId}`)
  assert.ok(timeline.items.some((f) => f.eventId === cancelFact.eventId && f.source === cancelFact.source))
  const auditPage = await get('/api/v1/audit-events?limit=1')
  assert.ok(auditPage.nextCursor)
  const nextAudit = await get(`/api/v1/audit-events?limit=1&cursor=${encodeURIComponent(auditPage.nextCursor)}`)
  assert.notDeepEqual(nextAudit.items[0], auditPage.items[0])
  assert.equal((await request('get', `/api/v1/devices/${fixture.mdm}/timeline?cursor=${encodeURIComponent(auditPage.nextCursor)}`)).status(), 409)
  assert.equal((await request('get', `/api/v1/audit-events?action=command_cancel&cursor=${encodeURIComponent(auditPage.nextCursor)}`)).status(), 409)
  await page.goto(at(`operations/audit?device=${fixture.mdm}&operationId=${original.operationId}&action=command_cancel`))
  await load()
  await page.locator('tbody button').first().click()
  const auditDetail = page.getByTestId('audit-detail')
  await auditDetail.waitFor()
  const nativeLink = auditDetail.locator(`a[href*="/policies/executions/${original.operationId}"]`)
  assert.equal(await nativeLink.count(), 1)
  assert.ok((await nativeLink.getAttribute('href')).includes(`device=${encodeURIComponent(fixture.mdm)}`))
  await auditDetail.getByRole('link', { name: '查看设备时间线', exact: true }).click()
  await page.locator('.telemetry-activity').waitFor()
  assert.equal(new URL(page.url()).searchParams.get('operationId'), cancellation.requestId)
  coverage.push('real-safe-audit-associated-device-timeline-filter-pagination-bound-cursor-and-native-link')
  const diagnostics = await get('/api/v1/runtime/diagnostics')
  assert.ok(diagnostics.components.some((c) => c.name === 'inventory'))
  assert.ok(diagnostics.components.some((c) => c.name === 'execution_recovery'))
  await page.goto(at('operations/diagnostics'))
  await load()
  assert.equal(await page.locator('tbody tr').count(), diagnostics.components.length)
  await page.locator('tbody button').first().click()
  await page.getByTestId('diagnostic-detail').waitFor()
  await changeRule(fixture.rule.grants.filter((g) => !['audit_read','runtime_diagnostics_read'].includes(g.operation)))
  assert.equal((await request('get', '/api/v1/runtime/diagnostics')).status(), 403)
  assert.equal((await request('get', '/api/v1/audit-events')).status(), 403)
  assert.equal((await request('get', `/api/v1/devices/${fixture.mdm}/timeline`)).status(), 403)
  // Close the drawer before using the page refresh; a denied read removes prior observations.
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '重新读取', exact: true }).click()
  await load()
  assert.equal(await page.locator('tbody').count(), 0)
  assert.equal(await page.getByTestId('diagnostic-detail').count(), 0)
  coverage.push('real-runtime-components-and-independent-audit-diagnostic-permission-403-clear-stale-snapshot')
  const anonymous = await browser.newContext({ ignoreHTTPSErrors: true })
  try {
    for (const path of ['/api/v1/operations','/api/v1/audit-events','/api/v1/runtime/diagnostics']) assert.equal((await anonymous.request.get(origin + path)).status(), 401)
  } finally {
    await anonymous.close()
  }
  coverage.push('real-reauthorize-permission-403-device-scope-and-anonymous-401')
  result = 'passed'
} catch (error) {
  console.log(
    JSON.stringify({
      phase,
      result: 'failed',
      classification: error.name,
      line: error.stack?.match(/operations-browser\.mjs:(\d+)/)?.[1],
      statuses,
      pageErrors,
      originalLocator: page ? new URL(page.url()).searchParams.has('operation') : false,
      route: page ? new URL(page.url()).pathname : undefined,
    }),
  )
  process.exitCode = 1
} finally {
  clearTimeout(timer)
  process.removeListener('SIGINT', stop)
  process.removeListener('SIGTERM', stop)
  let cleanup = 'passed'
  try {
    await context?.close()
    await browser?.close()
  } catch {
    cleanup = 'failed'
    result = 'failed'
    process.exitCode = 1
  }
  if (interrupted) {
    result = 'failed'
    process.exitCode = 1
  }
  console.log(
    JSON.stringify({
      phase: 'operations-browser',
      result,
      coverage,
      browserCleanup: cleanup,
    }),
  )
}
