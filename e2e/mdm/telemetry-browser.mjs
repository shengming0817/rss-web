import { Buffer } from 'node:buffer'
// Production Vue + real management HTTPS and Agent mTLS; synthetic input, no device effect claim.
import { chromium } from 'playwright'
import { readFileSync, statSync } from 'node:fs'
import { randomUUID, createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import assert from 'node:assert/strict'
let browser,
  context,
  page,
  phase = 'environment',
  result = 'failed',
  closing,
  cleanupFailed = false
const coverage = [],
  failures = [],
  pageErrors = []
const close = () =>
  (closing ??= Promise.resolve().then(async () => {
    try {
      await context?.close()
    } catch {
      cleanupFailed = true
    }
    try {
      await browser?.close()
    } catch {
      cleanupFailed = true
    }
  }))
const stop = () => {
  void close()
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
const timeout = setTimeout(stop, 600000)
try {
  const fixture = JSON.parse(readFileSync(process.env.MDM_DEVICE_BROWSER_FIXTURE, 'utf8'))
  assert.equal(statSync(fixture.passwordFile).mode & 0o077, 0)
  const origin = new URL(fixture.origin).origin,
    device = fixture.collector.runtime.deviceId
  assert.equal(new URL(origin).protocol, 'https:')
  assert.equal(new URL(origin).hostname, 'localhost')
  browser = await chromium.launch()
  context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN' })
  page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('pageerror', (error) => pageErrors.push(error.name))
  page.on('response', (response) => {
    if (response.status() >= 400 && new URL(response.url()).pathname.startsWith('/api/')) {
      failures.push({
        status: response.status(),
        resource: new URL(response.url()).pathname.split('/')[3],
      })
      if (failures.length > 20) failures.shift()
    }
  })
  let next = 0
  const pace = async () => {
    const at = Math.max(next, Date.now())
    next = at + 200
    if (at > Date.now()) await new Promise((resolve) => setTimeout(resolve, at - Date.now()))
  }
  await context.route('**/api/v1/**', async (route) => {
    await pace()
    await route.continue()
  })
  const path = (route) => `${origin}/tenants/${fixture.tenant}/${route}`
  let csrf
  async function api(method, path, body, binary = false) {
    await pace()
    const response = await context.request.fetch(origin + path, {
      method,
      headers: {
        Origin: origin,
        'X-Identity-Request': '1',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        ...(binary ? { 'Content-Type': 'application/octet-stream' } : {}),
      },
      ...(body === undefined ? {} : { data: body }),
    })
    if (response.status() >= 400) {
      const data = await response.json().catch(() => ({}))
      failures.push({ status: response.status(), resource: path.split('/')[3], code: data.code })
    }
    assert.ok(
      response.status() >= 200 && response.status() < 300,
      `HTTP ${response.status()} ${path.split('/')[3]}`,
    )
    return response.status() === 201 ? null : response.json()
  }
  const write = (method, path, input, expectedRevision = 0) =>
    api(method, path, { operationId: randomUUID(), expectedRevision, input })
  phase = 'login'
  await page.goto(origin + '/login')
  await page.locator('#login-name').fill(fixture.login)
  await page.locator('#login-password').fill(readFileSync(fixture.passwordFile, 'utf8').trim())
  await page.locator('button[type=submit]').click()
  await page.waitForURL((url) => url.pathname.startsWith('/tenants/'))
  csrf = (await api('GET', `/api/v1/identity/tenants/${fixture.tenant}/session`)).csrfToken
  phase = 'formal-fields-and-template'
  await write('POST', '/api/v1/asset-retention-policies', {
    key: 'browser_telemetry',
    revision: 1,
    rawSeconds: 604800,
    summarySeconds: 2592000,
    restoreSeconds: 86400,
  })
  for (const [name, kind, valueType, unit] of [
    ['gauge', 'gauge', { kind: 'number' }, 'degree'],
    ['counter', 'cumulative_counter', { kind: 'integer' }, 'byte'],
    ['state', 'state', { kind: 'enum', values: ['running', 'stopped'] }, 'state'],
  ]) {
    phase = 'formal-field-' + name
    const definition = {
      key: `custom.browser.${name}`,
      version: 1,
      valueType,
      nullable: true,
      manual: false,
      sources: { 'agent.script': 0 },
      platforms: ['macos'],
      sensitivity: name === 'counter' ? 'sensitive' : 'standard',
      unit,
      searchable: false,
      itemKey: null,
      timeSeries: {
        kind,
        valuePath: [],
        intervalStartPath: null,
        dimensions: {},
        aggregations:
          kind === 'gauge'
            ? ['min', 'max', 'mean', 'count']
            : kind === 'state'
              ? ['timeline', 'transitions', 'coverage']
              : ['increase', 'rate'],
        retention: { key: 'browser_telemetry', revision: 1 },
        maxResources: 1,
      },
    }
    await write('PUT', `/api/v1/asset-fields/${definition.key}`, { action: 'put', definition })
  }
  const template = randomUUID(),
    scope = randomUUID(),
    content = Buffer.from('#!/bin/sh\n# Controlled synthetic telemetry fixture.\n')
  phase = 'formal-template'
  await write('POST', `/api/v1/resources/${template}`, { action: 'create', kind: 'script' })
  const spec = {
    profile: 'posix_sh',
    sql: null,
    runAs: 'system',
    encoding: 'utf8',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    bindings: {},
    output: {
      type: 'object',
      properties: {
        gauge: { type: 'integer' },
        counter: { type: 'integer' },
        state: { type: 'string' },
      },
      required: ['gauge', 'counter', 'state'],
      additionalProperties: false,
    },
    purpose: {
      kind: 'collection',
      scope: { kind: 'device' },
      applicability: {
        minimumOsVersion: null,
        minimumBuild: null,
        editions: [],
        enrollments: [],
        tools: {},
        capabilities: [],
      },
      mappings: Object.fromEntries(
        ['gauge', 'counter', 'state'].map((k) => [
          `custom.browser.${k}`,
          { pointer: '/' + k, conversion: { kind: 'identity' }, columns: {} },
        ]),
      ),
    },
    timeoutSeconds: 1,
    outputBytes: 4096,
    maxRows: 1,
  }
  await write(
    'POST',
    `/api/v1/resources/${template}`,
    {
      action: 'version',
      version: 'v1',
      kind: 'script',
      variants: [
        {
          platform: 'macos',
          architecture: 'aarch64',
          key: 'default',
          declaration: {
            kind: 'script',
            artifact: {
              reference: 'fixture.sh',
              length: content.length,
              sha256: [...createHash('sha256').update(content).digest()],
            },
            definition: spec,
          },
        },
      ],
    },
    1,
  )
  await api(
    'POST',
    `/api/v1/resources/${template}/content?version=v1&variant=default&platform=macos&architecture=aarch64&operation=${randomUUID()}`,
    content,
    true,
  )
  await write('POST', `/api/v1/resources/${template}`, { action: 'activate', version: 'v1' }, 2)
  const task = await write('POST', `/api/v1/scopes/${scope}`, {
    action: 'put',
    definition: { targets: [{ kind: 'device', id: device }], limitations: null, exclusions: [] },
  })
  for (let i = 0; i < 60; i++) {
    const status = await api('GET', `/api/v1/scopes/${scope}/tasks/${task.task}`)
    if (status.status === 'completed') break
    assert.ok(i < 59, 'scope publication deadline')
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  phase = 'profile-publication-ui'
  await page.goto(path('policies/resources/telemetry'))
  await page.getByRole('button', { name: '新建采集方案', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('模板来源', { exact: true }).selectOption('script')
  await dialog.getByLabel('采集模板', { exact: true }).selectOption(template)
  await dialog
    .getByLabel('精确版本与变体', { exact: true })
    .selectOption(JSON.stringify(['v1', 'macos', 'aarch64', 'default']))
  for (const key of ['gauge', 'counter', 'state'])
    await dialog.getByRole('checkbox', { name: new RegExp('custom.browser.' + key) }).check()
  await dialog.getByRole('button', { name: '下一步', exact: true }).click()
  await dialog.getByLabel('目标范围', { exact: true }).selectOption(scope)
  await dialog.getByLabel('采样周期（秒）', { exact: true }).fill('5')
  await dialog.getByLabel('上传周期（秒）', { exact: true }).fill('10')
  await dialog.getByText('执行与上传预算', { exact: true }).click()
  await dialog.getByLabel('执行时长上限（毫秒）', { exact: true }).fill('1000')
  await dialog.getByRole('button', { name: '下一步', exact: true }).click()
  const frozen = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/api\/v1\/resources\/[^/]+$/.test(new URL(response.url()).pathname) &&
      response.request().postDataJSON()?.input?.action === 'create',
  )
  await dialog.getByRole('button', { name: '保存、上传并激活方案资源', exact: true }).click()
  const profile = (await (await frozen).json()).resource
  await dialog.getByRole('heading', { name: /目标预检/ }).waitFor()
  await dialog
    .getByRole('checkbox', { name: '已核对全部目标、字段集合及整个方案的影响', exact: true })
    .check()
  await dialog.getByRole('button', { name: '确认发布策略变更', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  const policies = await api('GET', `/api/v1/policies?action=telemetry_profile&resource=${profile}`)
  assert.equal(policies.items.length, 1)
  const policy = policies.items[0]
  coverage.push(
    'formal-field-retention-script-mapping-and-immutable-profile-upload-activation-policy-ui',
  )
  phase = 'agent-mtls-ingress'
  const collector = spawnSync(
    'python3',
    [
      fileURLToPath(new URL('./telemetry-agent.py', import.meta.url)),
      process.env.MDM_DEVICE_BROWSER_FIXTURE,
      policy.id,
      policy.versionId,
    ],
    { encoding: 'utf8', timeout: 90000, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  assert.equal(collector.status, 0, collector.stdout.trim())
  coverage.push('real-agent-mtls-ingress-and-exact-batch-replay')
  phase = 'history-and-health-ui'
  const query = {
    device,
    field: 'custom.browser.gauge',
    resource: 'device',
    startMicros: Date.now() * 1000 - 3600_000_000,
    endMicros: Date.now() * 1000 + 1_000_000,
    maxPoints: 256,
    mode: 'history',
    after: null,
  }
  for (let i = 0; i < 80; i++) {
    const history = await api('POST', '/api/v1/telemetry/history', query)
    if (history.rows.length === 12) break
    assert.ok(i < 79, 'history delivery deadline')
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  await page.goto(path(`devices/${device}/history/performance`))
  await page.getByRole('button', { name: /custom.browser.gauge/ }).click()
  await page.locator('.telemetry-chart svg').waitFor()
  await page.getByRole('button', { name: '数据明细', exact: true }).click()
  await page.locator('.telemetry-table tbody tr').nth(11).waitFor()
  assert.equal(await page.locator('.telemetry-line').count(), 2)
  assert.ok((await page.locator('.telemetry-table').innerText()).includes('-12.5'))
  await page.reload()
  await page.getByRole('button', { name: /custom.browser.counter/ }).click()
  await page.locator('.telemetry-chart svg').waitFor()
  assert.ok((await page.locator('.telemetry-readout').innerText()).includes('/s'))
  await page.getByRole('button', { name: /custom.browser.state/ }).click()
  await page.getByRole('img', { name: /离散状态/ }).waitFor()
  assert.equal(await page.locator('.telemetry-line').count(), 0)
  await page.getByRole('link', { name: '采集健康', exact: true }).click()
  await page.getByLabel('指标', { exact: true }).selectOption('custom.browser.gauge')
  await page.getByText('历史已投递', { exact: true }).waitFor()
  await page.getByText(/容量丢弃/).waitFor()
  assert.ok(
    (await page.locator('.telemetry-assignment').allTextContents()).some((text) =>
      text.includes(profile),
    ),
  )
  coverage.push(
    'real-utc-raw-gaps-negative-gauge-server-counter-rate-state-health-and-assigned-summary',
  )
  phase = 'unknown-field-write-ui'
  await page.goto(path('settings/data-collection/metrics'))
  const row = page.locator('tr').filter({ hasText: 'custom.browser.gauge' })
  await row.getByRole('button', { name: '配置', exact: true }).click()
  await dialog
    .getByRole('checkbox', { name: '已核对字段含义、保留策略和引用影响', exact: true })
    .check()
  let operation
  await page.route(
    '**/api/v1/asset-fields/custom.browser.gauge',
    async (route) => {
      operation = route.request().postDataJSON()
      const response = await route.fetch()
      assert.equal(response.status(), 200)
      await route.abort('failed')
    },
    { times: 1 },
  )
  await dialog.getByRole('button', { name: '保存新版本', exact: true }).click()
  await dialog.getByRole('heading', { name: '上次提交结果尚未确认', exact: true }).waitFor()
  await dialog.getByRole('button', { name: '查询对照', exact: true }).click()
  await dialog.getByRole('heading', { name: '上次提交结果尚未确认', exact: true }).waitFor()
  let replay
  await page.route(
    '**/api/v1/asset-fields/custom.browser.gauge',
    async (route) => {
      replay = route.request().postDataJSON()
      await route.continue()
    },
    { times: 1 },
  )
  await dialog.getByRole('button', { name: '重放同一请求', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.deepEqual(replay, operation)
  coverage.push('committed-response-loss-config-comparison-and-explicit-exact-replay')
  phase = 'sensitive-and-device-revocation'
  await page.goto(path(`devices/${device}/history/performance`))
  await page.getByRole('button', { name: /custom.browser.counter/ }).click()
  await page.locator('.telemetry-chart svg').waitFor()
  const counterQuery = { ...query, field: 'custom.browser.counter', maxPoints: 2 },
    counterPage = await api('POST', '/api/v1/telemetry/history', counterQuery)
  assert.ok(counterPage.next, 'counter continuation')
  const gaugeQuery = { ...query, maxPoints: 2 },
    gaugePage = await api('POST', '/api/v1/telemetry/history', gaugeQuery)
  assert.ok(gaugePage.next, 'gauge continuation')
  const deniedContinuation = async (body) => {
    await pace()
    const response = await context.request.post(origin + '/api/v1/telemetry/history', {
      headers: { Origin: origin, 'X-Identity-Request': '1', 'X-CSRF-Token': csrf },
      data: body,
    })
    assert.equal(response.status(), 403)
  }
  const before = (await api('GET', '/api/v1/authorization/rules')).items.find(
    (rule) => rule.id === fixture.ruleId,
  )
  assert.ok(before?.value, 'current fixture authorization rule')
  const grants = before.value.grants.filter((g) => g.operation !== 'inventory_sensitive_read')
  await api('PUT', '/api/v1/authorization/rules/' + fixture.ruleId, {
    operationId: randomUUID(),
    expectedRevision: before.revision,
    value: { ...before.value, grants },
  })
  await deniedContinuation({ ...counterQuery, after: counterPage.next })
  await page.getByRole('button', { name: '重新读取', exact: true }).last().click()
  await page.getByRole('alert').first().waitFor()
  assert.equal(await page.locator('.telemetry-chart').count(), 0)
  const scoped = (await api('GET', '/api/v1/authorization/rules')).items.find(
    (rule) => rule.id === fixture.ruleId,
  )
  assert.ok(scoped?.value, 'current scoped authorization rule')
  await api('PUT', '/api/v1/authorization/rules/' + fixture.ruleId, {
    operationId: randomUUID(),
    expectedRevision: scoped.revision,
    value: {
      ...scoped.value,
      grants: scoped.value.grants.filter((g) => g.operation !== 'inventory_read'),
    },
  })
  await deniedContinuation({ ...gaugeQuery, after: gaugePage.next })
  await page.reload()
  await page.getByRole('alert').first().waitFor()
  assert.equal(await page.locator('.telemetry-chart').count(), 0)
  coverage.push('sensitive-field-and-device-revocation-clear-returned-data')
  assert.deepEqual(pageErrors, [])
  result = 'passed'
} catch (error) {
  console.log(
    JSON.stringify({
      phase,
      result: 'failed',
      classification: error.name,
      line: error.stack
        ?.split('\n')
        .find((line) => line.includes('telemetry-browser.mjs:'))
        ?.trim(),
      failures,
      pageErrors,
      controls: await page.locator('select').evaluateAll((elements) =>
        elements.map((element) => ({
          name: element.getAttribute('aria-label'),
          disabled: element.matches(':disabled'),
          value: element.value,
          options: [...element.options].map((option) => option.value),
        })),
      ),
      alerts: await page.getByRole('alert').allTextContents(),
    }),
  )
} finally {
  clearTimeout(timeout)
  await close()
  if (cleanupFailed) result = 'failed'
  console.log(
    JSON.stringify({
      phase: 'telemetry-browser',
      result,
      coverage,
      browserCleanup: cleanupFailed ? 'failed' : 'passed',
    }),
  )
  if (result !== 'passed') process.exitCode = 1
}
