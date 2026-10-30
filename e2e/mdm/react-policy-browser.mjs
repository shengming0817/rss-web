// Real HTTPS Scope → Policy → independent event seams; no synthetic device effect assertion.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
  async function settled(scope) {
    const end = Date.now() + 45000
    do {
      const value = await api('GET', '/api/v1/scopes/' + scope)
      if (value.resolution && value.resolutionRevision === value.revision) return value
      await new Promise((done) => setTimeout(done, 500))
    } while (Date.now() < end)
    assert.fail('bounded scope computation')
  }
  await run.login(p)
  await run.nav(p, '/scopes', '策略范围')
  await button('新建范围').click()
  await run.choose(p, label('目标（并集） 引用类型'), '终端')
  await label('终端候选服务端筛选').fill(`id=='${f.mdm}'`)
  await button('查询终端候选').click()
  await button('使用此终端').click()
  const scopeResponse = p.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      /\/api\/v1\/scopes\/[^/]+$/.test(new URL(r.url()).pathname),
  )
  await button('保存并计算范围').click()
  const savedScope = await scopeResponse
  assert.equal(savedScope.status(), 200)
  const scope = (await savedScope.json()).id
  assert.equal((await settled(scope)).definition.limitations, null)
  await button('返回目录并读取当前状态').click()
  await run.nav(p, '/scopes?scope=' + scope, '策略范围')
  await button('打开定位范围').click()
  await p.getByText('范围结果与解释', { exact: true }).waitFor()
  await label('限制范围（交集）').check()
  await run.response(p, 'POST', '/api/v1/scopes/' + scope, () => button('保存并计算范围').click())
  assert.deepEqual((await settled(scope)).definition.limitations, [])
  await button('返回目录并读取当前状态').click()
  await run.nav(p, '/scopes?scope=' + scope, '策略范围')
  await button('打开定位范围').click()
  await label('限制范围（交集）').uncheck()
  await run.response(p, 'POST', '/api/v1/scopes/' + scope, () => button('保存并计算范围').click())
  await settled(scope)
  checks.push('real-scope-authoring-null-versus-empty-limitations-and-published-result-coordinate')

  await run.nav(p, '/policies?scope=' + scope, '策略与部署')
  await button('新建部署').click()
  await run.choose(p, label('策略动作'), '设备退管')
  await button('下一步').click()
  await label('唯一别名').fill('invalid alias')
  await button('下一步').click()
  await label('确认范围、资源、调度与潜在影响').check()
  await button('保存策略定义').click()
  await p.getByText('请求未完成，请检查输入、权限或当前状态。', { exact: true }).waitFor()
  await button('上一步').click()
  assert.equal(await label('唯一别名').isEnabled(), true)
  await button('下一步').click()
  assert.equal(await button('核对原请求').count(), 0)
  await button('上一步').click()
  await label('唯一别名').fill('react.policy.scope')
  await label('共享事件名').fill('react.policy.event')
  await button('下一步').click()
  await label('确认范围、资源、调度与潜在影响').check()
  const policyResponse = p.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      /\/api\/v1\/policies\/[^/]+$/.test(new URL(r.url()).pathname),
  )
  await button('保存策略定义').click()
  const savedPolicy = await policyResponse
  assert.equal(savedPolicy.status(), 200)
  const policy = await savedPolicy.json()
  assert.equal(policy.definition.scope, scope)
  assert.equal(policy.state, 'disabled')
  await button('返回并重新读取策略').click()
  await run.nav(p, '/policies?policy=' + policy.id, '策略与部署')
  await button('打开定位策略').click()
  await run.response(p, 'POST', '/api/v1/policies/previews', () => button('预览此草稿资格').click())
  assert.equal(await button('启用策略').isEnabled(), false)
  await label('唯一别名').fill('unsaved.smaller.scope')
  assert.equal(await button('启用策略').isEnabled(), false)
  await label('唯一别名').fill('react.policy.scope')
  await label('确认已保存范围与动作后启用').check()
  await run.response(p, 'POST', '/api/v1/policies/' + policy.id, () => button('启用策略').click())
  const current = await api('GET', '/api/v1/policies/' + policy.id)
  assert.equal(current.versionId, policy.versionId)
  await api(
    'POST',
    '/api/v1/policies/' + policy.id,
    { operationId: randomUUID(), expectedRevision: policy.revision, input: { action: 'disable' } },
    409,
  )
  const scopeRead = await api('GET', '/api/v1/scopes/' + scope)
  await api(
    'POST',
    '/api/v1/scopes/' + scope,
    {
      operationId: randomUUID(),
      expectedRevision: scopeRead.revision,
      input: { action: 'delete' },
    },
    409,
  )
  checks.push(
    'real-policy-definition-execution-version-separation-preview-CAS-and-scope-reference-protection',
  )

  await button('返回并重新读取策略').click()
  await run.nav(p, '/policies?policy=' + policy.id, '策略与部署')
  await button('打开定位策略').click()
  const assignmentResponse = p.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      new URL(r.url()).pathname === '/api/v1/policies/' + policy.id + '/assignments',
  )
  await p.getByRole('tab', { name: '设备分配', exact: true }).click()
  const assignment = await assignmentResponse
  assert.equal(assignment.status(), 200)
  const assigned = (await assignment.json()).items.find((item) => item.object.id === f.mdm)
  assert.ok(assigned)
  assert.ok(['eligible', 'pending', 'excluded'].includes(assigned.qualification.state))
  assert.equal(assigned.scopeResult, (await api('GET', '/api/v1/scopes/' + scope)).resolution)
  const assignmentRow = p
    .locator('tbody tr')
    .filter({ has: p.getByRole('link', { name: f.mdm, exact: true }) })
    .filter({ visible: true })
  await assignmentRow.waitFor()
  assert.ok((await assignmentRow.innerText()).includes(assigned.qualification.state))
  if (assigned.target)
    assert.ok((await assignmentRow.innerText()).includes(assigned.target.registrationId))
  await p.getByRole('tab', { name: '独立事件', exact: true }).click()
  await label('终端候选服务端筛选').fill(`id=='${f.mdm}'`)
  await button('查询终端候选').click()
  await button('使用此终端').click()
  let originalRequest,
    originalAccepted,
    intercepted = false,
    interceptionFailed = false
  const path = '/api/v1/devices/' + f.mdm + '/policy-events'
  await label('设备事件名').fill('invalid event')
  await label('确认向此设备提交独立事件').check()
  await button('提交设备事件').click()
  await p.getByText('请求未完成，请检查输入、权限或当前状态。', { exact: true }).waitFor()
  assert.equal(await label('设备事件名').isEnabled(), true)
  assert.equal(run.count(p, 'POST', path), 0)
  await label('设备事件名').fill('react.policy.event')

  await p.route('**' + path, async (route) => {
    if (route.request().method() !== 'POST' || intercepted) return route.continue()
    intercepted = true
    originalRequest = route.request().postDataJSON()
    try {
      const response = await route.fetch()
      assert.equal(response.status(), 202)
      originalAccepted = await response.json()
    } catch {
      interceptionFailed = true
    }
    await route.abort('failed')
  })
  await label('确认向此设备提交独立事件').check()
  await button('提交设备事件').click()
  await button('查询原事件批次').waitFor()
  await button('查询原事件批次').click()
  await p.getByText('批次已受理；成员与实际操作可能仍待处理。', { exact: true }).waitFor()
  assert.equal(run.count(p, 'POST', path), 1)
  assert.equal(interceptionFailed, false)
  assert.ok(originalRequest)
  assert.ok(originalAccepted)
  assert.equal(originalAccepted.operationId, originalRequest.operationId)
  await p
    .getByText(originalAccepted.batchId, { exact: true })
    .filter({ visible: true })
    .first()
    .waitFor()
  const memberPath = `/api/v1/devices/${f.mdm}/policy-event-batches/${originalAccepted.batchId}/members`
  async function decidedMembers() {
    const end = Date.now() + 45000
    do {
      const page = await api('GET', memberPath + '?limit=100')
      assert.equal(page.nextCursor, null, 'representative event batch must fit one member page')
      if (
        page.items.length === originalAccepted.members &&
        page.items.length > 0 &&
        page.items.every((item) => item.state !== 'pending')
      ) {
        const own = page.items.filter((item) => item.policyId === policy.id)
        assert.equal(own.length, 1, 'one member for the authored policy')
        assert.equal(own[0].versionId, policy.versionId)
        assert.equal(own[0].state, 'accepted')
        assert.equal(own[0].decision.state, 'accepted')
        assert.equal(own[0].decision.operations.length, 1)
        assert.equal(own[0].decision.operations[0].kind, 'retirement')
        for (const item of page.items) {
          assert.equal(item.decision.state, item.state)
          assert.deepEqual(
            item.operations.map((operation) => operation.reference),
            item.decision.state === 'accepted' ? item.decision.operations : [],
          )
        }
        assert.equal(own[0].operations[0].state.id, own[0].decision.operations[0].id)
        return page.items
      }
      await new Promise((done) => setTimeout(done, 500))
    } while (Date.now() < end)
    assert.fail('bounded original event member decision')
  }
  const before = await decidedMembers(),
    batch = await api(
      'GET',
      `/api/v1/devices/${f.mdm}/policy-event-batches/${originalAccepted.batchId}`,
    ),
    identities = (members) =>
      members
        .map((item) => ({
          id: item.id,
          policyId: item.policyId,
          versionId: item.versionId,
          decision: item.decision,
          references: item.operations.map((operation) => operation.reference),
        }))
        .sort((a, b) => a.id.localeCompare(b.id))
  assert.equal(batch.id, originalAccepted.batchId)
  assert.equal(batch.operationId, originalRequest.operationId)
  assert.equal(batch.members, before.length)
  assert.equal(batch.event, originalRequest.event)
  assert.equal(batch.request.operationId, originalRequest.operationId)
  assert.equal(batch.request.event, originalRequest.event)
  assert.deepEqual(batch.request.source, originalRequest.source)
  assert.equal(batch.request.executionContext, null)
  assert.equal(batch.processingFailure, null)
  await run.response(p, 'GET', memberPath, () => button('读取成员与进度').click())
  const row = p.locator('tbody tr').filter({ hasText: policy.id }).filter({ visible: true })
  await row.getByText('accepted', { exact: true }).waitFor()
  await row
    .getByText(
      `retirement/${before.find((item) => item.policyId === policy.id).decision.operations[0].id}`,
      { exact: true },
    )
    .waitFor()
  const rendered = await row.innerText()
  assert.ok(rendered.includes(policy.versionId))
  assert.ok(rendered.includes('accepted'))
  assert.ok(
    rendered.includes(
      `retirement/${before.find((item) => item.policyId === policy.id).decision.operations[0].id}`,
    ),
  )
  const first = await api('POST', path, originalRequest, 202),
    repeated = await api('POST', path, originalRequest, 202)
  assert.equal(first.batchId, originalAccepted.batchId)
  assert.equal(repeated.batchId, originalAccepted.batchId)
  assert.deepEqual(
    identities(await decidedMembers()),
    identities(before),
    'duplicates retain original members, execution versions and operation references',
  )
  await p.unroute('**' + path)
  checks.push(
    'real-independent-event-response-loss-original-member-decision-version-operation-reference-and-deduplication',
  )

  const screenshots = mkdtempSync(join(tmpdir(), 'rss-react-policy-design-'))
  for (const [name, width, height, dark] of [
    ['desktop', 1440, 960, false],
    ['tablet', 900, 1100, false],
    ['mobile', 390, 844, false],
    ['dark', 1440, 960, true],
  ]) {
    await p.setViewportSize({ width, height })
    if (dark) await button('切换亮暗主题').click()
    await p.screenshot({
      path: join(screenshots, name + '.png'),
      fullPage: true,
      animations: 'disabled',
    })
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      true,
    )
  }
  console.log(JSON.stringify({ journey: 'react-policy', screenshots }))
  checks.push('public-policy-pages-desktop-tablet-mobile-dark-and-no-document-overflow')
} catch (error) {
  failure = error
  console.error(JSON.stringify({ journey: 'react-policy', classification: error?.name }))
} finally {
  await run.finish(failure)
}
