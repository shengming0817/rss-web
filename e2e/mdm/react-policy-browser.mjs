// Real HTTPS Scope → Policy → independent event seams; no synthetic device effect assertion.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { realBrowser } from './react-mdm-browser.mjs'

const run = await realBrowser('MDM_DEVICE_BROWSER_FIXTURE', 'react-policy')
let failure
try {
  const { fixture: f, origin, checks } = run,
    p = await run.page(),
    button = (name) => p.getByRole('button', { name, exact: true }).filter({ visible: true }),
    label = (name) => p.getByLabel(name, { exact: true }).filter({ visible: true })
  async function api(method, path, data, expected = 200) {
    const headers = {}
    if (method !== 'GET') {
      const session = await p.request.get(`${origin}/api/v1/identity/tenants/${f.tenant}/session`)
      assert.equal(session.status(), 200)
      Object.assign(headers, {
        Origin: origin,
        'X-Identity-Request': '1',
        'X-CSRF-Token': (await session.json()).csrfToken,
      })
    }
    const response = await p.request.fetch(origin + path, {
      method,
      headers,
      ...(data === undefined ? {} : { data }),
    })
    assert.equal(response.status(), expected, `${method} ${path.split('?')[0]}`)
    return expected === 204 ? null : response.json()
  }
  async function settled(policy) {
    for (let i = 0; i < 90; i++) {
      const response = await p.request.get(`${origin}/api/v1/policies/${policy}/scope`)
      if (response.status() === 503) {
        await response.dispose()
        await new Promise((resolve) => setTimeout(resolve, 500))
        continue
      }
      assert.equal(response.status(), 200)
      const scope = await response.json()
      if (scope.resolution) return scope
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    assert.fail('bounded owned scope publication')
  }
  await run.login(p)
  run.step('copy-original-agent-batch')
  const agentEvent = await api(
    'POST',
    `/api/v1/devices/${f.agent}/policy-events`,
    { operationId: randomUUID(), event: 'react.policy.entry-copy', source: { kind: 'human' } },
    202,
  )
  await run.nav(
    p,
    `/policies?${new URLSearchParams({ tab: 'events', eventDevice: f.agent, batch: agentEvent.batchId })}`,
    '策略与部署',
  )
  await p.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin })
  await button('显示 Agent 查看入口').click()
  await button('复制命令 · 原事件批次').click()
  await p.getByRole('status').filter({ hasText: '已复制 · 原事件批次' }).waitFor()
  const copiedBatch = await p.evaluate(() => globalThis.navigator.clipboard.readText())
  assert.ok(copiedBatch.startsWith("rssmdm open '"))
  assert.ok(copiedBatch.endsWith("'"))
  const batchUri = new URL(copiedBatch.slice("rssmdm open '".length, -1))
  assert.equal(batchUri.pathname, `/v1/batch/${agentEvent.batchId}`)
  assert.equal(batchUri.searchParams.get('device'), f.agent)
  assert.equal(batchUri.searchParams.get('tenant'), f.tenant)
  const registered = await api('GET', `/api/v1/devices/${f.agent}`)
  assert.ok(registered)
  assert.equal(batchUri.searchParams.get('instance'), f.instance)

  checks.push('real-batch-copy-for-current-agent-registration')
  await run.nav(p, '/groups', '设备组')
  run.step('group-unsaved-readonly-sample')
  const beforeGroups = await api('GET', '/api/v1/groups?fields=id&limit=100')
  await button('新建设备组').click()
  await run.choose(p, label('设备组类型'), '动态设备组')
  await label('条件字段').fill('custom.asset_tag')
  await label('文本值').fill(f.mdm)
  const sampleResponse = await run.response(p, 'POST', '/api/v1/groups/previews', () =>
      button('预览当前条件样例（不保存）').click(),
    ),
    sample = await sampleResponse.json()
  assert.equal(sampleResponse.status(), 200)
  assert.ok(sample.items.length <= 1000)
  assert.ok(sample.items.some((item) => item.kind === 'endpoint' && item.id === f.mdm))
  assert.equal(typeof sample.scanComplete, 'boolean')
  assert.equal(sample.assetCut.tenant, f.tenant)
  assert.equal('task' in sample, false)
  assert.equal('editing' in sampleResponse.request().postDataJSON(), false)
  await p.getByText('条件匹配样例', { exact: true }).waitFor()
  const afterGroups = await api('GET', '/api/v1/groups?fields=id&limit=100')
  assert.deepEqual(afterGroups.items, beforeGroups.items)
  await label('文本值').fill('changed-unsaved-draft')
  assert.equal(await p.getByText('条件匹配样例', { exact: true }).count(), 0)
  await button('关闭设备组详情').click()
  checks.push('real-unsaved-group-preview-bounded-readonly-sample-and-draft-invalidation')
  await run.nav(p, '/policies', '策略与部署')
  await button('新建部署').click()
  await run.choose(p, label('策略动作'), '设备退管')
  await label('唯一别名').fill('react.policy.scope')
  await label('共享事件名').fill('react.policy.event')
  await p.getByRole('tab', { name: '范围', exact: true }).click()
  for (const endpoint of [f.mdm, f.agent]) {
    await p
      .getByRole('region', { name: '目标（并集）', exact: true })
      .getByRole('button', { name: '添加终端', exact: true })
      .click()
    const drawer = p.getByRole('dialog', { name: '目标（并集） · 选择对象', exact: true })
    await drawer.locator('.directory-advanced summary').click()
    await drawer.getByRole('radio', { name: 'RSQL', exact: true }).check()
    await drawer
      .getByRole('textbox', { name: 'RSQL', exact: true })
      .fill(`key=='endpoint:${endpoint}'`)
    await drawer.getByRole('button', { name: '应用', exact: true }).click()
    const choice = drawer.getByRole('row').filter({ hasText: endpoint }).getByRole('checkbox')
    await choice.click()
    await p.waitForFunction((input) => input.checked, await choice.elementHandle())
    await drawer.getByRole('button', { name: '完成选择', exact: true }).click()
  }
  run.step('owned-scope-draft-preview')
  const before = await api('GET', '/api/v1/policies?fields=id&limit=100')
  const previewResponse = p.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      /\/policies\/[^/]+\/scope\/previews$/.test(new URL(r.url()).pathname),
  )
  await button('预览当前范围样例（不保存）').click()
  const preview = await previewResponse,
    scopeSample = await preview.json()
  assert.equal(preview.status(), 200)
  assert.equal(preview.request().postDataJSON().expectedRevision, 0)
  assert.ok(scopeSample.items.length <= 1000)
  assert.equal(scopeSample.assetCut.tenant, f.tenant)
  assert.deepEqual((await api('GET', '/api/v1/policies?fields=id&limit=100')).items, before.items)
  await label('限制范围（交集）').check()
  assert.equal(await p.getByText('本次匹配样例', { exact: false }).count(), 0)
  await label('限制范围（交集）').uncheck()
  await label('确认范围、资源、调度与潜在影响').check()
  const save = p.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      /\/api\/v1\/policies\/[^/]+$/.test(new URL(r.url()).pathname),
  )
  await button('保存策略定义').click()
  const response = await save,
    policy = await response.json(),
    path = '/api/v1/policies/' + policy.id
  assert.equal(response.status(), 200)
  assert.deepEqual(
    policy.definition.scope.targets.map((item) => item.id).sort(),
    [f.agent, f.mdm].sort(),
  )
  assert.equal(policy.definition.scope.limitations, null)
  assert.equal(policy.state, 'disabled')
  const published = await settled(policy.id)
  const members = await api(
    'GET',
    `${path}/scope/results/${published.resolution}/members?channel=mdm&limit=100`,
  )
  assert.equal(members.scope, published.id)
  checks.push('real-policy-atomic-config-and-owned-scope-save-bounded-draft-preview')
  run.step('owned-scope-recompute-original-operation')
  await button('读取已保存范围').click()
  const recomputePath = path + '/scope/recomputations'
  let original, receipt
  await p.route(origin + recomputePath, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    if (!original) {
      original = route.request().postDataJSON()
      const actual = await route.fetch()
      assert.equal(actual.status(), 200)
      receipt = await actual.json()
      return route.abort('failed')
    }
    assert.deepEqual(route.request().postDataJSON(), original)
    await route.continue()
  })
  await button('重新计算已保存范围').click()
  await label('确认重发原重算操作').waitFor()
  await label('确认重发原重算操作').check()
  const retry = await run.response(p, 'POST', recomputePath, () => button('重提原重算请求').click())
  assert.deepEqual(await retry.json(), receipt)
  assert.equal((await api('GET', path)).revision, policy.revision)
  await p.unroute(origin + recomputePath)
  checks.push('real-owned-scope-recompute-original-intent-replay-preserves-policy-CAS')
  await button('返回策略目录').click()
  await run.nav(p, `/policies?policy=${policy.id}&tab=configuration`, '策略与部署')
  await label('唯一别名').waitFor()
  await label('唯一别名').fill('react.policy.draft')
  assert.equal(await button('启用策略').isEnabled(), false)
  await label('唯一别名').fill('react.policy.scope')
  await label('确认已保存范围与动作后启用').check()
  await run.response(p, 'POST', path, () => button('启用策略').click())
  assert.equal((await api('GET', path)).versionId, policy.versionId)
  checks.push('real-policy-lifecycle-dirty-guard-and-independent-execution-version')
  for (const width of [1440, 768, 390]) {
    await p.setViewportSize({ width, height: 900 })
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  }
  checks.push('policy-page-desktop-tablet-mobile-no-document-overflow')
} catch (error) {
  failure = error
  const shape = (value) =>
    value === null
      ? 'null'
      : Array.isArray(value)
        ? `array:${value.length}`
        : typeof value === 'number'
          ? value
          : typeof value
  console.error(
    JSON.stringify({
      journey: 'react-policy',
      classification: error?.name,
      location: error?.stack?.match(/react-policy-browser\.mjs:\d+:\d+/)?.[0],
      operator: error?.operator,
      actualShape: shape(error?.actual),
      expectedShape: shape(error?.expected),
    }),
  )
} finally {
  await run.finish(failure)
}
