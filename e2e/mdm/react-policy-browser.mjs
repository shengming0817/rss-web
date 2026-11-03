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
  async function settled(scope, task) {
    assert.equal(typeof task, 'string')
    const end = Date.now() + 45000
    do {
      const state = await api('GET', `/api/v1/scopes/${scope}/tasks/${task}`)
      assert.equal(state.task, task)
      assert.equal(state.target, scope)
      const value = await api('GET', '/api/v1/scopes/' + scope)
      if (state.status === 'completed' && value.resolution) {
        const page = await api(
          'GET',
          `/api/v1/scopes/${scope}/results/${value.resolution}/members?channel=mdm&limit=1`,
        )
        assert.equal(page.scope, scope)
        assert.equal(page.result, value.resolution)
        assert.equal(page.channel, 'mdm')
        assert.equal(page.page.kind, 'members')
        if (page.current === true) return value
      }
      await new Promise((done) => setTimeout(done, 500))
    } while (Date.now() < end)
    if (task) {
      const state = await api('GET', `/api/v1/scopes/${scope}/tasks/${task}`)
      console.error(
        JSON.stringify({
          journey: 'react-policy',
          stage: 'scope-computation',
          status: state.status,
          processed: state.processed,
          members: state.members,
          hasFailure: state.failure !== null,
          inputPending: state.failure_detail?.reason === 'group_input_pending',
        }),
      )
    }
    assert.fail('bounded scope computation')
  }
  await run.login(p)
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
  await run.nav(p, '/scopes', '策略范围')
  run.step('scope-create-dialog')
  await button('新建范围').click()
  for (const endpoint of [f.mdm, f.agent]) {
    run.step('scope-target-' + endpoint)
    await run.choose(p, label('目标（并集） 引用类型'), '终端')
    await label('终端候选服务端筛选').fill(`id=='${endpoint}'`)
    await button('查询终端候选').click()
    await p
      .locator('tbody tr')
      .filter({ hasText: endpoint })
      .getByRole('button', { name: '使用此终端', exact: true })
      .click()
    await p.locator('.ant-tag').filter({ hasText: endpoint }).waitFor()
  }
  run.step('scope-unsaved-preview')
  const beforeScopes = await api('GET', '/api/v1/scopes?fields=id&limit=100')
  const draftSampleResponse = await run.response(p, 'POST', '/api/v1/scopes/previews', () =>
    button('预览当前范围样例（不保存）').click(),
  )
  const draftSample = await draftSampleResponse.json()
  assert.equal(draftSampleResponse.status(), 200)
  assert.equal(draftSample.channel, 'agent')
  assert.ok(draftSample.items.length <= 1000)
  assert.ok(draftSample.items.some((item) => item.kind === 'endpoint' && item.id === f.agent))
  assert.equal(draftSample.assetCut.tenant, f.tenant)
  assert.equal('editing' in draftSampleResponse.request().postDataJSON(), false)
  assert.equal('task' in draftSample, false)
  assert.deepEqual(
    (await api('GET', '/api/v1/scopes?fields=id&limit=100')).items,
    beforeScopes.items,
  )
  await p.getByText('本次匹配样例', { exact: false }).waitFor()
  await label('限制范围（交集）').check()
  assert.equal(await p.getByText('本次匹配样例', { exact: false }).count(), 0)
  await label('限制范围（交集）').uncheck()
  checks.push('real-scope-draft-preview-no-definition-write-and-draft-invalidation')
  const scopeResponse = p.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      /\/api\/v1\/scopes\/[^/]+$/.test(new URL(r.url()).pathname),
  )
  await button('保存并计算范围').click()
  const savedScope = await scopeResponse
  assert.equal(savedScope.status(), 200)
  const scopeReceipt = await savedScope.json(),
    scope = scopeReceipt.id
  const firstScope = await settled(scope, scopeReceipt.task)
  assert.equal(firstScope.definition.limitations, null)
  assert.deepEqual(
    firstScope.definition.targets.map((item) => item.id).sort(),
    [f.mdm, f.agent].sort(),
  )
  await button('返回目录并读取当前状态').click()
  await run.nav(p, '/scopes?scope=' + scope, '策略范围')
  await button('打开定位范围').click()
  await p.getByText('范围结果与解释', { exact: true }).waitFor()
  await label('限制范围（交集）').check()
  const editingSampleResponse = await run.response(p, 'POST', '/api/v1/scopes/previews', () =>
    button('预览当前范围样例（不保存）').click(),
  )
  const editingSample = await editingSampleResponse.json()
  assert.equal(editingSampleResponse.status(), 200)
  assert.deepEqual(editingSampleResponse.request().postDataJSON().editing, {
    scopeId: scope,
    expectedRevision: firstScope.revision,
  })
  assert.deepEqual(editingSampleResponse.request().postDataJSON().definition.limitations, [])
  assert.deepEqual(editingSample.items, [])
  assert.equal(editingSample.scanComplete, true)
  assert.equal(editingSample.hasUnknown, false)
  assert.deepEqual((await api('GET', '/api/v1/scopes/' + scope)).definition.limitations, null)
  assert.equal(await button('重新计算已保存范围').isEnabled(), false)
  const emptyLimits = await run.response(p, 'POST', '/api/v1/scopes/' + scope, () =>
    button('保存并计算范围').click(),
  )
  assert.deepEqual((await api('GET', '/api/v1/scopes/' + scope)).definition.limitations, [])
  checks.push('real-scope-definition-preserves-null-and-empty-limitations')
  assert.deepEqual(
    (await settled(scope, (await emptyLimits.json()).task)).definition.limitations,
    [],
  )
  await button('返回目录并读取当前状态').click()
  await run.nav(p, '/scopes?scope=' + scope, '策略范围')
  await button('打开定位范围').click()
  await label('限制范围（交集）').uncheck()
  const restoredScope = await run.response(p, 'POST', '/api/v1/scopes/' + scope, () =>
    button('保存并计算范围').click(),
  )
  const restored = await settled(scope, (await restoredScope.json()).task)
  for (const [channel, endpoint] of [
    ['mdm', f.mdm],
    ['agent', f.agent],
  ]) {
    const members = await api(
      'GET',
      `/api/v1/scopes/${scope}/results/${restored.resolution}/members?channel=${channel}&limit=100`,
    )
    assert.equal(members.current, true)
    assert.ok(
      members.page.items.some(
        (item) =>
          item.object.kind === 'endpoint' && item.object.id === endpoint && item.available === true,
      ),
      'authored channel member must be published',
    )
  }
  checks.push('real-scope-authoring-null-versus-empty-limitations-and-published-result-coordinate')

  await button('返回目录并读取当前状态').click()
  await run.nav(p, '/scopes?scope=' + scope, '策略范围')
  await button('打开定位范围').click()
  run.step('scope-recompute-explicit-original-retry')
  let recomputeRequest,
    recomputeReceipt,
    recomputeIntercepted = false,
    recomputeFailure = false
  const recomputePath = '/api/v1/scopes/' + scope
  await p.route('**' + recomputePath, async (route) => {
    if (route.request().method() !== 'POST' || recomputeIntercepted) return route.continue()
    recomputeIntercepted = true
    recomputeRequest = route.request().postDataJSON()
    try {
      const response = await route.fetch()
      assert.equal(response.status(), 200)
      recomputeReceipt = await response.json()
    } catch {
      recomputeFailure = true
    }
    await route.abort('failed')
  })
  await button('重新计算已保存范围').click()
  await button('重提原重算请求').waitFor()
  assert.equal(recomputeFailure, false)
  assert.deepEqual(recomputeRequest.input, { action: 'recompute' })
  assert.equal(recomputeRequest.expectedRevision, restored.revision)
  assert.equal(recomputeReceipt.revision, restored.revision)
  const recomputePosts = run.count(p, 'POST', recomputePath)
  assert.equal(await button('重提原重算请求').isEnabled(), false)
  await button('读取原范围当前状态').click()
  await p.getByText('当前定义修订', { exact: false }).waitFor()
  assert.equal(run.count(p, 'POST', recomputePath), recomputePosts)
  await label('确认使用原操作标识和原输入重提重算请求').check()
  const retry = await run.response(p, 'POST', recomputePath, () => button('重提原重算请求').click())
  assert.equal(retry.status(), 200)
  assert.deepEqual(retry.request().postDataJSON(), recomputeRequest)
  assert.deepEqual(await retry.json(), recomputeReceipt)
  const recomputed = await settled(scope, recomputeReceipt.task)
  assert.equal(recomputed.revision, restored.revision)
  assert.deepEqual(recomputed.definition, restored.definition)
  await p.unroute('**' + recomputePath)
  await button('返回目录并读取当前状态').click()
  checks.push('real-scope-editing-preview-and-recompute-unchanged-CAS-explicit-identical-retry')
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
  await run.nav(p, '/scopes?scope=' + scope, '策略范围')
  await button('打开定位范围').click()
  const scopeReferences = await run.response(p, 'GET', `/api/v1/scopes/${scope}/references`, () =>
    button('读取范围引用').click(),
  )
  const scopeBlockers = await scopeReferences.json()
  assert.equal(scopeReferences.status(), 200)
  assert.ok(
    scopeBlockers.items.some(
      (item) =>
        item.id === policy.id &&
        item.version === policy.versionId &&
        item.roles.includes('policy_scope') &&
        item.release === 'edit_referencing_policy',
    ),
  )
  await p.getByRole('cell', { name: policy.id, exact: true }).waitFor()
  await button('返回目录并读取当前状态').click()
  // Direct blockers and recursive impacts use separate public endpoints.
  const groupId = randomUUID(),
    referencingScope = randomUUID()
  await api('POST', '/api/v1/groups/' + groupId, {
    operationId: randomUUID(),
    expectedRevision: 0,
    input: {
      action: 'create',
      presentation: { name: 'Scope reference source', description: '' },
      assetContext: 'endpoint',
      criteria: null,
    },
  })
  await api('POST', '/api/v1/scopes/' + referencingScope, {
    operationId: randomUUID(),
    expectedRevision: 0,
    input: {
      action: 'put',
      definition: { targets: [{ kind: 'group', id: groupId }], limitations: null, exclusions: [] },
    },
  })
  await run.nav(p, '/groups', '设备组')
  await label('服务端筛选').fill(`id==${groupId}`)
  await button('读取设备组目录').click()
  await p
    .locator('.asset-group-card')
    .filter({ hasText: 'Scope reference source' })
    .getByRole('button', { name: '查看定义与成员 →', exact: true })
    .click()
  const groupReferences = await run.response(p, 'GET', `/api/v1/groups/${groupId}/references`, () =>
    button('读取直接引用').click(),
  )
  const directBlockers = await groupReferences.json()
  assert.ok(
    directBlockers.items.some(
      (item) =>
        item.kind === 'scope' && item.id === referencingScope && item.roles.includes('target'),
    ),
  )
  assert.equal('deletionBlocked' in directBlockers, false)
  await p.getByRole('cell', { name: referencingScope, exact: true }).first().waitFor()
  const impactResponse = await run.response(p, 'GET', `/api/v1/groups/${groupId}/impacts`, () =>
    button('读取影响').click(),
  )
  assert.equal(impactResponse.status(), 200)
  assert.equal('deletionBlocked' in (await impactResponse.json()), false)
  checks.push(
    'real-scope-policy-blockers-and-separate-group-direct-references-and-recursive-impacts',
  )
  await button('关闭设备组详情').click()
  await run.nav(p, '/policies?policy=' + policy.id, '策略与部署')
  await button('打开定位策略').click()

  // Lifecycle actions have their own durable work, separate from ordinary assignments.
  // Author another policy through the same public UI to verify that projection explicitly.
  await button('返回并重新读取策略').click()
  await run.nav(p, '/policies?scope=' + scope, '策略与部署')
  await button('新建部署').click()
  await run.choose(p, label('策略动作'), '设备接入')
  await run.choose(p, label('Windows 接入方式'), 'whfb')
  await button('下一步').click()
  await button('下一步').click()
  await label('确认范围、资源、调度与潜在影响').check()
  const assignmentPolicyResponse = p.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      /\/api\/v1\/policies\/[^/]+$/.test(new URL(r.url()).pathname),
  )
  await button('保存策略定义').click()
  const assignmentSaved = await assignmentPolicyResponse
  assert.equal(assignmentSaved.status(), 200)
  const assignmentPolicy = await assignmentSaved.json()
  assert.equal(assignmentPolicy.definition.scope, scope)
  await button('返回并重新读取策略').click()
  await run.nav(p, '/policies?policy=' + assignmentPolicy.id, '策略与部署')
  await button('打开定位策略').click()
  await label('确认已保存范围与动作后启用').check()
  await run.response(p, 'POST', '/api/v1/policies/' + assignmentPolicy.id, () =>
    button('启用策略').click(),
  )
  await button('返回并重新读取策略').click()
  await run.nav(p, '/policies?policy=' + assignmentPolicy.id, '策略与部署')
  await button('打开定位策略').click()
  const assignmentResponse = p.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      new URL(r.url()).pathname === '/api/v1/policies/' + assignmentPolicy.id + '/assignments',
  )
  await p.getByRole('tab', { name: '设备分配', exact: true }).click()
  const assignment = await assignmentResponse
  assert.equal(assignment.status(), 200)
  let assignments = await assignment.json(),
    assigned = assignments.items.find((item) => item.object.id === f.agent)
  const assignmentDeadline = Date.now() + 45000
  while (!assigned && Date.now() < assignmentDeadline) {
    assert.equal(assignments.nextCursor, null, 'representative assignments fit one page')
    await new Promise((done) => setTimeout(done, 500))
    assignments = await api('GET', `/api/v1/policies/${assignmentPolicy.id}/assignments?limit=100`)
    assigned = assignments.items.find((item) => item.object.id === f.agent)
  }
  if (!assigned)
    console.error(
      JSON.stringify({
        journey: 'react-policy',
        stage: 'assignment-projection',
        count: assignments.items.length,
        endpointRows: assignments.items.filter((item) => item.object.kind === 'endpoint').length,
        associationRows: assignments.items.filter((item) => item.object.kind === 'association')
          .length,
      }),
    )
  assert.ok(assigned, 'bounded authored policy assignment projection')
  await run.response(p, 'GET', `/api/v1/policies/${assignmentPolicy.id}/assignments`, () =>
    button('读取分配').click(),
  )
  assert.equal(assigned.channel, 'agent')
  assert.equal(assigned.object.kind, 'endpoint')
  assert.ok(['eligible', 'pending', 'excluded'].includes(assigned.qualification.state))
  assert.equal(assigned.scopeResult, (await api('GET', '/api/v1/scopes/' + scope)).resolution)
  const assignmentRow = p
    .locator('tbody tr')
    .filter({ has: p.getByRole('link', { name: f.agent, exact: true }) })
    .filter({ visible: true })
  await assignmentRow.waitFor()
  assert.ok((await assignmentRow.innerText()).includes(assigned.qualification.state))
  if (assigned.target)
    assert.ok((await assignmentRow.innerText()).includes(assigned.target.registrationId))
  checks.push('real-device-access-policy-assignment-qualification-and-result-coordinate')
  await p.getByRole('tab', { name: '定义与发布', exact: true }).click()
  await button('返回并重新读取策略').click()
  await run.nav(p, '/policies?policy=' + policy.id, '策略与部署')
  await button('打开定位策略').click()
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

  const closeDialog = async () => {
    await p.locator('.ant-modal-close').filter({ visible: true }).click()
    await p.getByRole('dialog').waitFor({ state: 'hidden' })
  }
  await closeDialog()
  await p.locator('.policy-card').first().waitFor()
  await p.getByText('筛选与排序', { exact: true }).click()
  await label('服务端筛选').fill(`id=='${policy.id}'`)
  await run.response(p, 'GET', '/api/v1/policies', () => button('应用').click())
  await button('查看策略 react.policy.scope').waitFor()
  await p.getByText('筛选与排序', { exact: true }).click()
  await p.locator('.ant-collapse-content').waitFor({ state: 'hidden' })
  const screenshots = mkdtempSync(join(tmpdir(), 'rss-react-policy-design-'))
  for (const [name, width, height, dark] of [
    ['desktop', 1440, 960, false],
    ['tablet', 900, 1100, false],
    ['mobile', 390, 844, false],
    ['dark', 1440, 960, true],
  ]) {
    run.step('policy-design-' + name)
    await p.setViewportSize({ width, height })
    if (dark) await button('切换亮暗主题').click()
    await button('查看策略 react.policy.scope').waitFor()
    await p.screenshot({
      path: join(screenshots, name + '.png'),
      fullPage: true,
      animations: 'disabled',
    })
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      true,
    )
    await button('查看策略 react.policy.scope').click()
    const dialog = p.getByRole('dialog')
    await dialog.waitFor()
    await p.waitForFunction(() => {
      const dialog = document.querySelector('.ant-modal')
      if (!dialog) return false
      const style = getComputedStyle(dialog)
      return style.opacity === '1' && style.transform === 'none'
    })
    assert.equal(
      await dialog.locator('.ant-modal-body').evaluate((body) => body.scrollTop),
      0,
      'reopened details start at their heading and tabs',
    )
    await p.screenshot({ path: join(screenshots, name + '-detail.png'), animations: 'disabled' })
    const bounds = await dialog.boundingBox()
    assert.ok(
      bounds &&
        bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= width + 1 &&
        bounds.y + bounds.height <= height + 1,
    )
    await closeDialog()
  }
  console.log(JSON.stringify({ journey: 'react-policy', screenshots }))
  checks.push('public-policy-pages-desktop-tablet-mobile-dark-and-no-document-overflow')
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
