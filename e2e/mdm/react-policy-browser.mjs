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
  await label('唯一别名').fill('react.policy.scope')
  await label('共享事件名').fill('react.policy.event')
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
  await p.getByRole('tab', { name: '设备分配', exact: true }).click()
  await button('读取分配').waitFor()
  await p.getByRole('tab', { name: '独立事件', exact: true }).click()
  await label('终端候选服务端筛选').fill(`id=='${f.mdm}'`)
  await button('查询终端候选').click()
  await button('使用此终端').click()
  let originalRequest,
    intercepted = false,
    interceptionFailed = false
  const path = '/api/v1/devices/' + f.mdm + '/policy-events'
  await p.route('**' + path, async (route) => {
    if (route.request().method() !== 'POST' || intercepted) return route.continue()
    intercepted = true
    originalRequest = route.request().postDataJSON()
    try {
      const response = await route.fetch()
      assert.equal(response.status(), 202)
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
  const first = await api('POST', path, originalRequest, 202),
    repeated = await api('POST', path, originalRequest, 202)
  assert.equal(first.batchId, repeated.batchId)
  await p.unroute('**' + path)
  checks.push(
    'real-independent-event-response-loss-read-only-original-identity-recovery-and-server-deduplication',
  )

  const screenshots = mkdtempSync(join(tmpdir(), 'rss-react-policy-design-'))
  for (const [name, width, height, dark] of [
    ['desktop', 1440, 960, false],
    ['tablet', 900, 1100, false],
    ['mobile', 390, 844, false],
    ['dark', 1440, 960, true],
  ]) {
    await p.setViewportSize({ width, height })
    if (dark) await button('切换明暗主题').click()
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
