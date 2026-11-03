// New React pages over the existing isolated HTTPS product fixture. No mocked business response.
import { realBrowser } from './react-mdm-browser.mjs'
import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const run = await realBrowser('MDM_DEVICE_BROWSER_FIXTURE', 'react-assets')
let failure, diagnosticPage
const groupRequests = []
try {
  const { fixture: f, origin, checks } = run,
    p = await run.page()
  diagnosticPage = p
  p.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path.startsWith('/api/v1/groups/')) {
      groupRequests.push({ method: request.method(), path })
      if (groupRequests.length > 12) groupRequests.shift()
    }
  })
  await run.login(p)
  // Hidden retained panes keep operation owners; target the current visible control.
  const visibleLabel = (name) => p.getByLabel(name, { exact: true }).filter({ visible: true })
  let interceptionFailed = false
  // Playwright route failures include authentication headers; surface only safe coordinates.
  async function intercept(pattern, handler) {
    await p.route(pattern, async (route) => {
      try {
        await handler(route)
      } catch (error) {
        interceptionFailed = true
        console.error(
          JSON.stringify({
            journey: 'react-assets',
            interceptionFailure: error.name,
            failureLocation: error.stack?.match(/react-assets-browser\.mjs:(\d+):(\d+)/)?.[0],
          }),
        )
        await route.abort('failed').catch(() => {})
      }
    })
  }
  async function waitUntil(condition) {
    const deadline = Date.now() + 20000
    while (!condition()) {
      if (interceptionFailed || Date.now() >= deadline) throw new Error('interception-unconfirmed')
      await new Promise((done) => setTimeout(done, 50))
    }
  }
  let nextApi = 0
  async function api(method, path, data, status = 200) {
    const wait = Math.max(0, nextApi - Date.now())
    nextApi = Date.now() + wait + 220
    if (wait) await new Promise((done) => setTimeout(done, wait))
    let headers
    if (method !== 'GET') {
      const session = await p.request.get(origin + `/api/v1/identity/tenants/${f.tenant}/session`)
      assert.equal(session.status(), 200)
      headers = {
        Origin: origin,
        'X-Identity-Request': '1',
        'X-CSRF-Token': (await session.json()).csrfToken,
      }
    }
    const response = await p.request.fetch(origin + path, {
      method,
      ...(headers ? { headers } : {}),
      ...(data === undefined ? {} : { data }),
    })
    assert.equal(
      response.status(),
      status,
      `HTTP ${method} ${path.split('/').slice(0, 5).join('/')}`,
    )
    return status === 201 || status === 204 ? response : response.json()
  }
  const operation = (input, expectedRevision = 0) => ({
    operationId: randomUUID(),
    expectedRevision,
    input,
  })
  const tab = (name) => p.getByRole('tab', { name, exact: true }).click()
  async function poll(path, trigger, value, complete, seconds = 90) {
    const until = Date.now() + seconds * 1000
    let observed
    do {
      const response = await run.response(p, 'GET', path, trigger)
      observed = value(await response.json())
      if (complete(observed)) return observed
      await new Promise((done) => setTimeout(done, 350))
    } while (Date.now() < until)
    throw new Error('product-task-deadline')
  }
  async function settleQuery(task) {
    const state = await poll(
      `/api/v1/device-queries/${task}`,
      () => p.getByRole('button', { name: '读取查询进度与结果', exact: true }).click(),
      (v) => v.asset,
      (v) => ['completed', 'failed'].includes(v.status),
    )
    assert.equal(state.status, 'completed')
    await p.getByRole('link', { name: f.mdm, exact: true }).first().waitFor()
    return state
  }
  async function openGroup(id, name) {
    await run.nav(p, '/groups', '设备组')
    await visibleLabel('服务端筛选').fill(`id==${id}`)
    await run.response(p, 'GET', '/api/v1/groups', () =>
      p.getByRole('button', { name: '应用', exact: true }).click(),
    )
    const card = p.locator('.asset-group-card').filter({ hasText: name })
    await run.response(p, 'GET', `/api/v1/groups/${id}`, () =>
      card.getByRole('button', { name: '查看定义与成员 →', exact: true }).click(),
    )
  }
  async function settleGroup(id, task) {
    const value = await poll(
      `/api/v1/groups/${id}/tasks/${task}`,
      () => p.getByRole('button', { name: '读取任务进度', exact: true }).click(),
      (v) => v,
      (v) => ['completed', 'failed', 'superseded'].includes(v.status),
    )
    assert.equal(value.status, 'completed')
    return value
  }
  async function settleCompliance(id, task) {
    const value = await poll(
      `/api/v1/compliance-rules/${id}/tasks/${task}`,
      () => p.getByRole('button', { name: '读取合规进度', exact: true }).first().click(),
      (v) => v,
      (v) => v.completed,
    )
    assert.equal(value.phase, 'published')
    assert.ok(Number.isSafeInteger(value.processed))
    return value
  }

  run.step('fixed-query-and-live-facts')
  await run.nav(p, '/inventory', '资产查询')
  await visibleLabel('服务端 RSQL 条件').fill("custom.asset_tag=='fixture-mdm'")
  const accepted = (
    await (
      await run.response(
        p,
        'POST',
        '/api/v1/device-queries',
        () => p.getByRole('button', { name: '运行资产查询', exact: true }).click(),
        202,
      )
    ).json()
  ).asset
  const state = await settleQuery(accepted.task)
  assert.ok(state.summary.total >= 27)
  assert.equal(state.summary.matched, 1)
  const fixedPath = `/api/v1/device-queries/${accepted.task}/items?limit=1`,
    fixed = (await api('GET', fixedPath)).asset,
    live = (await api('GET', `/api/v1/devices/${f.mdm}/inventory`)).asset.device
  await api(
    'PUT',
    `/api/v1/devices/${f.mdm}/manual-fields/custom.asset_tag`,
    operation(
      { action: 'set', value: { kind: 'string', value: 'fixture-updated' } },
      live.revisions['custom.asset_tag'],
    ),
  )
  assert.deepEqual((await api('GET', fixedPath)).asset, fixed)
  assert.equal(
    (await api('GET', `/api/v1/devices/${f.mdm}/inventory`)).asset.device.fields['custom.asset_tag']
      .state.value.value,
    'fixture-updated',
  )
  checks.push('real-async-full-authorized-query-and-immutable-results-distinct-from-live')

  run.step('saved-query-unknown-recovery-and-revision')
  await tab('保存查询')
  await p.getByRole('button', { name: '新建保存查询', exact: true }).click()
  await visibleLabel('查询名称').fill('React saved assets')
  await visibleLabel('服务端 RSQL 条件').fill("custom.asset_tag!='excluded'")
  let savedOriginal,
    savedReplay,
    savedId,
    savedCommits = 0
  const savedPattern = origin + '/api/v1/saved-queries/*'
  await intercept(savedPattern, async (route) => {
    if (route.request().method() !== 'PUT') return route.continue()
    const body = route.request().postDataJSON()
    if (!savedOriginal) {
      savedOriginal = body
      savedId = new URL(route.request().url()).pathname.split('/').at(-1)
      const actual = await route.fetch({ timeout: 15000, maxRetries: 0 })
      assert.equal(actual.status(), 200)
      savedCommits++
      await route.abort('failed')
    } else {
      savedReplay = body
      await route.continue()
    }
  })
  await p.getByRole('button', { name: '保存查询定义', exact: true }).click()
  await p.getByRole('button', { name: '显式重提原保存查询变更', exact: true }).waitFor()
  await waitUntil(() => savedCommits === 1)
  assert.equal(savedCommits, 1)
  await p.getByRole('button', { name: '读取资产入口权限', exact: true }).click()
  await tab('字段目录')
  await tab('保存查询')
  assert.equal(run.count(p, 'PUT', `/api/v1/saved-queries/${savedId}`), 1)
  await run.response(p, 'PUT', `/api/v1/saved-queries/${savedId}`, () =>
    p.getByRole('button', { name: '显式重提原保存查询变更', exact: true }).click(),
  )
  assert.deepEqual(savedReplay, savedOriginal)
  await p.unroute(savedPattern)
  await p.getByRole('button', { name: '查询定义变更已确认，重新读取', exact: true }).click()
  await p.getByRole('button', { name: 'React saved assets', exact: true }).click()
  const savedExecution = await run.response(
    p,
    'POST',
    `/api/v1/saved-queries/${savedId}/execute`,
    () => p.getByRole('button', { name: '执行已读取版本的保存查询', exact: true }).click(),
    202,
  )
  assert.equal(savedExecution.request().postDataJSON().expectedRevision, 1)
  const savedTask = (await savedExecution.json()).asset.task
  await settleQuery(savedTask)
  const itemsPath = `/api/v1/device-queries/${savedTask}/items`
  const firstPage = (
    await (
      await run.response(p, 'GET', itemsPath, () => visibleLabel('固定结果每页条目').fill('1'))
    ).json()
  ).asset
  assert.equal(firstPage.items.length, 1)
  assert.ok(firstPage.nextCursor)
  const fixedPanel = p
    .locator('.ant-card')
    .filter({ has: visibleLabel('固定结果每页条目') })
    .last()
  const following = await run.response(p, 'GET', itemsPath, () =>
    fixedPanel.getByRole('button', { name: '下一页', exact: true }).first().click(),
  )
  assert.equal(new URL(following.url()).searchParams.get('cursor'), firstPage.nextCursor)
  const stored = (await api('GET', `/api/v1/saved-queries/${savedId}`)).asset.query
  await api(
    'PUT',
    `/api/v1/saved-queries/${savedId}`,
    operation(
      { action: 'put', definition: { ...stored.definition, name: 'React saved updated' } },
      stored.revision,
    ),
  )
  await p.getByRole('button', { name: '开始另一次查询', exact: true }).click()
  await run.response(
    p,
    'POST',
    `/api/v1/saved-queries/${savedId}/execute`,
    () => p.getByRole('button', { name: '执行已读取版本的保存查询', exact: true }).click(),
    409,
  )
  await p.getByRole('button', { name: '放弃已拒绝查询', exact: true }).click()
  checks.push(
    'real-saved-query-committed-loss-permission-tab-retention-explicit-replay-cas-and-cursor',
  )

  run.step('field-layout-and-typed-manual-value')
  await tab('字段目录')
  await visibleLabel('新字段键').fill('custom.react_ready')
  await p.getByRole('button', { name: '新建字段', exact: true }).click()
  await run.choose(p, visibleLabel('值类型').first(), '布尔值')
  await p.getByRole('checkbox', { name: '允许手工录入', exact: true }).check()
  await run.choose(p, visibleLabel('添加字段来源'), 'manual')
  await p.getByRole('button', { name: '添加来源', exact: true }).click()
  await run.response(p, 'PUT', '/api/v1/asset-fields/custom.react_ready', () =>
    p.getByRole('button', { name: '保存字段新版本', exact: true }).click(),
  )
  await p.getByRole('button', { name: '字段变更已确认，重新读取', exact: true }).click()
  await tab('展示布局')
  await p.getByRole('button', { name: '编辑已读取布局', exact: true }).click()
  await p.getByRole('button', { name: '添加展示分组', exact: true }).click()
  await visibleLabel('分组名称 1').fill('自定义资产')
  const layoutFields = p.getByRole('group', { name: '自定义字段顺序', exact: true })
  await layoutFields.getByRole('button', { name: '添加', exact: true }).click()
  await visibleLabel('自定义字段顺序 1').fill('custom.react_ready')
  await run.response(p, 'PUT', '/api/v1/asset-field-layout', () =>
    p.getByRole('button', { name: '保存布局', exact: true }).click(),
  )
  await run.nav(p, `/devices/endpoint/${f.mdm}`, '设备详情')
  await tab('资产信息')
  await p.getByText('自定义资产', { exact: true }).first().waitFor()
  await visibleLabel('手工字段键').fill('custom.react_ready')
  const assignableField = await run.response(
    p,
    'GET',
    '/api/v1/asset-fields/custom.react_ready',
    () => p.getByRole('button', { name: '读取字段与写入版本', exact: true }).click(),
  )
  assert.equal((await assignableField.json()).asset.field.manual, true)
  await p.getByText('已读取手工值版本', { exact: false }).waitFor()
  await run.choose(p, visibleLabel('输入值类型'), 'boolean')
  const assigned = await run.response(
    p,
    'PUT',
    `/api/v1/devices/${f.mdm}/manual-fields/custom.react_ready`,
    () => p.getByRole('button', { name: '设置手工值', exact: true }).click(),
  )
  assert.deepEqual(assigned.request().postDataJSON().input, {
    action: 'set',
    value: { kind: 'boolean', value: false },
  })
  assert.deepEqual(
    (await api('GET', `/api/v1/devices/${f.mdm}/inventory`)).asset.device.fields[
      'custom.react_ready'
    ].state,
    { kind: 'known', value: { kind: 'boolean', value: false } },
  )
  const listPath = `/api/v1/devices/${f.mdm}/inventory-lists/custom.browser_list`,
    namespaceList = () =>
      p
        .locator('.asset-editor-section')
        .filter({ has: p.locator('strong').filter({ hasText: /^custom\.browser_list$/ }) })
        .getByRole('button', { name: '读取命名空间集合', exact: true })
  await run.response(p, 'POST', listPath, () => namespaceList().click())
  await p.getByText('来源集合总数', { exact: false }).waitFor()
  const sourceList = (
    await (
      await run.response(p, 'POST', listPath, () => visibleLabel('集合每页条目').fill('10'))
    ).json()
  ).asset
  assert.equal(sourceList.total, 25)
  assert.equal(sourceList.items.length, 10)
  assert.ok(sourceList.nextCursor)
  const listCard = p
    .locator('.ant-card')
    .filter({ has: visibleLabel('集合每页条目') })
    .last()
  const followingList = await run.response(p, 'POST', listPath, () =>
    listCard.getByRole('button', { name: '下一页', exact: true }).click(),
  )
  assert.equal(new URL(followingList.url()).searchParams.get('cursor'), sourceList.nextCursor)
  checks.push('real-custom-field-layout-typed-false-and-live-namespace-list')

  run.step('empty-static-and-nested-rule-authoring')
  await run.nav(p, '/groups', '设备组')
  await p.getByRole('button', { name: '新建设备组', exact: true }).click()
  await visibleLabel('设备组名称').fill('React empty source')
  const createdStaticResponse = p.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      /^\/api\/v1\/groups\/[a-f0-9-]+$/.test(new URL(r.url()).pathname),
  )
  await p.getByRole('button', { name: '创建设备组', exact: true }).click()
  const staticResponse = await createdStaticResponse
  assert.equal(staticResponse.status(), 200)
  const staticGroup = (await staticResponse.json()).group
  await p.getByRole('button', { name: '变更已确认，重新读取', exact: true }).click()
  const candidates = []
  for (let i = 0; i < 11; i++) {
    const candidate = randomUUID()
    await api(
      'POST',
      `/api/v1/groups/${candidate}`,
      operation({
        action: 'create',
        presentation: { name: `Asset candidate ${i}`, description: '' },
        assetContext: 'endpoint',
        criteria: null,
      }),
    )
    candidates.push(candidate)
  }
  await p.getByRole('button', { name: '新建设备组', exact: true }).click()
  await visibleLabel('设备组名称').fill('React nested assets')
  await run.choose(p, visibleLabel('设备组类型'), '动态设备组')
  await run.choose(p, visibleLabel('组条件组合'), '嵌套设备组')
  const picker = p.getByRole('group', { name: '选择设备组', exact: true })
  const candidateContinuation = p.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      new URL(r.url()).pathname === '/api/v1/groups' &&
      new URL(r.url()).searchParams.has('cursor'),
  )
  await picker.getByRole('button', { name: '下一页', exact: true }).click()
  const nextCandidates = await candidateContinuation
  assert.equal(nextCandidates.status(), 200)
  assert.ok(new URL(nextCandidates.url()).searchParams.get('cursor'))
  await picker.getByLabel('候选组服务端筛选', { exact: true }).fill(`id==${staticGroup.id}`)
  await run.response(p, 'GET', '/api/v1/groups', () =>
    picker.getByRole('button', { name: '查询候选组', exact: true }).click(),
  )
  await picker
    .getByRole('row')
    .filter({ hasText: 'React empty source' })
    .getByRole('button', { name: '使用此组', exact: true })
    .click()
  const nestedAcceptedResponse = p.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      /^\/api\/v1\/groups\/[a-f0-9-]+$/.test(new URL(r.url()).pathname),
  )
  await p.getByRole('button', { name: '创建设备组', exact: true }).click()
  const nestedResponse = await nestedAcceptedResponse
  assert.equal(nestedResponse.status(), 202)
  const nestedAccepted = await nestedResponse.json(),
    nestedId = nestedAccepted.target
  assert.equal(nestedAccepted.kind, 'group_definition')
  await settleGroup(nestedId, nestedAccepted.task)
  await p.getByRole('button', { name: '任务已受理，重新读取组事实', exact: true }).click()
  await openGroup(nestedId, 'React nested assets')
  const recomputeResponse = await run.response(
      p,
      'POST',
      `/api/v1/groups/${nestedId}`,
      () => p.getByRole('button', { name: '请求正式重算', exact: true }).click(),
      202,
    ),
    recompute = await recomputeResponse.json()
  await settleGroup(nestedId, recompute.task)
  await p.getByRole('button', { name: '读取此任务固定结果', exact: true }).click()
  const memberResult = await api(
    'GET',
    `/api/v1/groups/${nestedId}/results/${recompute.task}/members`,
  )
  assert.equal(memberResult.totalMembers, 0)
  assert.ok(
    memberResult.sources.some(
      (source) => source.group === staticGroup.id && source.coordinates.memberSet === null,
    ),
  )
  checks.push(
    'real-empty-static-source-nested-definition-task-paged-picker-and-authoritative-empty-result',
  )

  run.step('preview-separation-and-static-membership')
  await p.getByRole('button', { name: '任务已受理，重新读取组事实', exact: true }).click()
  await openGroup(nestedId, 'React nested assets')
  const beforePreview = await api('GET', `/api/v1/groups/${nestedId}`)
  await visibleLabel('设备组名称').fill('Unsaved title')
  const previewResponse = await run.response(p, 'POST', '/api/v1/groups/previews', () =>
      p.getByRole('button', { name: '预览当前条件样例（不保存）', exact: true }).click(),
    ),
    preview = await previewResponse.json()
  assert.equal(previewResponse.request().postDataJSON().editing.groupId, nestedId)
  assert.ok(preview.items.length <= 1000)
  assert.equal('task' in preview, false)
  assert.equal((await api('GET', `/api/v1/groups/${nestedId}`)).memberSet, beforePreview.memberSet)
  await openGroup(staticGroup.id, 'React empty source')
  const additions = p.getByRole('group', { name: '添加终端标识', exact: true })
  await additions.getByRole('button', { name: '添加', exact: true }).click()
  await visibleLabel('添加终端标识 1').fill(f.mdm)
  const members = await (
    await run.response(
      p,
      'POST',
      `/api/v1/groups/${staticGroup.id}`,
      () => p.getByRole('button', { name: '提交成员增减', exact: true }).click(),
      202,
    )
  ).json()
  assert.equal(members.kind, 'group')
  await settleGroup(staticGroup.id, members.task)
  const addedMembers = await api(
    'GET',
    `/api/v1/groups/${staticGroup.id}/results/${members.task}/members`,
  )
  assert.equal(addedMembers.totalMembers, 1)
  assert.deepEqual(addedMembers.page.items, [{ kind: 'endpoint', id: f.mdm }])
  await p.getByRole('button', { name: '任务已受理，重新读取组事实', exact: true }).click()
  await openGroup(staticGroup.id, 'React empty source')
  await p
    .getByText('服务端报告仍有阻止删除的引用。授权范围内的列表可能为空。', { exact: true })
    .waitFor()
  assert.equal(await p.getByRole('button', { name: '删除设备组', exact: true }).isDisabled(), true)
  checks.push('real-saved-preview-never-publishes-static-member-patch-and-nested-deletion-guard')

  run.step('responsive-design')
  await run.nav(p, '/groups', '设备组')
  await p.locator('.asset-group-card').filter({ hasText: 'React empty source' }).waitFor()
  const screenshots = mkdtempSync(join(tmpdir(), 'rss-react-assets-'))
  assert.equal(Math.round((await p.locator('aside.sidebar').boundingBox()).width), 218)
  assert.equal(Math.round((await p.locator('header.topbar').boundingBox()).height), 58)
  await p.screenshot({
    path: join(screenshots, 'groups-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await p.setViewportSize({ width: 390, height: 844 })
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await p.screenshot({
    path: join(screenshots, 'groups-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await p.setViewportSize({ width: 1440, height: 960 })
  await p.getByRole('button', { name: '切换亮暗主题', exact: true }).click()
  await p.screenshot({
    path: join(screenshots, 'groups-dark.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await p.getByRole('button', { name: '切换亮暗主题', exact: true }).click()
  console.log(JSON.stringify({ journey: 'react-assets', screenshots }))
  checks.push('design-218-sidebar-58-topbar-group-cards-mobile-and-dark')

  run.step('compliance-rule-task-current-and-history')
  const beforeRules = await api('GET', `/api/v1/devices/${f.alone}/compliance`)
  assert.equal(beforeRules.reason, 'no_rules')
  assert.equal(beforeRules.status, 'unknown')
  await run.nav(p, '/compliance', '安全与合规')
  await p.getByRole('button', { name: '新建合规规则', exact: true }).click()
  await visibleLabel('规则名称').fill('React baseline')
  await p.getByRole('checkbox', { name: '启用评估', exact: true }).check()
  await visibleLabel('条件字段').fill('custom.react_ready')
  await run.choose(p, visibleLabel('输入值类型'), 'boolean')
  const creatingRule = p.waitForResponse(
    (r) =>
      r.request().method() === 'PUT' &&
      /^\/api\/v1\/compliance-rules\/[a-f0-9-]+$/.test(new URL(r.url()).pathname),
  )
  await p.getByRole('button', { name: '保存合规规则新版本', exact: true }).click()
  const ruleResponse = await creatingRule
  assert.equal(ruleResponse.status(), 200)
  const rule = await ruleResponse.json(),
    rulePath = `/api/v1/compliance-rules/${rule.id}`
  assert.notEqual(rule.task, ruleResponse.request().postDataJSON().operationId)
  await settleCompliance(rule.id, rule.task)
  await p.getByRole('button', { name: '原规则操作已确认，重新读取', exact: true }).click()
  await p.getByRole('button', { name: 'React baseline', exact: true }).click()
  await p.getByRole('checkbox', { name: '真', exact: true }).check()
  let originalRule, replayRule
  await intercept(origin + rulePath, async (route) => {
    if (route.request().method() !== 'PUT') return route.continue()
    if (!originalRule) {
      originalRule = route.request().postDataJSON()
      const actual = await route.fetch({ timeout: 15000, maxRetries: 0 })
      assert.equal(actual.status(), 200)
      await route.abort('failed')
    } else {
      replayRule = route.request().postDataJSON()
      await route.continue()
    }
  })
  await p.getByRole('button', { name: '保存合规规则新版本', exact: true }).click()
  await p.getByRole('button', { name: '显式重提原合规操作', exact: true }).waitFor()
  const retriedRule = await (
    await run.response(p, 'PUT', rulePath, () =>
      p.getByRole('button', { name: '显式重提原合规操作', exact: true }).click(),
    )
  ).json()
  assert.deepEqual(replayRule, originalRule)
  await p.unroute(origin + rulePath)
  await settleCompliance(rule.id, retriedRule.task)
  await tab('设备结论与历史')
  await visibleLabel('终端标识').fill(f.mdm)
  await p.getByRole('button', { name: '读取此终端合规', exact: true }).click()
  const current = await poll(
    `/api/v1/devices/${f.mdm}/compliance`,
    () => p.getByRole('button', { name: '读取设备当前合规', exact: true }).click(),
    (v) => v,
    (v) => v.rules.some((r) => r.ruleId === rule.id && r.current?.ruleVersion === 2),
  )
  assert.equal(current.rules.find((r) => r.ruleId === rule.id).current.status, 'non_compliant')
  const historyPath = `/api/v1/devices/${f.mdm}/compliance/history`
  await visibleLabel('历史每页条目').fill('1')
  const history = await (
    await run.response(p, 'GET', historyPath, () =>
      p.getByRole('button', { name: '应用时间范围并从首页读取', exact: true }).click(),
    )
  ).json()
  assert.ok(history.nextCursor)
  assert.equal(history.items.length, 1)
  const historyCard = p
    .locator('.ant-card')
    .filter({ has: visibleLabel('历史每页条目') })
    .last()
  const nextHistory = await run.response(p, 'GET', historyPath, () =>
    historyCard.getByRole('button', { name: '下一页', exact: true }).click(),
  )
  assert.equal(new URL(nextHistory.url()).searchParams.get('cursor'), history.nextCursor)
  let historical = await nextHistory.json()
  const assessments = [...history.items, ...historical.items]
  // Evaluations may share a second; their task UUID is the server's ordering tie-breaker.
  for (
    let page = 0;
    page < 50 && !assessments.some((item) => item.ruleId === rule.id && item.ruleVersion === 1);
    page++
  ) {
    assert.ok(historical.nextCursor)
    const expectedCursor = historical.nextCursor
    const continuation = await run.response(p, 'GET', historyPath, () =>
      historyCard.getByRole('button', { name: '下一页', exact: true }).click(),
    )
    assert.equal(new URL(continuation.url()).searchParams.get('cursor'), expectedCursor)
    historical = await continuation.json()
    assessments.push(...historical.items)
  }
  assert.equal(
    assessments.find((item) => item.ruleId === rule.id && item.ruleVersion === 1)?.status,
    'compliant',
  )
  await run.response(p, 'GET', historyPath, () =>
    historyCard.getByRole('button', { name: '返回首页', exact: true }).click(),
  )
  await intercept(origin + historyPath + '*', async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.has('cursor')) {
      url.searchParams.set('from', '1')
      await route.continue({ url: url.href })
    } else await route.continue()
  })
  await run.response(
    p,
    'GET',
    historyPath,
    () => historyCard.getByRole('button', { name: '下一页', exact: true }).click(),
    409,
  )
  await p.unroute(origin + historyPath + '*')
  await run.response(p, 'GET', historyPath, () =>
    p.getByRole('button', { name: '历史游标失效，保留时间范围返回首页', exact: true }).click(),
  )
  checks.push(
    'real-compliance-task-identity-committed-loss-replay-current-history-and-expired-cursor',
  )

  run.step('mapping-fixed-version-and-content-recovery')
  const resources = await api(
      'GET',
      '/api/v1/resources?' +
        new URLSearchParams({ filter: 'kind==native_collection', limit: '1000' }),
    ),
    sourceId = resources.items[0]?.id
  assert.ok(sourceId)
  const source = await api('GET', `/api/v1/resources/${encodeURIComponent(sourceId)}`)
  await run.nav(p, '/inventory', '资产查询')
  await tab('采集映射')
  await visibleLabel('服务端筛选').fill(`id=='${sourceId}'`)
  await p.getByRole('button', { name: '应用', exact: true }).click()
  await p.getByRole('button', { name: sourceId, exact: true }).click()
  const version = `react-${randomUUID()}`
  await visibleLabel('新固定版本名称').fill(version)
  await visibleLabel('JSON 指针').first().fill('/fixture')
  await p.getByRole('button', { name: '准备新版本内容与摘要', exact: true }).click()
  await run.response(p, 'POST', `/api/v1/resources/${encodeURIComponent(sourceId)}`, () =>
    p.getByRole('button', { name: '声明新固定版本', exact: true }).click(),
  )
  await tab('字段目录')
  await tab('采集映射')
  const uploads = p.locator('.mapping-upload')
  assert.ok((await uploads.count()) >= 1)
  for (let index = 0; index < (await uploads.count()); index++) {
    const card = uploads.nth(index)
    let uploadPath,
      firstBegin = true,
      beginCommitted = false
    const pattern = origin + `/api/v1/resources/${encodeURIComponent(sourceId)}/uploads/*`
    await intercept(pattern, async (route) => {
      if (
        route.request().method() === 'POST' &&
        firstBegin &&
        !route.request().url().endsWith('/complete')
      ) {
        firstBegin = false
        uploadPath = new URL(route.request().url()).pathname
        const actual = await route.fetch({ timeout: 15000, maxRetries: 0 })
        assert.equal(actual.status(), 200)
        await route.abort('failed')
        beginCommitted = true
      } else await route.continue()
    })
    await card.getByRole('button', { name: '开始原上传', exact: true }).click()
    await card.getByRole('button', { name: '显式重提原上传开始请求', exact: true }).waitFor()
    await waitUntil(() => beginCommitted)
    assert.equal(run.count(p, 'POST', uploadPath), 1)
    await run.response(p, 'GET', uploadPath, () =>
      card.getByRole('button', { name: '读取原上传状态', exact: true }).click(),
    )
    await card.getByRole('button', { name: '恢复原内容缓冲', exact: true }).click()
    let session
    do {
      session = await (
        await run.response(p, 'PATCH', uploadPath, () =>
          card.getByRole('button', { name: '从已确认位置续传一块', exact: true }).click(),
        )
      ).json()
    } while (session.offset < session.binding.length)
    await run.response(
      p,
      'POST',
      uploadPath + '/complete',
      () => card.getByRole('button', { name: '完成原上传', exact: true }).click(),
      201,
    )
    const receiptPath = `/api/v1/resources/${encodeURIComponent(sourceId)}/content/operations/${uploadPath.split('/').at(-1)}`
    const receipt = await api('GET', receiptPath)
    assert.equal(receipt.committed, true)
    assert.equal(receipt.version, version)
    await p.unroute(pattern)
  }
  const updated = await api('GET', `/api/v1/resources/${encodeURIComponent(sourceId)}`),
    fixedVersion = updated.versions.find((v) => v.id === version)
  assert.equal(fixedVersion.state, 'frozen')
  assert.equal(fixedVersion.variants.length, source.versions[0].variants.length)
  checks.push(
    'real-native-fixed-version-canonical-bytes-clear-restore-original-upload-offset-and-content-receipt',
  )

  run.step('associated-conflict-missing-and-authorization')
  const mdm = await api('GET', `/api/v1/devices/${f.mdm}`),
    agent = await api('GET', `/api/v1/devices/${f.agent}`),
    primary = (device, channel) => {
      const c = device.channels.find((c) => c.channel === channel && c.status === 'active')
      return {
        device: device.id,
        channel,
        registrationId: c.registrationId,
        generation: c.generation,
      }
    }
  const association = await api('POST', '/api/v1/device-associations', {
    operationId: randomUUID(),
    associationId: null,
    expectedVersion: 0,
    mdm: primary(mdm, 'mdm'),
    agent: primary(agent, 'agent'),
    evidence: 'Synthetic independently identified fixture endpoints',
  })
  await run.nav(p, `/devices/association/${association.id}`, '设备详情')
  await tab('资产信息')
  const associated = await api('GET', `/api/v1/device-views/association/${association.id}`)
  assert.equal(associated.fields['custom.asset_tag'].state.kind, 'conflict')
  await p.getByText('数据冲突', { exact: true }).first().waitFor()
  assert.equal((await p.request.get(origin + `/api/v1/devices/${f.foreignDevice}`)).status(), 404)
  const otherDevice = await api('GET', `/api/v1/devices/${f.alone}/compliance`)
  assert.ok(['unknown', 'non_compliant', 'not_applicable', 'pending'].includes(otherDevice.status))
  const hiddenReferenceRule = randomUUID()
  await api(
    'PUT',
    `/api/v1/compliance-rules/${hiddenReferenceRule}`,
    operation({
      presentation: { name: 'Hidden dependency' },
      enabled: false,
      severity: 'low',
      platform: 'all',
      target: { kind: 'groups', ids: [candidates[0]] },
      criteria: {
        selector: { kind: 'device' },
        quantifier: 'one',
        criteria: { kind: 'predicate', field: 'custom.react_ready', op: 'is_null' },
      },
    }),
  )
  const authorization = (await api('GET', '/api/v1/authorization/rules')).items.find(
    (rule) => rule.id === f.ruleId,
  )
  const reduced = f.rule.grants.filter(
    (grant) =>
      ![
        'compliance_rule_read',
        'compliance_write',
        'resource_write',
        'inventory_fields_write',
      ].includes(grant.operation),
  )
  await api('PUT', `/api/v1/authorization/rules/${f.ruleId}`, {
    operationId: randomUUID(),
    expectedRevision: authorization.revision,
    value: { ...f.rule, grants: reduced },
  })
  const references = await api('GET', `/api/v1/groups/${candidates[0]}/references`)
  assert.equal(references.items.length, 0)
  assert.equal(references.deletionBlocked, true)
  await openGroup(candidates[0], 'Asset candidate 0')
  await p
    .getByText('服务端报告仍有阻止删除的引用。授权范围内的列表可能为空。', { exact: true })
    .waitFor()
  assert.equal(await p.getByRole('button', { name: '删除设备组', exact: true }).isDisabled(), true)
  await api(
    'PUT',
    '/api/v1/asset-fields/custom.react_ready',
    operation({ action: 'delete' }, 1),
    403,
  )
  const latestAuthority = (await api('GET', '/api/v1/authorization/rules')).items.find(
    (rule) => rule.id === f.ruleId,
  )
  await api('PUT', `/api/v1/authorization/rules/${f.ruleId}`, {
    operationId: randomUUID(),
    expectedRevision: latestAuthority.revision,
    value: f.rule,
  })
  const anonymous = await run.page()
  assert.equal((await anonymous.request.get(origin + '/api/v1/groups')).status(), 401)
  checks.push(
    'real-associated-conflict-foreign-tenant-404-denied-403-anonymous-401-and-empty-filtered-deletion-block',
  )
  assert.equal(interceptionFailed, false)
} catch (error) {
  failure = error
  // Only local source coordinates, never request bodies, credentials or response content.
  const location = error.stack?.match(/react-assets-browser\.mjs:(\d+):(\d+)/)?.[0]
  console.error(
    JSON.stringify({
      journey: 'react-assets',
      failureLocation: location,
      groupRequests,
      taskInput: await diagnosticPage
        ?.getByLabel('原设备组任务标识', { exact: true })
        .inputValue()
        .catch(() => null),
      failureAction: error.message?.split('\n')[0].slice(0, 160),
    }),
  )
}
await run.finish(failure)
