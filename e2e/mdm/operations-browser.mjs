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
  // Queries bind live execution generations. Restart the read chain if dispatch advances it.
  let directory, following
  for (let attempt = 0; attempt < 20; attempt++) {
    const firstPage = await request('get', '/api/v1/operations?filter=kind==command&limit=1')
    if (firstPage.status() === 409) {
      await new Promise((r) => setTimeout(r, 500))
      continue
    }
    assert.equal(firstPage.status(), 200)
    directory = await firstPage.json()
    assert.ok(directory.nextCursor)
    const nextPage = await request(
      'get',
      `/api/v1/operations?filter=kind==command&limit=1&cursor=${encodeURIComponent(directory.nextCursor)}`,
    )
    if (nextPage.status() === 409) {
      await new Promise((r) => setTimeout(r, 500))
      continue
    }
    assert.equal(nextPage.status(), 200)
    following = await nextPage.json()
    break
  }
  assert.ok(following, 'execution generation did not stabilize for pagination')
  assert.notEqual(directory.items[0].id, following.items[0].id)
  await page.goto(at('policies/executions'))
  await load()
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await load()
  coverage.push('formal-operation-kind-filter-and-opaque-pagination')
  for (const [label, predicate] of [
    ['等待设备', "kind=='command'"],
    ['待重新授权', "authorization.state=='blocked'"],
    ['未知结果', "status=='unknown'"],
  ]) {
    const directoryResponse = page.waitForResponse(
      (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/v1/operations',
    )
    const statisticsResponse = page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        new URL(r.url()).pathname === '/api/v1/operations/statistics',
    )
    await page.getByRole('button', { name: label, exact: true }).click()
    const [listReply, statsReply] = await Promise.all([directoryResponse, statisticsResponse])
    assert.equal(listReply.status(), 200)
    assert.equal(statsReply.status(), 200)
    const filter = new URL(listReply.url()).searchParams.get('filter')
    assert.ok(filter.includes(predicate))
    assert.equal(new URL(statsReply.url()).searchParams.get('filter'), filter)
    await load()
  }
  coverage.push('real-server-queue-predicates-and-identical-statistics-filters')

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
    const rule = await get('/api/v1/authorization/rules/' + fixture.ruleId)
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
  const revoked = await get(`/api/v1/devices/${fixture.mdm}/operations/${first.operationId}`)
  // Organization execution authority and the current reader's action permission are independent.
  assert.deepEqual(revoked.authorization, { state: 'authorized' })
  assert.deepEqual(revoked.reauthorization, { state: 'unavailable', reason: 'permission_denied' })
  const deniedReauthorization = await request(
    'post',
    `/api/v1/devices/${fixture.mdm}/operations/${first.operationId}/reauthorize`,
    { headers, data: { requestId: randomUUID(), expectedRevision: revoked.revision } },
  )
  assert.equal(deniedReauthorization.status(), 403)
  await changeRule(fixture.rule.grants)
  // Explicitly cancel before checking terminal reauthorization; reads do not dispatch commands.
  const cancelled = await request(
    'post',
    `/api/v1/devices/${fixture.mdm}/operations/${first.operationId}/cancel`,
    { headers, data: { requestId: randomUUID(), expectedRevision: revoked.revision } },
  )
  assert.equal(cancelled.status(), 200)
  const terminal = await get(`/api/v1/devices/${fixture.mdm}/operations/${first.operationId}`)
  assert.equal(terminal.commandStatus, 'cancelled')
  await page.goto(at(`policies/executions/${first.operationId}?device=${fixture.mdm}`))
  await load()
  assert.equal(await page.getByRole('button', { name: '重新授权', exact: true }).count(), 0)
  const terminalReauthorization = await request(
    'post',
    `/api/v1/devices/${fixture.mdm}/operations/${first.operationId}/reauthorize`,
    { headers, data: { requestId: randomUUID(), expectedRevision: terminal.revision } },
  )
  assert.equal(terminalReauthorization.status(), 409)
  const live = await create()
  const beforeAuthorization = await get(
    `/api/v1/devices/${fixture.mdm}/operations/${live.operationId}`,
  )
  const authorizationReply = await request(
    'post',
    `/api/v1/devices/${fixture.mdm}/operations/${live.operationId}/reauthorize`,
    {
      headers,
      data: { requestId: randomUUID(), expectedRevision: beforeAuthorization.revision },
    },
  )
  assert.equal(authorizationReply.status(), 200)
  const authorizationSnapshot = await get(
    `/api/v1/devices/${fixture.mdm}/operations/${live.operationId}`,
  )
  assert.deepEqual(authorizationSnapshot.authorization, { state: 'authorized' })
  assert.equal(authorizationSnapshot.reauthorization.state, 'available')
  assert.equal(authorizationSnapshot.revision, beforeAuthorization.revision + 1)
  await page.goto(at(`policies/executions/${live.operationId}?device=${fixture.mdm}`))
  await load()
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
      await request('get', `/api/v1/devices/${fixture.mdm}/operations/${live.operationId}`)
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
  const timeline = await get(
    `/api/v1/devices/${fixture.mdm}/timeline?action=command_cancel&operationId=${original.operationId}`,
  )
  assert.ok(
    timeline.items.some((f) => f.eventId === cancelFact.eventId && f.source === cancelFact.source),
  )
  const auditPage = await get('/api/v1/audit-events?limit=1')
  assert.ok(auditPage.nextCursor)
  const nextAudit = await get(
    `/api/v1/audit-events?limit=1&cursor=${encodeURIComponent(auditPage.nextCursor)}`,
  )
  assert.notDeepEqual(nextAudit.items[0], auditPage.items[0])
  assert.equal(
    (
      await request(
        'get',
        `/api/v1/devices/${fixture.mdm}/timeline?cursor=${encodeURIComponent(auditPage.nextCursor)}`,
      )
    ).status(),
    409,
  )
  assert.equal(
    (
      await request(
        'get',
        `/api/v1/audit-events?action=command_cancel&cursor=${encodeURIComponent(auditPage.nextCursor)}`,
      )
    ).status(),
    409,
  )
  await page.goto(
    at(
      `operations/audit?device=${fixture.mdm}&operationId=${original.operationId}&action=command_cancel`,
    ),
  )
  await load()
  await page.locator('tbody button').first().click()
  const auditDetail = page.getByTestId('audit-detail')
  await auditDetail.waitFor()
  const nativeLink = auditDetail.locator(`a[href*="/policies/executions/${original.operationId}"]`)
  assert.equal(await nativeLink.count(), 1)
  assert.ok(
    (await nativeLink.getAttribute('href')).includes(`device=${encodeURIComponent(fixture.mdm)}`),
  )
  await auditDetail.getByRole('link', { name: '查看设备时间线', exact: true }).click()
  await page.locator('.telemetry-activity').waitFor()
  assert.equal(new URL(page.url()).searchParams.get('operationId'), cancellation.requestId)
  coverage.push(
    'real-safe-audit-associated-device-timeline-filter-pagination-bound-cursor-and-native-link',
  )
  const diagnostics = await get('/api/v1/runtime/diagnostics')
  assert.ok(diagnostics.components.some((c) => c.name === 'inventory'))
  assert.ok(diagnostics.components.some((c) => c.name === 'execution_recovery'))
  assert.deepEqual(diagnostics.components.map((c) => c.name).sort(), [
    'automation',
    'execution_recovery',
    'initialization',
    'inventory',
    'telemetry',
  ])
  assert.deepEqual(diagnostics.channels.map((c) => c.name).sort(), [
    'agent',
    'agent_bootstrap',
    'apple',
    'signing',
    'windows',
    'windows_push',
  ])
  await page.goto(at('operations/diagnostics'))
  await load()
  assert.equal(await page.locator('tbody tr').count(), diagnostics.components.length)
  assert.equal(
    await page.locator('[data-testid=channel-facts] article').count(),
    diagnostics.channels.length,
  )
  await page.getByRole('button', { name: 'Inventory · 资产投影', exact: true }).click()
  await page.getByTestId('diagnostic-detail').waitFor()
  await changeRule(
    fixture.rule.grants.filter(
      (g) => !['audit_read', 'runtime_diagnostics_read'].includes(g.operation),
    ),
  )
  assert.equal((await request('get', '/api/v1/runtime/diagnostics')).status(), 403)
  assert.equal((await request('get', '/api/v1/audit-events')).status(), 403)
  assert.equal((await request('get', `/api/v1/devices/${fixture.mdm}/timeline`)).status(), 403)
  // Close the drawer before using the page refresh; a denied read removes prior observations.
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '重新读取', exact: true }).click()
  await load()
  assert.equal(await page.locator('tbody').count(), 0)
  assert.equal(await page.getByTestId('diagnostic-detail').count(), 0)
  coverage.push(
    'real-runtime-components-and-independent-audit-diagnostic-permission-403-clear-stale-snapshot',
  )
  const anonymous = await browser.newContext({ ignoreHTTPSErrors: true })
  try {
    for (const path of [
      '/api/v1/operations',
      '/api/v1/audit-events',
      '/api/v1/runtime/diagnostics',
    ])
      assert.equal((await anonymous.request.get(origin + path)).status(), 401)
  } finally {
    await anonymous.close()
  }
  coverage.push(
    'real-reauthorization-api-terminal-ui-permission-403-device-scope-and-anonymous-401',
  )
  await changeRule(fixture.rule.grants)
  const registration = (await get(`/api/v1/devices/${fixture.mdm}/registrations`)).items.find(
    (r) => r.status === 'active' && r.source !== 'agent.builtin',
  )
  assert.ok(registration)
  const revoke = await request(
    'post',
    `/api/v1/devices/${fixture.mdm}/registrations/${registration.registrationId}/revoke`,
    { headers: { ...headers, 'Idempotency-Key': randomUUID() }, data: {} },
  )
  assert.equal(revoke.status(), 200)
  const blockedFilter = "authorization.state=='blocked'"
  const blocked = await get(
    '/api/v1/operations?' + new URLSearchParams({ filter: blockedFilter, limit: '100' }),
  )
  assert.ok(blocked.items.some((row) => row.authorization.reason === 'registration_changed'))
  assert.ok(
    blocked.items.every(
      (row) => row.authorization.state === 'blocked' && row.reauthorization.state === 'unavailable',
    ),
  )
  const blockedStats = await get(
    '/api/v1/operations/statistics?' + new URLSearchParams({ filter: blockedFilter }),
  )
  assert.equal(blockedStats.statistics.total, blocked.items.length)
  await page.goto(at('policies/executions'))
  await load()
  await page.getByRole('button', { name: '待重新授权', exact: true }).click()
  await load()
  assert.ok((await page.locator('tbody').innerText()).includes('注册代次已变化'))
  coverage.push('real-revoked-registration-blocked-queue-summary-and-filtered-statistics')
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
      alerts: page ? await page.getByRole('alert').allTextContents() : [],
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
