// Real HTTPS + Agent mTLS; synthetic inputs do not assert real device collection.
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { randomUUID, createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { realBrowser } from './react-mdm-browser.mjs'
const run = await realBrowser('MDM_DEVICE_BROWSER_FIXTURE', 'react-telemetry')
let failure
try {
  const { fixture, origin, checks: coverage } = run,
    page = await run.page(),
    device = fixture.collector.runtime.deviceId
  await run.login(page)
  let csrf = (
    await (
      await page.request.get(origin + `/api/v1/identity/tenants/${fixture.tenant}/session`)
    ).json()
  ).csrfToken
  async function api(method, path, body, binary = false) {
    const response = await page.request.fetch(origin + path, {
      method,
      headers: {
        Origin: origin,
        'X-Identity-Request': '1',
        'X-CSRF-Token': csrf,
        ...(binary ? { 'Content-Type': 'application/octet-stream' } : {}),
      },
      ...(body === undefined ? {} : { data: body }),
    })
    assert.ok(
      response.status() >= 200 && response.status() < 300,
      `HTTP ${response.status()} ${path.split('?')[0]}`,
    )
    return response.status() === 201 || response.status() === 204 ? null : response.json()
  }
  const write = (method, path, input, expectedRevision = 0) =>
    api(method, path, { operationId: randomUUID(), expectedRevision, input })
  run.step('formal-fields-and-template')
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
    run.step('formal-field-' + name)
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
  const invalidCounter = await page.request.put(
    origin + '/api/v1/asset-fields/custom.browser.invalid_counter',
    {
      headers: { Origin: origin, 'X-Identity-Request': '1', 'X-CSRF-Token': csrf },
      data: {
        operationId: randomUUID(),
        expectedRevision: 0,
        input: {
          action: 'put',
          definition: {
            key: 'custom.browser.invalid_counter',
            version: 1,
            valueType: { kind: 'integer' },
            nullable: true,
            manual: false,
            sources: { 'agent.script': 0 },
            platforms: ['macos'],
            sensitivity: 'standard',
            unit: 'byte',
            searchable: false,
            itemKey: null,
            timeSeries: {
              kind: 'cumulative_counter',
              valuePath: [],
              intervalStartPath: null,
              dimensions: {},
              aggregations: ['count'],
              retention: { key: 'browser_telemetry', revision: 1 },
              maxResources: 1,
            },
          },
        },
      },
    },
  )
  assert.equal(invalidCounter.status(), 400, 'backend owns cross-field aggregation admission')
  const template = randomUUID(),
    scope = randomUUID(),
    content = Buffer.from('#!/bin/sh\n# Controlled synthetic telemetry fixture.\n')
  run.step('formal-template')
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

  run.step('publish-exact-profile')
  const profile = randomUUID(),
    definition = {
      template: {
        resource: template,
        version: 'v1',
        variant: 'default',
        platform: 'macos',
        architecture: 'aarch64',
      },
      parameters: {},
      fields: ['gauge', 'counter', 'state'].map((key) => ({
        key: 'custom.browser.' + key,
        version: 1,
      })),
      projection: 'both',
      sampleMillis: 5000,
      uploadMillis: 10000,
      budget: { points: 256, bytes: 65536, resources: 1, executionMillis: 1000, outputBytes: 4096 },
      boost: null,
      backfillSeconds: 86400,
    },
    bytes = Buffer.from(JSON.stringify(definition))
  await write('POST', `/api/v1/resources/${profile}`, {
    action: 'create',
    kind: 'telemetry_profile',
  })
  await write(
    'POST',
    `/api/v1/resources/${profile}`,
    {
      action: 'version',
      version: 'profile-v1',
      kind: 'telemetry_profile',
      variants: [
        {
          platform: 'macos',
          architecture: 'aarch64',
          key: 'default',
          declaration: {
            kind: 'telemetry_profile',
            artifact: {
              reference: 'profile.json',
              length: bytes.length,
              sha256: [...createHash('sha256').update(bytes).digest()],
            },
            definition,
          },
        },
      ],
    },
    1,
  )
  await api(
    'POST',
    `/api/v1/resources/${profile}/content?version=profile-v1&variant=default&platform=macos&architecture=aarch64&operation=${randomUUID()}`,
    bytes,
    true,
  )
  await write(
    'POST',
    `/api/v1/resources/${profile}`,
    { action: 'activate', version: 'profile-v1' },
    2,
  )
  const policyId = randomUUID()
  await write('POST', `/api/v1/policies/${policyId}`, {
    action: 'put',
    definition: {
      scope,
      alias: '遥测浏览器方案',
      customEvent: null,
      action: {
        kind: 'telemetry_profile',
        resource: {
          id: profile,
          version: 'profile-v1',
          variant: 'default',
          platform: 'macos',
          architecture: 'aarch64',
        },
      },
    },
  })
  const policy = await api('GET', `/api/v1/policies/${policyId}`)
  run.step('agent-mtls-ingress')
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
  assert.equal(collector.status, 0, 'Agent telemetry ingress')
  coverage.push('real-agent-mtls-ingress-batch-replay-and-gap-report')
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
    const result = await api('POST', '/api/v1/telemetry/history', query)
    if (result.rows.length === 12) break
    assert.ok(i < 79, 'observation publication deadline')
    await new Promise((done) => setTimeout(done, 250))
  }
  run.step('history-query-and-series')
  await run.nav(page, `/telemetry?device=${encodeURIComponent(device)}`, '遥测与采集')
  const label = (name) => page.getByLabel(name, { exact: true }).filter({ visible: true }),
    button = (name) => page.getByRole('button', { name, exact: true }).filter({ visible: true })
  await label('字段键').fill(query.field)
  await label('序列资源').fill('device')
  await label('结束时间（UTC，不含）').fill(new Date(Date.now() + 60000).toISOString().slice(0, 19))
  const firstHistoryResponse = await run.response(page, 'POST', '/api/v1/telemetry/history', () =>
    button('查询已上报数据').click(),
  )
  const representativeHistory = await firstHistoryResponse.json()
  await page.locator('.telemetry-results').getByText('-12.5 degree', { exact: true }).waitFor()
  await label('精确序列与维度').click()
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').first().click()
  await page.locator('.telemetry-chart svg').waitFor()
  assert.equal(await page.locator('.telemetry-point').count(), 10)
  const aggregateResponse = await run.response(page, 'POST', '/api/v1/telemetry/aggregate', () =>
    button('查询聚合').click(),
  )
  const aggregatePage = await aggregateResponse.json(),
    gaugeBucket = aggregatePage.buckets.find(
      (b) => b.value && typeof b.value === 'object' && 'Number' in b.value,
    )
  assert.ok(gaugeBucket, 'a numeric gauge bucket')
  await page
    .locator('.telemetry-aggregate')
    .getByRole('cell', { name: String(gaugeBucket.value.Number.value) + ' degree', exact: true })
    .waitFor()
  await page
    .locator('.telemetry-aggregate')
    .getByRole('cell', {
      name: `${gaugeBucket.covered_micros} / ${gaugeBucket.window.end - gaugeBucket.window.start}`,
      exact: true,
    })
    .first()
    .waitFor()
  await page
    .locator('.telemetry-health-grid')
    .getByRole('cell', { name: '10 / 1 / 1', exact: true })
    .waitFor()
  await page
    .locator('.telemetry-health-grid')
    .getByText(/容量不足.*3/)
    .waitFor()
  await page
    .locator('.telemetry-health-grid')
    .getByText(
      `${fixture.collector.runtime.registrationId} / ${fixture.collector.runtime.generation}`,
      { exact: true },
    )
    .waitFor()
  coverage.push('real-health-quality-counts-and-capacity-gap-registration')
  await page.locator('.telemetry-aggregate').waitFor()
  await page.getByText('仅统计已观察数据', { exact: true }).waitFor()
  coverage.push('negative-gauge-missing-failed-exact-series-server-aggregate-and-observed-coverage')
  run.step('counter-rate-and-state-timeline')
  async function selectSeries() {
    await label('精确序列与维度').click()
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option').first().click()
  }
  async function queryField(field) {
    await label('字段键').fill(field)
    await label('序列资源').fill('device')
    await run.response(page, 'POST', '/api/v1/telemetry/history', () =>
      button('查询已上报数据').click(),
    )
    await page.locator('.telemetry-results table tbody tr').first().waitFor()
  }
  await queryField('custom.browser.counter')
  await selectSeries()
  await run.choose(page, label('聚合含义'), '每秒速率')
  const rateResponse = await run.response(page, 'POST', '/api/v1/telemetry/aggregate', () =>
      button('查询聚合').click(),
    ),
    ratePage = await rateResponse.json(),
    rateBucket = ratePage.buckets.find(
      (b) => b.value && typeof b.value === 'object' && 'Rate' in b.value,
    )
  assert.ok(rateBucket, 'counter rate bucket')
  const rate = rateBucket.value.Rate,
    increase = Object.values(rate.increase)[0],
    expectedRate = increase / (rate.duration_micros / 1_000_000)
  await page
    .locator('.telemetry-aggregate')
    .getByRole('cell', { name: String(expectedRate) + ' byte/s', exact: true })
    .waitFor()
  await queryField('custom.browser.state')
  await selectSeries()
  assert.equal(
    await page.locator('.telemetry-chart').count(),
    0,
    'discrete values never drawn as a numeric curve',
  )
  const stateResponse = await run.response(page, 'POST', '/api/v1/telemetry/aggregate', () =>
      button('查询聚合').click(),
    ),
    statePage = await stateResponse.json(),
    stateBucket = statePage.buckets.find(
      (b) => b.value && typeof b.value === 'object' && b.value.StateSegments?.length,
    )
  assert.ok(stateBucket, 'state timeline bucket')
  await page
    .locator('.telemetry-aggregate')
    .getByRole('cell')
    .filter({ hasText: 'running' })
    .first()
    .waitFor()
  coverage.push('counter-rate-from-formal-statistics-and-discrete-state-timeline')
  run.step('no-data-and-unsafe-integer-fixture')
  await label('字段键').fill(query.field)
  await label('序列资源').fill('device')
  await label('开始时间（UTC）').fill('1970-01-01T00:00:00')
  await label('结束时间（UTC，不含）').fill('1970-01-01T00:00:01')
  const emptyResponse = await run.response(page, 'POST', '/api/v1/telemetry/history', () =>
    button('查询已上报数据').click(),
  )
  assert.equal((await emptyResponse.json()).rows.length, 0)
  await page.locator('.telemetry-results').getByText('没有数据', { exact: true }).first().waitFor()
  await label('开始时间（UTC）').fill(new Date(query.startMicros / 1000).toISOString().slice(0, 19))
  await label('结束时间（UTC，不含）').fill(new Date(Date.now() + 60000).toISOString().slice(0, 19))
  const unsafe = structuredClone(representativeHistory),
    unsafeRow = unsafe.rows.find((r) => r.sample.reading.quality === 'valid')
  unsafeRow.sample.series.definition.metric = { kind: 'gauge', number: 'i64' }
  unsafeRow.sample.reading.value = {
    type: 'number',
    value: { type: 'i64', value: 9007199254740992 },
  }
  await page.route(
    '**/api/v1/telemetry/history',
    (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(unsafe) }),
    { times: 1 },
  )
  await run.response(page, 'POST', '/api/v1/telemetry/history', () =>
    button('查询已上报数据').click(),
  )
  await page
    .locator('.telemetry-results')
    .getByText('无法读取当前数据，请检查查询或连接后重新读取。', { exact: true })
    .waitFor()
  assert.equal(await page.locator('.telemetry-results table tbody tr').count(), 0)
  coverage.push('real-empty-query-distinct-from-explicit-unsafe-integer-fixture-failure-gap-3139')
  await run.choose(page, label('查询模式'), '最新有效来源')
  await run.response(page, 'POST', '/api/v1/telemetry/history', () =>
    button('查询已上报数据').click(),
  )
  assert.equal(await button('下一页观察').count(), 0)
  coverage.push('latest-server-selected-source-without-continuation')
  run.step('configuration-preview-and-links')
  await page.getByRole('tab', { name: '配置发现与预览', exact: true }).click()
  await button('预览精确配置').first().click()
  await page.getByRole('heading', { name: '精确采集方案预览', exact: true }).waitFor()
  await page.getByText('custom.browser.gauge', { exact: true }).filter({ visible: true }).waitFor()
  assert.ok((await page.locator('.telemetry-preview').innerText()).includes('profile-v1'))
  await page.getByRole('link', { name: '在资源库打开精确方案', exact: true }).click()
  await button('读取精确资源').click()
  await label('资源固定版本').waitFor()
  assert.ok((await page.locator('.resource-detail').innerText()).includes('profile-v1'))
  coverage.push('configuration-registration-exact-resource-version-template-policy-scope-links')
  run.step('responsive-design')
  const shots = mkdtempSync(join(tmpdir(), 'rss-react-telemetry-'))
  for (const [name, width] of [
    ['desktop', 1440],
    ['tablet', 820],
    ['mobile', 390],
  ]) {
    await page.setViewportSize({ width, height: 960 })
    await run.nav(page, `/telemetry?device=${encodeURIComponent(device)}`, '遥测与采集')
    await page.getByRole('tab', { name: '配置发现与预览', exact: true }).click()
    await button('预览精确配置').first().waitFor()
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'page fits viewport',
    )
    await page.screenshot({ path: join(shots, name + '.png'), fullPage: true })
  }
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'))
  await page.screenshot({ path: join(shots, 'dark.png'), fullPage: true })
  coverage.push('desktop-tablet-mobile-dark-public-screenshots:' + shots)
  run.step('revoked-permission-clears-results')
  await page.setViewportSize({ width: 1440, height: 960 })
  await run.nav(page, `/telemetry?device=${encodeURIComponent(device)}`, '遥测与采集')
  await label('字段键').fill(query.field)
  await label('序列资源').fill('device')
  await label('结束时间（UTC，不含）').fill(new Date(Date.now() + 60000).toISOString().slice(0, 19))
  await run.response(page, 'POST', '/api/v1/telemetry/history', () =>
    button('查询已上报数据').click(),
  )
  await page.locator('.telemetry-results').getByText('-12.5 degree', { exact: true }).waitFor()
  const scoped = await api('GET', '/api/v1/authorization/rules/' + fixture.ruleId)
  await api('PUT', '/api/v1/authorization/rules/' + fixture.ruleId, {
    operationId: randomUUID(),
    expectedRevision: scoped.revision,
    value: {
      ...scoped.value,
      grants: scoped.value.grants.filter((g) => g.operation !== 'inventory_read'),
    },
  })
  await run.response(
    page,
    'POST',
    '/api/v1/telemetry/history',
    () => button('重新读取数据').click(),
    403,
  )
  await page
    .getByText('服务端已拒绝读取，已清除遥测结果。请重新读取权限。', { exact: true })
    .waitFor()
  assert.equal(
    await page.locator('.telemetry-results,.telemetry-health-grid,.telemetry-chart').count(),
    0,
  )
  coverage.push('real-revoked-authority-denies-query-and-clears-all-telemetry-facts')
} catch (error) {
  failure = error
  console.error(
    JSON.stringify({
      journey: 'react-telemetry',
      classification: error.name,
      message: error.message?.slice(0, 160),
    }),
  )
} finally {
  await run.finish(failure)
}
