// Real HTTPS safe audit/activity and Webhook workflows. Never print private input or raw responses.
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { realBrowser } from './react-mdm-browser.mjs'

const run = await realBrowser('MDM_DEVICE_BROWSER_FIXTURE', 'react-audit-webhooks')
let failure,
  diagnosticPage,
  publicLayout = false,
  interceptionFailed = false
try {
  const { fixture: f, origin, checks } = run,
    p = await run.page(),
    label = (name) => {
      run.step('label:' + name)
      return p.getByLabel(name, { exact: true }).filter({ visible: true })
    },
    button = (name) => {
      run.step('button:' + name)
      return p.getByRole('button', { name, exact: true }).filter({ visible: true })
    },
    tab = (name) => p.getByRole('tab', { name, exact: true }).filter({ visible: true }).click(),
    summary = (name) => p.locator('summary').getByText(name, { exact: true }).click(),
    base = '/api/v1/webhooks',
    designOnly = process.env.MDM_REACT_AUDIT_WEBHOOKS_MODE === 'design',
    importSecret = 'whsec_' + Buffer.alloc(32, 9).toString('base64')
  diagnosticPage = p
  let nextApi = 0
  async function api(method, path, data, expected = 200, operationId) {
    const delay = Math.max(0, nextApi - Date.now())
    nextApi = Date.now() + delay + 250
    if (delay) await new Promise((done) => setTimeout(done, delay))
    const headers = {}
    if (method !== 'GET') {
      const session = await p.request.get(origin + `/api/v1/identity/tenants/${f.tenant}/session`)
      assert.equal(session.status(), 200)
      Object.assign(headers, {
        Origin: origin,
        'X-Identity-Request': '1',
        'X-CSRF-Token': (await session.json()).csrfToken,
      })
      if (operationId) headers['Idempotency-Key'] = operationId
    }
    const result = await p.request.fetch(origin + path, {
      method,
      headers,
      ...(data === undefined ? {} : { data }),
    })
    if (result.status() !== expected) {
      const value = await result.json().catch(() => null),
        code = value?.code
      console.error(
        JSON.stringify({
          journey: 'react-audit-webhooks',
          method,
          area: path.split('/').slice(0, 5).join('/'),
          expected,
          actual: result.status(),
          code:
            typeof code === 'string' && /^[a-zA-Z0-9_.-]{1,80}$/.test(code) ? code : 'unclassified',
        }),
      )
    }
    assert.equal(result.status(), expected, method + ' ' + path.split('?')[0])
    return expected === 204 ? undefined : result.json()
  }
  async function until(read, ready) {
    const end = Date.now() + 45000
    do {
      const value = await read()
      if (ready(value)) return value
      await new Promise((done) => setTimeout(done, 500))
    } while (Date.now() < end)
    assert.fail('bounded fact readiness')
  }
  async function changeAuthority(grants) {
    const path = `/api/v1/authorization/rules/${f.ruleId}`,
      current = await api('GET', path)
    await api('PUT', path, {
      operationId: randomUUID(),
      expectedRevision: current.revision,
      value: { ...f.rule, grants },
    })
  }
  async function safeDOM(secret) {
    assert.equal((await p.locator('body').textContent()).includes(secret), false)
    const state = await p.evaluate(() =>
      JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
    )
    assert.equal(state.includes(secret), false)
  }
  async function settled() {
    await p.waitForFunction(() => !document.querySelector('.ant-spin-spinning'))
  }
  await run.login(p)

  if (!designOnly) {
    run.step('real-native-facts-and-independent-activity-read')
    const operations = []
    for (let i = 0; i < 3; i++) {
      const operationId = randomUUID()
      const value = await api(
        'POST',
        `/api/v1/devices/${f.mdm}/operations`,
        {
          operationId,
          action: { kind: 'restart' },
          deadline: Math.floor(Date.now() / 1000) + 3600,
        },
        202,
      )
      assert.equal(value.operationId, operationId)
      operations.push(operationId)
    }
    const operationId = operations[0],
      current = await api('GET', `/api/v1/devices/${f.mdm}/operations/${operationId}`),
      cancelId = randomUUID()
    await api('POST', `/api/v1/devices/${f.mdm}/operations/${operationId}/cancel`, {
      requestId: cancelId,
      expectedRevision: current.revision,
    })
    const activityPath = `/api/v1/devices/${f.mdm}/management-activities`,
      activities = await until(
        () => api('GET', activityPath + '?operation=' + operationId),
        (value) => value.items.some((item) => item.links.operation === operationId),
      ),
      activity = activities.items.find((item) => item.links.operation === operationId)
    assert.ok(Number.isSafeInteger(activities.asOf))
    assert.ok(Array.isArray(activities.coverage))
    await changeAuthority(
      f.rule.grants.filter((grant) => !['audit_read', 'inventory_read'].includes(grant.operation)),
    )
    await api('GET', '/api/v1/audit-events', undefined, 403)
    await run.nav(
      p,
      `/audit?view=activities&device=${f.mdm}&operation=${operationId}`,
      '审计与管理活动',
    )
    await p.locator('.audit-page tbody button').first().click()
    await p.getByRole('heading', { name: '管理活动详情', exact: true }).waitFor()
    await summary('原业务坐标')
    await p.getByText(operationId, { exact: true }).first().waitFor()
    const detail = await api('GET', activityPath + '/' + encodeURIComponent(activity.id))
    assert.equal(detail.activity.id, activity.id)
    assert.equal(detail.personal, false)
    assert.equal('payload' in detail.activity, false)
    await button('关闭活动详情').click()
    await changeAuthority(f.rule.grants)
    checks.push(
      'real-native-history-detail-safe-projection-with-OperationRead-without-AuditRead-or-InventoryRead',
    )

    run.step('audit-window-pagination-cursor-binding-and-owner-navigation')
    const auditQuery = `/api/v1/audit-events?device=${f.mdm}&operationId=${operationId}&action=command_cancel`,
      audit = await until(
        () => api('GET', auditQuery),
        (value) => value.items.some((fact) => fact.operationId === cancelId),
      ),
      fact = audit.items.find((fact) => fact.operationId === cancelId)
    assert.ok(fact.relatedOperationIds.includes(operationId))
    assert.equal('payload' in fact, false)
    assert.equal('body' in fact, false)
    await run.nav(
      p,
      `/audit?device=${f.mdm}&operationId=${operationId}&action=command_cancel`,
      '审计与管理活动',
    )
    run.step('audit:open-safe-fact')
    await p.locator('.audit-page tbody button').first().click()
    await p.getByRole('heading', { name: '审计事实详情', exact: true }).waitFor()
    run.step('audit:recorded-dimension')
    await p.getByText('服务端记录时间', { exact: true }).waitFor()
    run.step('audit:observed-dimension')
    await p.getByText('生产者观察时间', { exact: true }).waitFor()
    run.step('audit:timeline-link')
    await p.getByRole('link', { name: '查看设备时间线', exact: true }).click()
    assert.equal(new URL(p.url()).searchParams.get('device'), f.mdm)
    assert.equal(new URL(p.url()).searchParams.get('view'), 'timeline')
    await settled()
    await run.nav(p, `/audit?device=${f.mdm}&limit=1`, '审计与管理活动')
    await button('下一页').waitFor({ state: 'visible' })
    const firstPage = await api('GET', `/api/v1/audit-events?device=${f.mdm}&limit=1`)
    assert.ok(firstPage.nextCursor)
    await button('下一页').click()
    await p.waitForURL((url) => url.searchParams.has('cursor'))
    const appliedCursor = new URL(p.url()).searchParams.get('cursor')
    await summary('高级定位条件')
    await label('主体').fill(f.principal)
    await button('查询').click()
    await p.waitForURL(
      (url) => !url.searchParams.has('cursor') && url.searchParams.get('actor') === f.principal,
    )
    await api(
      'GET',
      `/api/v1/devices/${f.mdm}/timeline?limit=1&cursor=${encodeURIComponent(firstPage.nextCursor)}`,
      undefined,
      409,
    )
    await api(
      'GET',
      `/api/v1/audit-events?limit=1&action=command_cancel&cursor=${encodeURIComponent(firstPage.nextCursor)}`,
      undefined,
      409,
    )
    await run.nav(
      p,
      `/audit?device=${f.mdm}&limit=1&action=command_cancel&cursor=${encodeURIComponent(appliedCursor)}`,
      '审计与管理活动',
    )
    await button('从首页重新查询事实').click()
    assert.equal(new URL(p.url()).searchParams.has('cursor'), false)
    checks.push(
      'safe-recorded-observed-dimensions-timeline-navigation-applied-window-pagination-and-409-explicit-restart',
    )

    run.step('current-policy-tool-alias-and-shared-event-navigation')
    const scope = randomUUID(),
      policyIds = [randomUUID(), randomUUID()],
      event = 'react.audit.shared'
    await api('POST', '/api/v1/scopes/' + scope, {
      operationId: randomUUID(),
      expectedRevision: 0,
      input: {
        action: 'put',
        definition: { targets: [{ kind: 'device', id: f.mdm }], limitations: null, exclusions: [] },
      },
    })
    for (const [index, id] of policyIds.entries()) {
      await api('POST', '/api/v1/policies/' + id, {
        operationId: randomUUID(),
        expectedRevision: 0,
        input: {
          action: 'put',
          enabled: false,
          definition: {
            scope,
            alias: 'react.audit.' + index,
            customEvent: event,
            action: {
              kind: 'unmanage_device',
              schedule: {
                trigger: { kind: 'manual' },
                misfire: { kind: 'coalesce_one' },
                notBefore: 0,
                until: null,
                jitterSeconds: 0,
                window: null,
              },
              runLifetimeSeconds: 3600,
            },
          },
        },
      })
    }
    const resolved = await api('POST', '/api/v1/policies/resolve', {
      kind: 'alias',
      alias: 'react.audit.0',
    })
    await run.nav(p, '/audit', '审计与管理活动')
    await summary('按工具地址与事件定位')
    for (const [kind, value] of [
      ['Policy ID', policyIds[0]],
      ['工具别名', 'react.audit.0'],
      ['正式工具名', resolved.capability.toolName],
    ]) {
      await run.choose(p, label('地址类型'), kind)
      await label('精确地址').fill(value)
      await run.response(p, 'POST', '/api/v1/policies/resolve', () =>
        button('读取当前身份').click(),
      )
      await p.getByText('当前配置身份（本次读取）', { exact: true }).waitFor()
    }
    await label('精确事件名').fill(event)
    await button('查找关联 Policy').click()
    await button('选择此 Policy').first().waitFor()
    assert.equal(await button('选择此 Policy').count(), 2)
    await button('选择此 Policy').first().click()
    await button('查看此 Policy 审计').click()
    assert.equal(new URL(p.url()).searchParams.get('targetType'), 'policy')
    assert.ok(policyIds.includes(new URL(p.url()).searchParams.get('targetId')))
    checks.push(
      'real-current-policy-id-alias-tool-name-and-shared-event-directory-navigation-without-history-rewrite',
    )

    run.step('policy-entry-availability-and-authorized-alias-withdrawal')
    const policyPath = '/api/v1/policies/' + policyIds[0]
    await run.nav(
      p,
      `/policies?${new URLSearchParams({ policy: policyIds[0], tab: 'names' })}`,
      '策略与部署',
    )
    const names = p.locator('.ant-modal:visible')
    await names.getByText('稳定工具名（只读）', { exact: true }).waitFor()
    const associations = names.getByRole('region', { name: '当前事件关联成员' })
    await associations
      .locator('tbody tr')
      .filter({ hasText: resolved.capability.toolName })
      .waitFor()
    assert.equal(await associations.locator('tbody tr').count(), 2)
    await names.getByRole('tab', { name: '定义与发布', exact: true }).click()
    await label('唯一别名').waitFor()
    await names.getByRole('tab', { name: '名称与入口', exact: true }).click()
    let releasePolicy
    const heldPolicy = new Promise((done) => {
        releasePolicy = done
      }),
      otherPolicyPath = '/api/v1/policies/' + policyIds[1]
    await p.route('**' + otherPolicyPath, async (route) => {
      if (route.request().method() === 'GET') await heldPolicy
      await route.continue()
    })
    await associations
      .locator('tbody tr')
      .filter({ hasText: 'react.audit.1' })
      .getByRole('link')
      .click()
    await p.waitForURL((url) => url.searchParams.get('policy') === policyIds[1])
    assert.equal(await label('唯一别名').count(), 0)
    releasePolicy()
    await label('唯一别名').waitFor()
    assert.equal(await label('唯一别名').inputValue(), 'react.audit.1')
    await p.unroute('**' + otherPolicyPath)
    await button('返回来源').click()
    await names.getByText('稳定工具名（只读）', { exact: true }).waitFor()
    await button('显示 Agent 查看入口').click()
    await p.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin })
    await label('终端候选服务端筛选').fill(`id=='${f.agent}'`)
    await button('查询终端候选').click()
    await button('使用此终端').click()
    await button('复制链接 · 共享事件').click()
    await p.getByRole('status').filter({ hasText: '已复制 · 共享事件' }).waitFor()
    const copiedEvent = new URL(await p.evaluate(() => globalThis.navigator.clipboard.readText()))
    assert.equal(copiedEvent.pathname, `/v1/event/${event}`)
    assert.equal(copiedEvent.searchParams.get('device'), f.agent)
    assert.equal(copiedEvent.searchParams.get('tenant'), f.tenant)
    const registered = (await api('GET', `/api/v1/devices/${f.agent}`)).channels.find(
      (channel) => channel.channel === 'agent' && channel.status === 'active',
    )
    assert.ok(registered)
    assert.equal(copiedEvent.searchParams.get('instance'), f.instance)
    assert.equal(copiedEvent.searchParams.get('registration'), registered.registrationId)
    assert.equal(copiedEvent.searchParams.get('generation'), String(registered.generation))
    checks.push('real-shared-event-copy-for-current-agent-registration')
    await names.getByRole('tab', { name: '定义与发布', exact: true }).click()
    await label('唯一别名').fill('react.audit.1')
    await label('确认范围、资源、调度与潜在影响').check()
    await run.response(p, 'POST', policyPath, () => button('保存策略定义').click(), 409)
    await p
      .getByText('保存冲突。请重新读取策略修订；若别名被其他策略占用，请换用可用别名。', {
        exact: true,
      })
      .waitFor()
    await label('唯一别名').fill('react.audit.renamed')
    await label('共享事件名').fill('')
    await label('确认范围、资源、调度与潜在影响').check()
    await run.response(p, 'POST', policyPath, () => button('保存策略定义').click())
    await api('POST', '/api/v1/policies/resolve', { kind: 'alias', alias: 'react.audit.0' }, 404)
    const renamed = await api('POST', '/api/v1/policies/resolve', {
      kind: 'alias',
      alias: 'react.audit.renamed',
    })
    assert.equal(renamed.policy.id, policyIds[0])
    assert.equal(renamed.policy.definition.customEvent, null)
    await button('返回并重新读取策略').click()
    await run.nav(
      p,
      `/policies?${new URLSearchParams({ policy: policyIds[0], tab: 'definition' })}`,
      '策略与部署',
    )
    await label('唯一别名').fill('')
    await label('确认范围、资源、调度与潜在影响').check()
    await run.response(p, 'POST', policyPath, () => button('保存策略定义').click())
    const withdrawn = await api('GET', policyPath)
    assert.equal(withdrawn.definition.alias, null)
    assert.equal(withdrawn.definition.customEvent, null)
    await api(
      'POST',
      '/api/v1/policies/resolve',
      { kind: 'alias', alias: 'react.audit.renamed' },
      404,
    )
    await button('返回并重新读取策略').click()
    await run.nav(
      p,
      `/policies?${new URLSearchParams({ policy: policyIds[0], tab: 'names' })}`,
      '策略与部署',
    )
    await names.getByText('稳定工具名（只读）', { exact: true }).waitFor()
    const archived = await api('DELETE', policyPath, {
      operationId: randomUUID(),
      expectedRevision: withdrawn.revision,
    })
    assert.equal(archived.state, 'archived')
    await button('重新读取名称与入口').click()
    await names
      .getByText(`${archived.versionId} · r${archived.revision}`, { exact: true })
      .waitFor()
    await names.getByText(resolved.capability.toolName, { exact: true }).waitFor()
    assert.equal(await button('显示 Agent 查看入口').count(), 0)
    checks.push('real-policy-owner-alias-duplicate-cas-rename-withdraw-and-unpublished-entry-gate')

    run.step('subscription-commit-response-loss-and-explicit-original-replay')
    await run.nav(p, '/webhooks', 'Webhook 集成')
    await button('新建 Webhook 订阅').click()
    await label('订阅名称').fill('React receiver')
    await label('接收地址（HTTPS）').fill(f.console.webhookOrigin + '/events')
    await p.getByLabel('设备退管', { exact: true }).check()
    await run.choose(p, label('设备范围'), '精确设备')
    await label('设备 ID（每行一个）').fill(f.mdm)
    await label('签名材料引用').fill('console')
    await label('接收网络策略引用').fill('console')
    await summary('扩展描述与精确原操作')
    const subscription = randomUUID(),
      path = `${base}/subscriptions/${subscription}`
    await label('精确订阅 UUID').fill(subscription)
    await label('其它描述字段（完整 JSON 对象）').fill(
      JSON.stringify({ vendor: { retained: false, zero: 0 } }),
    )
    let original, resent
    const pattern = '**' + path,
      lose = async (route) => {
        if (route.request().method() !== 'PUT') return route.continue()
        try {
          original = route.request().postDataJSON()
          const committed = await route.fetch({ maxRetries: 0 })
          assert.equal(committed.status(), 200)
          await p.context().unroute(pattern, lose)
          await route.abort('failed')
        } catch {
          interceptionFailed = true
          await route.abort('failed').catch(() => {})
        }
      }
    await p.context().route(pattern, lose)
    await button('保存订阅配置').click()
    await button('显式重提原 Webhook 请求').waitFor()
    assert.equal(run.count(p, 'PUT', path), 1)
    const saved = await api('GET', path)
    assert.equal(saved.enabled, false)
    assert.deepEqual(saved.settings.presentation.vendor, { retained: false, zero: 0 })
    await tab('投递健康')
    await button('读取投递健康').waitFor()
    await tab('订阅')
    await button('显式重提原 Webhook 请求').waitFor()
    assert.equal(run.count(p, 'PUT', path), 1)
    const capture = (request) => {
      if (request.method() === 'PUT' && new URL(request.url()).pathname === path)
        resent = request.postDataJSON()
    }
    p.on('request', capture)
    await run.response(p, 'PUT', path, () => button('显式重提原 Webhook 请求').click())
    p.off('request', capture)
    assert.deepEqual(resent, original)
    await button('关闭编辑').click()
    await summary('定位已知订阅')
    await label('已知订阅 UUID').fill(subscription)
    await button('定位精确订阅').click()
    await p.getByRole('heading', { name: 'Webhook 订阅详情', exact: true }).waitFor()
    await run.response(p, 'PUT', path, () => button('启用订阅').click())
    await button('开始新的操作').click()
    checks.push(
      'real-disabled-subscription-whole-metadata-preservation-committed-response-loss-no-auto-write-same-UUID-replay',
    )

    run.step('diagnostics-after-a-different-writer-and-audit-revocation')
    const other = await run.page()
    await run.login(other, f.console.diagnosticsWriter)
    const current = await api('GET', path)
    const otherSession = await other.request.get(
      origin + `/api/v1/identity/tenants/${f.tenant}/session`,
    )
    assert.equal(otherSession.status(), 200)
    const edit = await other.request.put(origin + path, {
      headers: {
        Origin: origin,
        'X-Identity-Request': '1',
        'X-CSRF-Token': (await otherSession.json()).csrfToken,
      },
      data: {
        operationId: randomUUID(),
        expectedRevision: current.revision,
        change: { kind: 'enabled', value: false },
      },
    })
    assert.equal(edit.status(), 200)
    assert.equal((await api('GET', path)).enabled, false)
    const diagnosticBase = '/api/v1/operation-diagnostics'
    const diagnosticPath = `${diagnosticBase}/operations/webhook/${original.operationId}`
    const operationQuery = new URLSearchParams({
      mode: 'operation',
      owner: 'webhook',
      operationId: original.operationId,
    })
    const originalResult = (await api('GET', diagnosticPath)).originalResult
    assert.equal(originalResult.availability, 'available')
    assert.ok(originalResult.value.revision < (await api('GET', path)).revision)
    const discovery = await until(
      () => api('GET', diagnosticBase + '?operationId=' + original.operationId),
      (page) => page.items.some(({ fact }) => fact.requestReplayed),
    )
    const replay = discovery.items.find(({ fact }) => fact.requestReplayed).fact
    assert.equal(replay.origin, 'request')
    assert.ok(replay.requestId)
    assert.ok((await api('GET', diagnosticBase + '/requests/' + replay.requestId)).items.length)
    await run.nav(p, '/operation-diagnostics', '操作排障')
    await label('原操作编号').fill(original.operationId)
    await run.response(p, 'GET', diagnosticBase, () => button('查询操作').click())
    const requestLink = p.locator(`a[href*="requestId=${replay.requestId}"]`)
    const row = p.locator('details').filter({ has: requestLink }).first()
    await row.locator(':scope > summary').click()
    await run.response(p, 'GET', diagnosticBase + '/requests/' + replay.requestId, () =>
      row.locator(requestLink).first().click(),
    )
    await p.getByText('请求尝试与关联证据', { exact: true }).waitFor()

    await run.nav(p, '/operation-diagnostics?' + operationQuery, '操作排障')
    await p.getByText('原操作结果', { exact: true }).waitFor()
    await changeAuthority(f.rule.grants.filter((grant) => grant.operation !== 'audit_read'))
    await button('读取请求与审计证据').click()
    await p.getByText('当前权限无法读取此证据。', { exact: true }).first().waitFor()
    await p.getByText('原操作结果', { exact: true }).waitFor()
    assert.deepEqual((await api('GET', diagnosticPath)).originalResult, originalResult)
    await changeAuthority(f.rule.grants)
    const latest = await api('GET', path)
    await api('PUT', path, {
      operationId: randomUUID(),
      expectedRevision: latest.revision,
      change: { kind: 'enabled', value: true },
    })
    await run.nav(p, '/webhooks?subscription=' + subscription, 'Webhook 集成')
    await p.getByRole('heading', { name: 'Webhook 订阅详情', exact: true }).waitFor()
    checks.push('real-original-webhook-receipt-after-other-writer-and-independent-audit-revocation')

    run.step('subscription-detail-CAS-and-pending-delivery-observation')
    await button('编辑订阅').click()
    await label('订阅名称').fill('Stale React edit')
    const before = await api('GET', path)
    await api('PUT', path, {
      operationId: randomUUID(),
      expectedRevision: before.revision,
      change: { kind: 'enabled', value: false },
    })
    await run.response(p, 'PUT', path, () => button('保存订阅配置').click(), 409)
    await p.getByRole('alert').filter({ hasText: '内容已变化' }).waitFor()
    await button('关闭编辑').click()
    await button('重新读取订阅详情').click()
    await button('启用订阅').waitFor()
    await run.response(p, 'PUT', path, () => button('启用订阅').click())
    await button('开始新的操作').click()
    await summary('为精确设备排队测试事件')
    await label('测试设备 ID').fill(f.mdm)
    const tested = await run.response(p, 'POST', path + '/test', () =>
        button('排队测试事件').click(),
      ),
      receipt = await tested.json()
    assert.ok(receipt.eventId)
    assert.ok(receipt.id)
    await until(
      () => api('GET', `${base}/deliveries/${receipt.id}`),
      (value) =>
        value.items[0].status === 'pending' && value.items[0].transportObservation === 'unknown',
    )
    await p.getByRole('link', { name: '读取此测试投递', exact: true }).click()
    await p.getByRole('heading', { name: 'Webhook 投递详情', exact: true }).waitFor()
    await settled()
    assert.equal(await button('创建重放投递').isDisabled(), true)
    assert.equal(await button('恢复原投递').isDisabled(), true)
    await p.getByText(receipt.eventId, { exact: true }).waitFor()
    await tab('投递健康')
    await run.response(p, 'GET', base + '/health', () => button('读取投递健康').click())
    await p.getByText('当前租户的投递健康', { exact: true }).waitFor()
    checks.push(
      'real-subscription-CAS-rejection-test-event-versus-delivery-410-pending-unknown-recovery-disabled-and-tenant-health',
    )

    run.step('subscription-directory-pagination-and-owned-query-change')
    const secondSubscription = randomUUID()
    await api('PUT', `${base}/subscriptions/${secondSubscription}`, {
      operationId: randomUUID(),
      expectedRevision: 0,
      change: {
        kind: 'put',
        value: { ...saved.settings, presentation: { name: 'Second React receiver' } },
      },
    })
    await run.nav(p, '/webhooks?subscription.limit=1', 'Webhook 集成')
    await button('下一页').click()
    await p.waitForURL((url) => url.searchParams.has('subscription.cursor'))
    await run.choose(p, label('订阅启用状态'), '已启用')
    await p.waitForURL(
      (url) =>
        !url.searchParams.has('subscription.cursor') &&
        url.searchParams.get('subscription.filter') === "enabled=='true'",
    )
    await settled()
    checks.push('real-subscription-server-cursor-and-filter-change-restarts-only-its-own-directory')

    run.step('material-import-secret-clear-original-read-and-head-CAS')
    await tab('签名材料')
    await button('管理签名材料').click()
    await run.choose(p, label('材料来源'), '导入接收端密钥')
    const materialReference = 'react-' + randomUUID()
    await label('材料签名引用').fill(materialReference)
    await button('采用当前读取的配置版本').click()
    await label('确认接收地址').fill(f.console.webhookOrigin + '/confirm')
    await label('确认网络引用').fill('console')
    await label('导入签名密钥').fill(importSecret)
    let materialId, publicInput, originalMaterialRequest
    const materialPattern = '**' + base + '/materials',
      loseMaterial = async (route) => {
        if (route.request().method() !== 'POST') return route.continue()
        try {
          materialId = route.request().headers()['idempotency-key']
          const body = route.request().postDataJSON()
          originalMaterialRequest = body
          publicInput = { ...body, source: { kind: 'generate' } }
          const committed = await route.fetch({ maxRetries: 0 })
          assert.equal(committed.status(), 200)
          await p.context().unroute(materialPattern, loseMaterial)
          await route.abort('failed')
        } catch {
          interceptionFailed = true
          await route.abort('failed').catch(() => {})
        }
      }
    await p.context().route(materialPattern, loseMaterial)
    await button('提交材料操作').click()
    await button('显式重提原材料请求').waitFor()
    assert.equal(await label('重新输入相同原签名密钥').inputValue(), '')
    await safeDOM(importSecret)
    assert.equal(run.count(p, 'POST', base + '/materials'), 1)
    await button('关闭材料任务').click()
    await tab('投递健康')
    await tab('签名材料')
    await button('返回材料任务').click()
    assert.equal(await label('重新输入相同原签名密钥').inputValue(), '')
    await summary('在此任务内重新认证')
    await label('材料操作重新认证密码').fill(readFileSync(f.passwordFile, 'utf8').trim())
    await run.response(
      p,
      'POST',
      `/api/v1/identity/tenants/${f.tenant}/session/reauthenticate`,
      () => button('重新认证并保留原操作').click(),
    )
    await p
      .getByRole('alert')
      .filter({ hasText: '重新认证已完成，请显式读取或重提原操作' })
      .waitFor()
    assert.equal(new URL(p.url()).pathname, '/webhooks')
    assert.equal(await label('材料操作重新认证密码').inputValue(), '')
    assert.equal(run.count(p, 'POST', base + '/materials'), 1)
    await run.response(p, 'GET', `${base}/materials/operations/${materialId}`, () =>
      button('读取冻结材料原操作').click(),
    )
    await p.getByRole('alert').filter({ hasText: '原操作记录已读取' }).waitFor()
    assert.equal(await p.getByRole('alert').filter({ hasText: '原材料操作回执已确认' }).count(), 0)
    assert.equal(run.count(p, 'POST', base + '/materials'), 1)
    let replayedMaterialRequest, replayedMaterialId
    const captureOriginalMaterial = (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === base + '/materials') {
        replayedMaterialRequest = request.postDataJSON()
        replayedMaterialId = request.headers()['idempotency-key']
      }
    }
    p.on('request', captureOriginalMaterial)
    await label('重新输入相同原签名密钥').fill(importSecret)
    await run.response(p, 'POST', base + '/materials', () => button('显式重提原材料请求').click())
    p.off('request', captureOriginalMaterial)
    await p.getByRole('alert').filter({ hasText: '原材料操作回执已确认' }).waitFor()
    assert.equal(run.count(p, 'POST', base + '/materials'), 2)
    assert.equal(replayedMaterialId, materialId)
    assert.deepEqual(replayedMaterialRequest, originalMaterialRequest)
    await safeDOM(importSecret)
    const operation = await api('GET', `${base}/materials/operations/${materialId}`)
    assert.equal(operation.reference, materialReference)
    assert.equal(operation.confirmed, false)
    assert.equal('secret' in operation, false)
    await api('POST', base + '/materials', publicInput, 409, randomUUID())
    const directory = await api('GET', base + '/materials'),
      head = directory.keys.heads.find((value) => value.reference === materialReference)
    await api(
      'POST',
      base + '/materials',
      { ...publicInput, expectedRevision: head.revision, configurationSha256: 'f'.repeat(64) },
      409,
      randomUUID(),
    )
    await api(
      'POST',
      base + '/materials/transitions',
      {
        reference: materialReference,
        expectedRevision: head.revision,
        action: { kind: 'activate', materialRevision: operation.revision },
      },
      409,
      randomUUID(),
    )
    await button('开始新的材料操作').click()
    await run.choose(p, label('材料操作类型'), '撤销精确材料')
    await label('材料签名引用').fill(materialReference)
    await button('采用当前读取的配置版本').click()
    await label('精确材料版本').fill(String(operation.revision))
    await run.response(p, 'POST', base + '/materials/transitions', () =>
      button('提交材料操作').click(),
    )
    await safeDOM(importSecret)
    await button('开始新的材料操作').click()
    await run.choose(p, label('材料操作类型'), '准备新材料')
    await label('材料签名引用').fill('generated-' + randomUUID())
    await button('采用当前读取的配置版本').click()
    await run.choose(p, label('材料来源'), '服务端生成')
    await label('确认接收地址').fill(f.console.webhookOrigin + '/confirm')
    await label('确认网络引用').fill('console')
    await run.response(p, 'POST', base + '/materials', () => button('提交材料操作').click())
    await p.getByRole('alert').filter({ hasText: '原材料操作回执已确认' }).waitFor()
    await button('关闭材料任务').click()
    checks.push(
      'real-import-commit-response-loss-secret-clearing-original-GET-no-auto-replay-stale-head-config-and-unconfirmed-activation-rejected-revocation',
    )

    run.step('current-permission-denials-clear-cached-facts')
    await run.nav(p, `/webhooks?tab=deliveries&delivery=${receipt.id}`, 'Webhook 集成')
    await p.getByRole('heading', { name: 'Webhook 投递详情', exact: true }).waitFor()
    await settled()
    await changeAuthority(f.rule.grants.filter((grant) => grant.operation !== 'webhook_read'))
    await run.response(
      p,
      'GET',
      `${base}/deliveries/${receipt.id}`,
      () => button('重新读取投递详情').click(),
      403,
    )
    await p.getByRole('alert').filter({ hasText: '已隐藏此前目录' }).waitFor()
    await button('关闭投递详情').click()
    assert.equal(await p.locator('.webhooks-page tbody tr[data-row-key]').count(), 0)
    await changeAuthority(f.rule.grants)
    await run.response(p, 'GET', base + '/deliveries', () => button('读取投递目录').click())
    await button(receipt.id).waitFor()
    await run.nav(p, `/webhooks?subscription=${subscription}`, 'Webhook 集成')
    await p.getByRole('heading', { name: 'Webhook 订阅详情', exact: true }).waitFor()
    await p.getByText('React receiver', { exact: true }).first().waitFor()
    await changeAuthority(f.rule.grants.filter((grant) => grant.operation !== 'webhook_read'))
    await run.response(p, 'GET', path, () => button('重新读取订阅详情').click(), 403)
    await p.getByRole('alert').filter({ hasText: '已隐藏此前目录' }).waitFor()
    assert.equal(await p.getByText('React receiver', { exact: true }).count(), 0)
    await button('关闭订阅详情').click()
    assert.equal(await p.getByText('React receiver', { exact: true }).count(), 0)
    await run.response(p, 'GET', base + '/subscriptions', () => button('读取订阅目录').click(), 403)
    assert.equal(await p.getByText('React receiver', { exact: true }).count(), 0)
    await api('GET', base + '/materials', undefined, 403)
    await changeAuthority(f.rule.grants.filter((grant) => grant.operation !== 'audit_read'))
    await run.nav(
      p,
      `/audit?view=activities&device=${f.mdm}&operation=${operationId}`,
      '审计与管理活动',
    )
    await p.locator('.audit-page tbody button').first().waitFor()
    await changeAuthority(
      f.rule.grants.filter((grant) => !['audit_read', 'operation_read'].includes(grant.operation)),
    )
    await button('读取当前权限与事实').click()
    await api('GET', activityPath, undefined, 403)
    await settled()
    assert.equal(await p.locator('.audit-page tbody button').count(), 0)
    await changeAuthority(f.rule.grants)
    checks.push(
      'real-Webhooks-detail-403-fences-directory-without-grant-refresh-and-independent-activity-authority-revocation',
    )
  } else {
    await api('PUT', `${base}/subscriptions/${randomUUID()}`, {
      operationId: randomUUID(),
      expectedRevision: 0,
      change: {
        kind: 'put',
        value: {
          presentation: { name: 'React receiver' },
          endpoint: f.console.webhookOrigin + '/events',
          eventTypes: ['device.retired'],
          selection: { kind: 'devices', ids: [f.mdm] },
          keyReference: 'console',
          networkReference: 'console',
        },
      },
    })
  }
  run.step('public-responsive-design-and-keyboard')
  publicLayout = true
  const screenshots = mkdtempSync(join(tmpdir(), 'rss-react-audit-webhooks-'))
  for (const [route, title, name] of [
    ['/webhooks', 'Webhook 集成', 'webhooks'],
    [designOnly ? '/audit' : '/audit?device=' + f.mdm, '审计与管理活动', 'audit'],
  ]) {
    await run.nav(p, route, title)
    await settled()
    await p.locator('tbody button').first().waitFor()
    assert.equal(Math.round((await p.locator('aside.sidebar').boundingBox()).width), 218)
    assert.equal(Math.round((await p.locator('header.topbar').boundingBox()).height), 58)
    for (const [viewport, width, height] of [
      ['desktop', 1440, 960],
      ['tablet', 900, 960],
      ['mobile', 390, 844],
    ]) {
      await p.setViewportSize({ width, height })
      run.step('layout:' + name + ':' + viewport)
      const dimensions = await p.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }))
      if (dimensions.page > dimensions.viewport)
        console.error(
          JSON.stringify({ journey: 'react-audit-webhooks', layout: name, viewport, dimensions }),
        )
      assert.equal(dimensions.page <= dimensions.viewport, true)
      await p.screenshot({
        path: join(screenshots, `${name}-${viewport}.png`),
        fullPage: true,
        animations: 'disabled',
      })
    }
    await p.setViewportSize({ width: 1440, height: 960 })
    await button('切换亮暗主题').click()
    await p.screenshot({
      path: join(screenshots, `${name}-dark.png`),
      fullPage: true,
      animations: 'disabled',
    })
    await button('切换亮暗主题').click()
  }
  const trigger = p.locator('.audit-page tbody button').first()
  await trigger.focus()
  await p.keyboard.press('Enter')
  await p.getByRole('heading', { name: '审计事实详情', exact: true }).waitFor()
  await button('关闭事实详情').click()
  assert.equal(await trigger.evaluate((node) => document.activeElement === node), true)
  await safeDOM(importSecret)
  await run.nav(p, '/webhooks', 'Webhook 集成')
  await p.locator('.webhooks-page tbody button').first().waitFor()
  await changeAuthority(
    f.rule.grants.filter(
      (grant) => !['webhook_read', 'webhook_write', 'webhook_replay'].includes(grant.operation),
    ),
  )
  await button('读取当前 Webhook 权限').click()
  await p.getByRole('alert').filter({ hasText: '当前没有 Webhook 管理权限' }).waitFor()
  const hiddenPanels = p.locator('.webhooks-page .permission-panel[hidden]')
  assert.ok(await hiddenPanels.count())
  assert.equal(
    await hiddenPanels.evaluateAll((nodes) =>
      nodes.every((node) => getComputedStyle(node).display === 'none'),
    ),
    true,
  )
  await changeAuthority(f.rule.grants)
  checks.push('real-hidden-permission-panels-stay-hidden-under-current-production-layout-CSS')
  assert.equal(interceptionFailed, false)
  console.log(JSON.stringify({ journey: 'react-audit-webhooks', screenshots }))
  checks.push(
    'design-218-sidebar-58-header-desktop-tablet-mobile-dark-safe-public-pages-and-keyboard-detail-focus-return',
  )
} catch (error) {
  failure = error
  if (diagnosticPage && (publicLayout || new URL(diagnosticPage.url()).pathname === '/audit')) {
    const directory = mkdtempSync(join(tmpdir(), 'rss-react-audit-failure-'))
    await diagnosticPage
      .screenshot({
        path: join(directory, 'public-audit.png'),
        fullPage: true,
        animations: 'disabled',
      })
      .catch(() => {})
    console.error(
      JSON.stringify({ journey: 'react-audit-webhooks', publicFailureScreenshot: directory }),
    )
  }
  console.error(
    JSON.stringify({
      journey: 'react-audit-webhooks',
      classification: error?.name,
      location: error?.stack?.match(/react-audit-webhooks-browser\.mjs:\d+:\d+/)?.[0],
    }),
  )
} finally {
  await run.finish(failure)
}
