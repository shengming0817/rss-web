// Production Vue + real MDM/Identity HTTPS/PG. Only a committed response is deliberately lost.
import { chromium } from 'playwright'
import { readFileSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import process from 'node:process'
let browser,
  context,
  page,
  phase = 'environment',
  result = 'failed'
const coverage = [],
  responses = [],
  pageErrors = []
const stop = () => browser?.close().catch(() => {})
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
const timer = setTimeout(stop, 170000)
try {
  const fixture = JSON.parse(readFileSync(process.env.MDM_DEVICE_BROWSER_FIXTURE, 'utf8')),
    origin = new URL(fixture.origin).origin
  assert.equal(new URL(origin).protocol, 'https:')
  assert.equal(new URL(origin).hostname, 'localhost')
  assert.equal(statSync(fixture.passwordFile).mode & 0o077, 0)
  browser = await chromium.launch()
  context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN' })
  page = await context.newPage()
  page.setDefaultTimeout(10000)
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname
    if (path.startsWith('/api/v1/')) {
      responses.push({ resource: path.split('/')[3], status: response.status() })
      if (responses.length > 20) responses.shift()
    }
  })
  page.on('pageerror', (error) => pageErrors.push(error.name))
  // Pace both UI and fixture HTTP below the unchanged production gateway's 10 r/s limit.
  let nextRequestAt = 0
  const pace = async () => {
    const now = Date.now(),
      dispatchAt = Math.max(now, nextRequestAt)
    nextRequestAt = dispatchAt + 200
    if (dispatchAt > now) await new Promise((resolve) => setTimeout(resolve, dispatchAt - now))
  }
  await context.route('**/api/v1/**', async (route) => {
    await pace()
    await route.continue()
  })
  const request = async (method, url, options) => {
    await pace()
    const response = await context.request[method](url, options)
    if (response.status() >= 400) {
      const error = await response.json().catch(() => ({}))
      responses.push({
        resource: new URL(url).pathname.split('/')[3],
        status: response.status(),
        code: /^[a-z_]{1,128}$/.test(error.code) ? error.code : undefined,
      })
      if (responses.length > 20) responses.shift()
    }
    return response
  }
  const path = (route) => `${origin}/tenants/${fixture.tenant}/${route}`
  const api = async (url) => {
    const response = await request('get', origin + url)
    assert.equal(response.status(), 200)
    return response.json()
  }
  let csrfToken
  const headers = async () => {
    csrfToken ??= (await api(`/api/v1/identity/tenants/${fixture.tenant}/session`)).csrfToken
    return { Origin: origin, 'X-Identity-Request': '1', 'X-CSRF-Token': csrfToken }
  }
  const confirm = async (body) =>
    request('post', origin + '/api/v1/device-associations', {
      headers: await headers(),
      data: body,
    })
  const body = (a, evidence = 'Verified same fixture instance') => ({
    operationId: randomUUID(),
    associationId: a.id,
    expectedVersion: a.version,
    mdm: a.members.find((m) => m.channel === 'mdm'),
    agent: a.members.find((m) => m.channel === 'agent'),
    evidence,
  })
  const writeRule = async (grants) => {
    const rule = (await api('/api/v1/authorization/rules')).items.find(
      (r) => r.id === fixture.ruleId,
    )
    assert.ok(rule)
    const response = await request(
      'put',
      origin + `/api/v1/authorization/rules/${fixture.ruleId}`,
      {
        headers: await headers(),
        data: {
          operationId: randomUUID(),
          expectedRevision: rule.revision,
          value: { ...fixture.rule, grants },
        },
      },
    )
    assert.equal(response.status(), 200)
  }
  const panel = () => page.locator('[data-testid=association-panel]')
  const loaded = () => page.locator('section.console-page:not([aria-busy="true"])').waitFor()
  const advanceGeneration = (channel) => {
    const fds = JSON.parse(process.env._MDM_BUILD_LEASE).fds
    assert.ok(fds.length === 2 && fds.every((fd) => Number.isInteger(fd) && fd >= 3 && fd < 1024))
    const stdio = Array(Math.max(...fds) + 1).fill('ignore')
    stdio[1] = 'pipe'
    stdio[2] = 'pipe'
    fds.forEach((fd) => {
      stdio[fd] = fd
    })
    const control = spawnSync(
      'python3',
      [
        resolve(dirname(fileURLToPath(import.meta.url)), 'device-fixture-control.py'),
        process.env.MDM_DEVICE_BROWSER_FIXTURE,
        channel,
      ],
      { cwd: process.env.MDM_DEVICE_BACKEND, stdio, timeout: 30000 },
    )
    assert.equal(control.status, 0)
  }
  phase = 'login'
  await page.goto(origin + '/login')
  await page.locator('#login-name').fill(fixture.login)
  await page.locator('#login-password').fill(readFileSync(fixture.passwordFile, 'utf8').trim())
  await page.locator('form').evaluate((f) => f.requestSubmit())
  await page.waitForURL((url) => /\/(?:workspace|settings\/guide)$/.test(url.pathname))
  phase = 'directory-http'
  await api('/api/v1/devices?limit=20')
  await api('/api/v1/device-views?limit=20')
  phase = 'directory'
  await page.goto(path('devices'))
  await loaded()
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await loaded()
  assert.ok((await page.locator('tbody').textContent()).includes(fixture.mdm))
  coverage.push('real-directory-counters-and-pagination')
  phase = 'unknown-create'
  await page.goto(path(`devices/${fixture.mdm}`))
  await page.getByRole('tab', { name: '设备关联管理', exact: true }).click()
  await panel().waitFor()
  const oldMdm = await api(`/api/v1/devices/${fixture.mdm}`)
  advanceGeneration('mdm')
  const refreshedMdm = await api(`/api/v1/devices/${fixture.mdm}`),
    oldRegistration = oldMdm.channels.find((c) => c.channel === 'mdm'),
    currentRegistration = refreshedMdm.channels.find((c) => c.channel === 'mdm')
  assert.equal(currentRegistration.generation, 2)
  assert.notEqual(currentRegistration.registrationId, oldRegistration.registrationId)
  await page.getByRole('button', { name: '查找另一通道候选', exact: true }).click()
  await panel().getByRole('radio').first().check()
  const coordinates = panel().locator('[data-testid=confirmation-coordinates]')
  await coordinates.getByText(currentRegistration.registrationId, { exact: false }).waitFor()
  assert.ok(
    (await coordinates.textContent()).includes(
      currentRegistration.registrationId + ' / ' + currentRegistration.generation,
    ),
  )
  assert.ok(!(await coordinates.textContent()).includes(oldRegistration.registrationId))
  await page.getByLabel('核实说明与依据', { exact: true }).fill('Verified physical fixture input')
  await page.getByLabel('我已核实双方属于同一管理实例，确认双方注册坐标', { exact: true }).check()
  let original,
    requests = []
  await page.route('**/api/v1/device-associations', async (route) => {
    await pace()
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    requests.push(route.request().postData())
    if (!original) {
      original = JSON.parse(route.request().postData())
      assert.equal(original.mdm.registrationId, currentRegistration.registrationId)
      assert.equal(original.mdm.generation, currentRegistration.generation)
      const response = await route.fetch()
      assert.equal(response.status(), 200)
      await route.abort('failed')
    } else await route.continue()
  })
  await page.getByRole('button', { name: '确认关联', exact: true }).click()
  await page.getByText('操作结果未知', { exact: false }).waitFor()
  assert.equal(await page.getByRole('button', { name: '确认关联', exact: true }).isDisabled(), true)
  // Vue navigation retains operation memory; a full browser restart deliberately does not persist it.
  await page.getByRole('link', { name: '设备目录', exact: true }).click()
  await loaded()
  await page.getByRole('link', { name: fixture.mdm, exact: true }).first().click()
  await page.getByRole('tab', { name: '设备关联管理', exact: true }).click()
  await panel().waitFor()
  await page.getByLabel('我确认使用相同操作标识、身份及完整原正文幂等重放', { exact: true }).check()
  await page.getByRole('button', { name: '幂等重放原关联操作', exact: true }).click()
  await page.waitForURL(/device-views\/association\//)
  await loaded()
  assert.equal(requests.length, 2)
  assert.equal(requests[0], requests[1])
  await page.unroute('**/api/v1/device-associations')
  const id = new URL(page.url()).pathname.split('/').at(-1)
  let association = await api(`/api/v1/device-associations/${id}`)
  assert.equal(association.version, 1)
  coverage.push('real-create-displayed-current-generation-without-refresh')
  coverage.push('committed-unknown-explicit-exact-replay')
  phase = 'sources'
  const view = await api(`/api/v1/device-views/association/${id}`)
  assert.equal(view.fields['custom.asset_tag'].state.kind, 'conflict')
  assert.equal(view.fields['custom.asset_tag'].sources.length, 2)
  await page.getByRole('button', { name: '通道', exact: true }).click()
  assert.equal(await page.locator('[data-endpoint]').count(), 2)
  const lists = page
    .locator('details')
    .filter({ has: page.locator('summary').filter({ hasText: 'custom.browser_list' }) })
  await lists.locator('summary').first().click()
  const mdmList = lists
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: new RegExp(fixture.mdm) }) })
  await mdmList.getByRole('button', { name: '展开此来源', exact: true }).click()
  await mdmList.getByRole('button', { name: '下一页', exact: true }).waitFor()
  await page.waitForFunction(
    (id) => document.querySelector(`[data-list-endpoint="${id}"] ol`)?.children.length === 20,
    fixture.mdm,
  )
  await mdmList.getByRole('button', { name: '下一页', exact: true }).click()
  await page.waitForFunction(
    (id) => document.querySelector(`[data-list-endpoint="${id}"] ol`)?.children.length === 5,
    fixture.mdm,
  )
  coverage.push('manual-conflict-two-endpoints-source-pagination')
  phase = 'cas'
  await page.getByRole('tab', { name: '设备关联管理', exact: true }).click()
  await page.getByRole('button', { name: '读取当前关系与主注册', exact: true }).click()
  await panel().locator('[aria-busy=false]').count()
  await panel().getByLabel('核实说明与依据', { exact: true }).fill('UI verification')
  await panel()
    .getByLabel('我已核实双方属于同一管理实例，确认双方注册坐标', { exact: true })
    .check()
  assert.equal((await confirm(body(association, 'Concurrent verification'))).status(), 200)
  await page.getByRole('button', { name: '重新核实关联', exact: true }).click()
  await page.getByText('版本或注册依据已变化', { exact: false }).waitFor()
  assert.equal(
    await page.getByRole('button', { name: '重新核实关联', exact: true }).isDisabled(),
    true,
  )
  await page.getByRole('button', { name: '读取当前关系与主注册', exact: true }).click()
  const basis = panel().locator('[data-testid=association-basis]')
  await basis.getByText('Concurrent verification', { exact: false }).waitFor()
  assert.ok((await basis.textContent()).includes(id + ' / 2'))
  await panel()
    .getByLabel('我已核实双方属于同一管理实例，确认双方注册坐标', { exact: true })
    .check()
  const nextConfirmation = page.waitForRequest(
    (r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/v1/device-associations',
  )
  await page.getByRole('button', { name: '重新核实关联', exact: true }).click()
  assert.equal((await nextConfirmation).postDataJSON().expectedVersion, 2)
  await loaded()
  association = await api(`/api/v1/device-associations/${id}`)
  assert.equal(association.version, 3)
  coverage.push('real-cas-conflict-explicit-basis-refresh')
  phase = 'generation'
  advanceGeneration('agent')
  await page.reload()
  await loaded()
  association = await api(`/api/v1/device-associations/${id}`)
  assert.equal(association.state, 'needs_verification')
  assert.ok(
    (await api(`/api/v1/device-views/association/${id}`)).endpoints
      .find((e) => e.id === fixture.agent)
      .channels.some((c) => c.generation === 2),
  )
  await page.getByRole('tab', { name: '设备关联管理', exact: true }).click()
  await page.getByRole('button', { name: '读取当前关系与主注册', exact: true }).click()
  await panel().getByLabel('核实说明与依据', { exact: true }).fill('Verified current generation')
  await panel()
    .getByLabel('我已核实双方属于同一管理实例，确认双方注册坐标', { exact: true })
    .check()
  await page.getByRole('button', { name: '重新核实关联', exact: true }).click()
  await loaded()
  association = await api(`/api/v1/device-associations/${id}`)
  assert.ok(association.members.some((m) => m.device === fixture.agent && m.generation === 2))
  coverage.push('real-new-generation-pending-and-reverification')
  phase = 'cursor-invalidated'
  const current = await api(`/api/v1/device-views/association/${id}`),
    source = current.lists['custom.browser_list'].sources.find((s) => s.endpoint === fixture.mdm)
  const change = await request(
    'put',
    origin + `/api/v1/devices/${fixture.mdm}/manual-fields/custom.asset_tag`,
    {
      headers: await headers(),
      data: {
        operationId: randomUUID(),
        expectedRevision: 1,
        input: { action: 'set', value: { kind: 'string', value: 'changed fixture' } },
      },
    },
  )
  assert.equal(change.status(), 200)
  const invalidated = await request(
    'get',
    origin +
      `/api/v1/device-views/association/${id}/inventory-lists/custom.browser_list?cursor=${encodeURIComponent(source.cursor)}&limit=20`,
  )
  assert.equal(invalidated.status(), 409)
  assert.equal((await invalidated.json()).code, 'device_view_cursor_invalidated')
  coverage.push('real-authority-bound-list-cursor-invalidation')
  phase = 'group-scope-assignments'
  const mutate = async (url, input, expectedRevision = 0, expectedStatus = 200) => {
    const response = await request('post', origin + url, {
      headers: await headers(),
      data: { operationId: randomUUID(), expectedRevision, input },
    })
    assert.equal(response.status(), expectedStatus)
    return response.json()
  }
  const settled = async (url) => {
    for (let i = 0; i < 30; i++) {
      const value = await api(url)
      if (value.status === 'completed') return value
      assert.ok(['pending', 'running'].includes(value.status))
    }
    assert.fail('bounded calculation deadline')
  }
  const group = randomUUID()
  await mutate(`/api/v1/groups/${group}`, {
    action: 'create',
    name: 'Browser endpoint group',
    description: '',
    assetContext: 'endpoint',
    criteria: null,
  })
  const membership = await mutate(
    `/api/v1/groups/${group}`,
    { action: 'members', add: [{ kind: 'endpoint', id: fixture.agent }], remove: [] },
    1,
    202,
  )
  await settled(`/api/v1/groups/${group}/tasks/${membership.task}`)
  const groupResult = await api(`/api/v1/groups/${group}/results/${membership.task}/members`)
  assert.deepEqual(groupResult.page.items, [{ kind: 'endpoint', id: fixture.agent }])
  await page.goto(path('devices/groups'))
  await loaded()
  await page.getByRole('button', { name: /Browser endpoint group/ }).click()
  await loaded()
  const scopeLink = page.locator('[data-testid=server-definition] a')
  await scopeLink.waitFor()
  assert.equal(
    new URL(await scopeLink.getAttribute('href'), origin).searchParams.get('group'),
    group,
  )
  // Follow the selected Group's production link into the Scope editor.
  await scopeLink.click()
  await loaded()
  const scopeWrite = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      /\/api\/v1\/scopes\/[^/]+$/.test(new URL(r.url()).pathname),
  )
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const scopeResponse = await scopeWrite
  assert.equal(scopeResponse.status(), 200)
  const scope = await scopeResponse.json()
  await settled(`/api/v1/scopes/${scope.id}/tasks/${scope.task}`)
  await page.getByRole('button', { name: '读取任务状态', exact: true }).click()
  await loaded()
  await page.locator('#scope-projection').selectOption('decisions')
  const channelSelect = page
    .locator('select')
    .filter({ has: page.locator('option[value="agent"]') })
  await channelSelect.selectOption('agent')
  await page.getByRole('button', { name: '打开', exact: true }).last().click()
  await loaded()
  assert.ok((await page.locator('main').textContent()).includes(fixture.agent))
  const decision = await api(
    `/api/v1/scopes/${scope.id}/results/${scope.task}/decisions?channel=agent`,
  )
  assert.equal(decision.channel, 'agent')
  assert.equal(decision.page.items[0].object.kind, 'endpoint')
  assert.equal(decision.page.items[0].qualification.state, 'eligible')
  assert.ok(decision.page.items[0].targets.some((s) => s.reference.id === group))
  const policy = randomUUID()
  await mutate(`/api/v1/policies/${policy}`, {
    action: 'put',
    enabled: false,
    definition: {
      scope: scope.id,
      action: {
        kind: 'request_mdm_enrollment',
        organization: fixture.tenant,
        runLifetimeSeconds: 300,
        schedule: {
          trigger: { kind: 'manual' },
          misfire: { kind: 'coalesce_one' },
          notBefore: 0,
          until: null,
          jitterSeconds: 0,
          window: null,
        },
      },
    },
  })
  const assignment = (await api(`/api/v1/policies/${policy}/assignments`)).items.find(
    (a) => a.object.id === fixture.agent,
  )
  assert.ok(assignment)
  assert.equal(assignment.channel, 'agent')
  assert.equal(
    assignment.target.registrationId,
    association.members.find((m) => m.channel === 'agent').registrationId,
  )
  assert.equal(assignment.target.generation, 2)
  // Endpoint Groups retain endpoint provenance; association evidence belongs to associated-device Groups.
  assert.deepEqual(assignment.object, { kind: 'endpoint', id: fixture.agent })
  assert.deepEqual(
    assignment.sources.map((s) => s.object),
    [{ kind: 'endpoint', id: fixture.agent }],
  )
  assert.equal(assignment.sources[0].associationVersion, null)
  assert.equal(assignment.sources[0].verified, true)
  assert.deepEqual(assignment.sources[0].members, [assignment.target])
  assert.ok(Array.isArray(assignment.operationIds))
  await page.goto(path(`software/bootstrap?id=${policy}`))
  await loaded()
  await page.getByRole('button', { name: '刷新进度（保留编辑）', exact: true }).click()
  await loaded()
  assert.ok((await page.locator('main').textContent()).includes(assignment.target.registrationId))
  coverage.push('real-endpoint-group-scope-channel-and-canonical-assignments')
  await page.goto(path(`device-views/association/${id}`))
  await loaded()
  phase = 'authorization'
  await writeRule([{ operation: 'inventory_read', scope: { kind: 'all_devices' } }])
  await page.reload()
  await loaded()
  assert.equal(await panel().count(), 0)
  assert.equal((await confirm(body(association))).status(), 403)
  await writeRule([{ operation: 'inventory_read', scope: { kind: 'device', id: fixture.mdm } }])
  const scoped = await api('/api/v1/device-views')
  assert.deepEqual(scoped.statistics, { endpointCount: 1, deviceViewCount: 1 })
  assert.ok(!JSON.stringify(scoped).includes(fixture.agent))
  assert.ok(!JSON.stringify(scoped).includes(id))
  assert.equal(
    (await request('get', origin + `/api/v1/device-views/association/${id}`)).status(),
    404,
  )
  await page.reload()
  await page.getByRole('alert').waitFor()
  assert.equal(await page.locator('[data-endpoint]').count(), 0)
  coverage.push('real-readonly-403-scoped-counterpart-404')
  const anonymous = await browser.newContext({ ignoreHTTPSErrors: true })
  assert.equal((await anonymous.request.get(origin + '/api/v1/device-views')).status(), 401)
  await anonymous.close()
  coverage.push('real-anonymous-401')
  phase = 'revoke'
  await writeRule(fixture.rule.grants)
  await page.reload()
  await page.getByRole('tab', { name: '设备关联管理', exact: true }).click()
  await panel().waitFor()
  const registrations = await api(`/api/v1/devices/${fixture.agent}/registrations`)
  await panel()
    .getByLabel('解除原因', { exact: true })
    .fill('Separate fixture management identities')
  await panel()
    .getByLabel('我已核实双方属于同一管理实例，确认双方注册坐标', { exact: true })
    .check()
  await page.getByRole('button', { name: '解除关联', exact: true }).click()
  await page.waitForURL(/\/devices$/)
  assert.equal((await api(`/api/v1/device-associations/${id}`)).state, 'revoked')
  assert.deepEqual(await api(`/api/v1/devices/${fixture.agent}/registrations`), registrations)
  coverage.push('real-revoke-retains-credentials')
  result = 'passed'
} catch (error) {
  const line = error.stack?.match(/device-browser\.mjs:(\d+)/)?.[1]
  const alerts =
    (await page
      ?.getByRole('alert')
      .allTextContents()
      .catch(() => [])) ?? []
  const ui = page
    ? {
        consoleCount: await page
          .locator('section.console-page')
          .count()
          .catch(() => 0),
        login: await page
          .locator('#login-name')
          .count()
          .catch(() => 0),
        failures: ['输入或响应无效', '请求被拒绝', '对象或操作不存在', '服务暂不可用'].filter(
          (text) => alerts.some((alert) => alert.includes(text)),
        ),
      }
    : undefined
  console.log(
    JSON.stringify({
      phase,
      result: 'failed',
      line,
      classification: error.name,
      ui,
      responses,
      pageErrors,
    }),
  )
} finally {
  clearTimeout(timer)
  await context?.close().catch(() => {})
  await browser?.close().catch(() => {})
  console.log(JSON.stringify({ phase: 'device-browser', result, coverage }))
  if (result !== 'passed') process.exitCode = 1
}
