// Real HTTPS and browser operations. Existing DA registrar facts are prerequisites,
// not proof of native enrollment, account creation, device wiping or PSSO login.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { executeBounded } from '../identity/process.mjs'
import process from 'node:process'
import { realBrowser } from './react-mdm-browser.mjs'
const run = await realBrowser('MDM_DEVICE_BROWSER_FIXTURE', 'react-execution-access')
let failure
const blocked = []
const screenshots = mkdtempSync(join(tmpdir(), 'rss-react-execution-access-'))
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
    if (response.status() !== expected)
      console.error(
        JSON.stringify({
          phase: 'http-status',
          method,
          path: path.split('?')[0],
          actual: response.status(),
          expected,
        }),
      )
    assert.equal(response.status(), expected, `${method} ${path.split('?')[0]}`)
    const raw = await response.text()
    return raw ? JSON.parse(raw) : null
  }
  await run.login(p)
  run.step('device-confirmation-and-unknown-acceptance')
  const endpoint = await api('GET', `/api/v1/devices/${f.mdm}`)
  const restart = endpoint.capabilities.find(
    (fact) => fact.channel === 'mdm' && fact.action === 'restart',
  )
  assert.deepEqual(
    [restart?.productSupport.state, restart?.devicePrerequisite.state, restart?.permission.allowed],
    ['supported', 'supported', true],
    'configured Windows restart applicability',
  )
  await run.nav(p, `/devices/endpoint/${f.mdm}`, '设备详情')
  await button('核对设备与动作').click()
  let dialog = p.getByRole('dialog', { name: '确认设备动作', exact: true })
  await dialog.waitFor()
  await p.waitForFunction(() => {
    const dialog = document.querySelector('[role=dialog]')
    return (
      dialog &&
      getComputedStyle(dialog).opacity === '1' &&
      getComputedStyle(dialog).transform === 'none' &&
      dialog
        .getAnimations({ subtree: true })
        .every((animation) => animation.playState !== 'running')
    )
  })
  await dialog.screenshot({
    path: join(screenshots, 'device-action-review.png'),
    animations: 'disabled',
  })
  assert.equal(
    await dialog.getByRole('button', { name: '确认提交此动作', exact: true }).isDisabled(),
    true,
  )
  // Changing device abandons the confirmation and cannot submit to the former device.
  await run.nav(p, `/devices/endpoint/${f.alone}`, '设备详情')
  assert.equal(await p.getByRole('dialog', { name: '确认设备动作', exact: true }).count(), 0)
  assert.equal(run.count(p, 'POST', `/api/v1/devices/${f.mdm}/operations`), 0)
  await run.nav(p, `/devices/endpoint/${f.mdm}`, '设备详情')
  await button('核对设备与动作').click()
  dialog = p.getByRole('dialog', { name: '确认设备动作', exact: true })
  await dialog.getByRole('checkbox').check()
  let original
  await p.context().route(`**/api/v1/devices/${f.mdm}/operations`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    original = route.request().postDataJSON()
    const response = await route.fetch()
    assert.equal(response.status(), 202)
    await route.abort('failed')
  })
  await dialog.getByRole('button', { name: '确认提交此动作', exact: true }).click()
  await p.getByText('提交结果未知，请查询原操作，勿重新创建', { exact: false }).waitFor()
  assert.equal(run.count(p, 'POST', `/api/v1/devices/${f.mdm}/operations`), 1)
  await p.context().unroute(`**/api/v1/devices/${f.mdm}/operations`)
  await p
    .locator('a')
    .filter({ hasText: '查看操作排障' })
    .and(p.locator('a[href*="owner=device_control"]'))
    .click()
  await p.getByRole('heading', { name: '操作排障', exact: true }).waitFor()
  await p.getByText('原操作结果', { exact: true }).waitFor()
  await p.getByText('执行证据', { exact: true }).waitFor()
  await p.getByText('已受理', { exact: true }).waitFor()
  assert.equal(run.count(p, 'POST', `/api/v1/devices/${f.mdm}/operations`), 1)
  const execution = new URLSearchParams({ kind: 'command', operation: original.operationId })
  await run.nav(p, '/operations?' + execution, '执行与结果')
  await p.getByRole('heading', { name: '执行与结果', exact: true }).waitFor()
  await p.getByText('原操作与结果', { exact: true }).waitFor()
  await button('读取详细结果与证据').click()
  await p.getByText('维护原设备动作', { exact: true }).waitFor()
  const facts = await api('GET', `/api/v1/devices/${f.mdm}/operations/${original.operationId}`)
  assert.equal(facts.commandId, original.operationId)
  assert.notEqual(facts.observation.effect, 'verified')
  checks.push(
    'real-device-confirmation-discarded-on-device-change-and-202-response-loss-original-recovery-no-replay',
  )
  run.step('original-cancellation-cas-unknown')
  await p
    .getByRole('checkbox', { name: '我已核对原操作及设备，并明确确认本次恢复', exact: true })
    .check()
  let cancellation
  const path = `/api/v1/devices/${f.mdm}/operations/${original.operationId}/cancel`
  await p.context().route('**' + path, async (route) => {
    cancellation = route.request().postDataJSON()
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    await route.abort('failed')
  })
  await button('请求取消原操作').click()
  await button('显式重提同一恢复请求').waitFor()
  await p.context().unroute('**' + path)
  await button('查询原操作当前事实').click()
  await button('显式重提同一恢复请求').waitFor()
  const repeated = p.waitForRequest(
    (request) => new URL(request.url()).pathname === path && request.method() === 'POST',
  )
  await button('显式重提同一恢复请求').click()
  assert.deepEqual((await repeated).postDataJSON(), cancellation)
  checks.push('real-cancellation-reuses-original-request-id-and-cas-after-unknown')

  run.step('mac-action-capability-before-pin-and-confirmation')
  await run.nav(p, '/devices/endpoint/fixture-mac', '设备详情')
  await run.choose(p, label('设备动作'), '锁定')
  await p.getByText('当前设备证据不足', { exact: false }).last().waitFor()
  assert.equal(await button('核对设备与动作').isDisabled(), true)
  assert.equal(await label('六位锁定 PIN').count(), 0)
  await run.choose(p, label('设备动作'), '擦除设备')
  assert.equal(await button('核对设备与动作').isDisabled(), true)
  assert.equal(await p.getByRole('dialog', { name: '确认设备动作', exact: true }).count(), 0)
  assert.equal(run.count(p, 'POST', '/api/v1/devices/fixture-mac/operations'), 0)
  checks.push('real-macos-capability-unknown-blocked-before-pin-confirmation-and-post')

  run.step('script-policy-real-agent-lifecycle')
  const base = '/api/v1',
    group = randomUUID(),
    resource = randomUUID()
  async function mutate(kind, id, input, expectedRevision = 0, expected = 200) {
    const value = await api(
      'POST',
      `${base}/${kind}/${id}`,
      { operationId: randomUUID(), expectedRevision, input },
      expected,
    )
    if (kind === 'policies' && input.action === 'put' && expected === 200)
      await until(
        async () => {
          const response = await p.request.get(`${origin}${base}/policies/${id}/scope`)
          if (response.status() === 503) {
            await response.dispose()
            return null
          }
          assert.equal(response.status(), 200)
          return response.json()
        },
        (scope) => scope?.resolution != null,
      )
    return value
  }
  async function until(read, accept, budget = 45000) {
    const end = Date.now() + budget
    do {
      const value = await read()
      if (accept(value)) return value
      await new Promise((done) => setTimeout(done, 500))
    } while (Date.now() < end)
    assert.fail('bounded execution fact convergence')
  }
  await mutate('groups', group, {
    action: 'create',
    presentation: { name: 'Execution browser', description: '' },
    assetContext: 'endpoint',
    criteria: null,
  })
  const membership = await mutate(
    'groups',
    group,
    {
      action: 'members',
      add: [{ kind: 'endpoint', id: f.collector.runtime.deviceId }],
      remove: [],
    },
    1,
    202,
  )
  await until(
    () => api('GET', `${base}/groups/${group}/tasks/${membership.task}`),
    (v) => v.status === 'completed',
  )
  const bytes = Buffer.from("#!/bin/sh\nprintf '{}'\n"),
    upload = randomUUID()
  await mutate('resources', resource, { action: 'create', kind: 'script' })
  await mutate(
    'resources',
    resource,
    {
      action: 'version',
      kind: 'script',
      version: '1',
      variants: [
        {
          platform: 'macos',
          architecture: 'aarch64',
          key: 'default',
          declaration: {
            kind: 'script',
            artifact: {
              reference: 'execution.sh',
              length: bytes.length,
              sha256: [...createHash('sha256').update(bytes).digest()],
            },
            definition: {
              profile: 'posix_sh',
              sql: null,
              runAs: 'system',
              encoding: 'utf8',
              parameters: {
                type: 'object',
                properties: {},
                required: [],
                additionalProperties: false,
              },
              bindings: {},
              output: { type: 'object' },
              purpose: { kind: 'action' },
              timeoutSeconds: 30,
              outputBytes: 1024,
              maxRows: 1,
            },
          },
        },
      ],
    },
    1,
  )
  await api(
    'POST',
    `${base}/resources/${resource}/uploads/${upload}?version=1&platform=macos&architecture=aarch64&variant=default`,
  )
  const session = await api('GET', `${base}/identity/tenants/${f.tenant}/session`)
  const appended = await p.request.patch(
    `${origin}${base}/resources/${resource}/uploads/${upload}?offset=0`,
    {
      headers: {
        Origin: origin,
        'X-Identity-Request': '1',
        'X-CSRF-Token': session.csrfToken,
        'Content-Type': 'application/octet-stream',
      },
      data: bytes,
    },
  )
  assert.equal(appended.status(), 200)
  await api('POST', `${base}/resources/${resource}/uploads/${upload}/complete`, undefined, 201)
  await mutate('resources', resource, { action: 'activate', version: '1' }, 2)
  async function agent(action, policy) {
    const result = await executeBounded(
      'python3',
      [
        fileURLToPath(new URL('./device-agent.py', import.meta.url)),
        process.env.MDM_DEVICE_BROWSER_FIXTURE,
        action,
        policy,
        '0',
      ],
      {
        timeoutMs: action.startsWith('script_') ? 60000 : 150000,
        graceMs: 2000,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    assert.equal(result.status, 0, result.stdout.trim())
    return JSON.parse(result.stdout)
  }
  for (const terminal of ['success', 'failure', 'unknown']) {
    const policy = randomUUID()
    await mutate('policies', policy, {
      action: 'put',
      enabled: true,
      definition: {
        ...(terminal === 'success'
          ? {
              alias: 'react.execution.preview',
              selfService: {
                access: { kind: 'device' },
                published: true,
                allowAi: false,
                riskLevel: 1,
                presentation: {
                  displayName: 'Script preview',
                  description: '',
                  prerequisites: '',
                  sideEffects: '',
                  category: 'Support',
                  keywords: [],
                },
              },
            }
          : {}),
        scope: { targets: [{ kind: 'group', id: group }], limitations: null, exclusions: [] },
        action: {
          kind: 'execution',
          resource: {
            id: resource,
            version: '1',
            platform: 'macos',
            architecture: 'aarch64',
            variant: 'default',
          },
          parameters: {},
          schedule: {
            trigger: { kind: 'check_in', minimumSeconds: 60 },
            misfire: { kind: 'coalesce_one' },
            notBefore: 0,
            until: null,
            jitterSeconds: 0,
            window: null,
          },
          frequency: 'every_trigger',
          runLifetimeSeconds: 60,
        },
      },
    })
    await run.nav(p, `/policies?policy=${policy}`, '策略与部署')
    await label('唯一别名').waitFor()
    await p.getByRole('tab', { name: '记录', exact: true }).click()
    await p.getByRole('tab', { name: '设备分配', exact: true }).click()
    await p.getByText('当前设备分配资格', { exact: true }).waitFor()
    const assignment = await until(
      () => api('GET', `${base}/policies/${policy}/assignments?limit=100`),
      (v) => v.items.some((i) => i.object.id === f.collector.runtime.deviceId),
    )
    const before = assignment.items.find((i) => i.object.id === f.collector.runtime.deviceId)
    assert.equal(before.execution.kind, 'recurring')
    assert.equal(before.execution.latestRun, null)
    run.step('policy-waiting-no-run-ui')
    console.log(
      JSON.stringify({
        phase: 'script-waiting',
        admission: before.taskAdmission?.state,
        currentRecord: before.execution.currentRecord.state,
        hasLatest: before.execution.latestRun !== null,
      }),
    )
    await button('读取分配').click()
    await p.getByText('尚无历史运行', { exact: false }).first().waitFor()
    await p.screenshot({
      path: join(screenshots, `policy-${terminal}-waiting.png`),
      fullPage: true,
      animations: 'disabled',
    })
    const task = await agent('script_start', policy)
    const runPath = `${base}/policies/${policy}/runs/${task.task}`
    await until(
      () => api('GET', runPath),
      (v) => v.state.execution === 'running',
    )
    await button('读取分配').click()
    await p
      .getByRole('link', { name: new RegExp(task.task) })
      .first()
      .click()
    await p.getByRole('heading', { name: '执行与结果', exact: true }).waitFor()
    await button('读取详细结果与证据').click()
    await p.locator('.device-facts').getByText('运行中', { exact: true }).waitFor()
    if (terminal !== 'unknown') await agent(`script_${terminal}`, policy)
    const final = await until(
      () => api('GET', runPath),
      (v) =>
        v.state.execution ===
        (terminal === 'success' ? 'succeeded' : terminal === 'failure' ? 'failed' : 'unknown'),
      terminal === 'unknown' ? 120000 : 45000,
    )
    await button('读取详细结果与证据').click()
    await p
      .locator('.device-facts')
      .getByText({ succeeded: '成功', failed: '失败', unknown: '未知' }[final.state.execution], {
        exact: true,
      })
      .first()
      .waitFor()
    assert.equal(final.taskId, task.task)
    if (terminal === 'success') {
      await p.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin })
      await button('显示 Agent 查看入口').click()
      await button('复制链接 · 原任务').waitFor()
      await p.evaluate(() => {
        const clipboard = globalThis.navigator.clipboard,
          write = clipboard.write.bind(clipboard)
        clipboard.write = (items) => {
          globalThis.document.documentElement.dataset.entryCopyStarted = 'true'
          return write(items)
        }
      })
      let releaseCopy
      const delayedCopy = new Promise((done) => {
          releaseCopy = done
        }),
        registrationPath = `**${base}/devices/${final.device}`
      await p.route(registrationPath, async (route) => {
        if (route.request().method() === 'GET') await delayedCopy
        await route.continue()
      })
      await button('复制链接 · 原任务').click()
      try {
        await p.waitForFunction(
          () => globalThis.document.documentElement.dataset.entryCopyStarted === 'true',
        )
      } finally {
        releaseCopy()
      }
      await p.getByRole('status').filter({ hasText: '已复制 · 原任务' }).waitFor()
      await p.unroute(registrationPath)
      const copied = new URL(await p.evaluate(() => globalThis.navigator.clipboard.readText()))
      assert.equal(copied.pathname, `/v1/task/${task.task}`)
      assert.equal(copied.searchParams.get('attempt'), final.attemptId)

      await p.getByRole('link', { name: '查看此执行的管理活动', exact: true }).click()
      await p.waitForURL(
        (url) =>
          url.pathname === '/audit' &&
          url.searchParams.get('task') === task.task &&
          url.searchParams.get('attempt') === final.attemptId,
      )
      const facts = await until(
        () => api('GET', `${base}/devices/${final.device}/management-activities?task=${task.task}`),
        (value) =>
          value.items.some(
            (fact) => fact.links.task === task.task && fact.links.attempt === final.attemptId,
          ),
      )
      assert.ok(facts.items.every((fact) => fact.links.task === task.task))
      await p.locator('.audit-page tbody tr').first().waitFor()
      await run.nav(
        p,
        `/policies?${new URLSearchParams({ policy, tab: 'configuration' })}`,
        '策略与部署',
      )
      await p.getByText('稳定工具名（只读）', { exact: true }).waitFor()
      await button('显示 Agent 查看入口').click()
      await run.directoryFilter(
        p.getByRole('region', { name: 'Agent 查看入口', exact: true }),
        `key=='endpoint:${final.device}'`,
      )
      await p
        .locator('.policy-editor tbody tr')
        .filter({ hasText: final.device })
        .getByRole('button', { name: '使用此终端', exact: true })
        .click()
      await button('复制链接 · 唯一别名').click()
      await p.getByRole('status').filter({ hasText: '已复制 · 唯一别名' }).waitFor()
      const aliasUri = await p.evaluate(() => globalThis.navigator.clipboard.readText()),
        alias = new URL(aliasUri),
        resolved = await api('POST', `${base}/policies/resolve`, {
          kind: 'alias',
          alias: 'react.execution.preview',
        })
      assert.equal(alias.pathname, '/v1/alias/react.execution.preview')
      assert.equal(resolved.policy.id, policy)
      assert.deepEqual(Object.fromEntries(alias.searchParams), {
        device: final.device,

        instance: resolved.capability.instance,

        revision: String(resolved.capability.revision),
        tenant: f.tenant,
        version: resolved.capability.version,
      })
      await button('复制命令 · 唯一别名').click()
      await p.waitForFunction(
        async (expected) => (await globalThis.navigator.clipboard.readText()) === expected,
        `rssmdm open '${aliasUri}'`,
      )
      checks.push('real-task-copy-current-attempt-registration-and-audit-navigation')
    }
    await mutate('policies', policy, { action: 'disable' }, 1)
    checks.push(`real-agent-script-${terminal}-policy-assignment-run-and-original-attempt`)
  }

  run.step('collection-global-evidence')
  const collectionResource = randomUUID(),
    collectionPolicy = randomUUID()
  const blueprint = (await api('GET', `${base}/collection-blueprints`)).items.find(
    (i) => i.id === 'macos.agent.memory',
  )
  assert.ok(blueprint)
  const collectionCreated = await mutate('resources', collectionResource, {
    action: 'instantiate',
    blueprint: blueprint.id,
    version: blueprint.version,
  })
  const collectionVersion = collectionCreated.versions.find(
    (i) => i.id === `builtin.${blueprint.id}.${blueprint.version}`,
  )
  assert.ok(collectionVersion)
  await mutate(
    'resources',
    collectionResource,
    { action: 'activate', version: collectionVersion.id },
    collectionCreated.revision,
  )
  await mutate('policies', collectionPolicy, {
    action: 'put',
    enabled: true,
    definition: {
      scope: { targets: [{ kind: 'group', id: group }], limitations: null, exclusions: [] },
      action: {
        kind: 'agent_collection',
        resource: {
          id: collectionResource,
          version: collectionVersion.id,
          platform: 'macos',
          architecture: 'aarch64',
          variant: 'aarch64',
        },
        schedule: {
          trigger: { kind: 'interval', anchor: Math.floor(Date.now() / 1000), seconds: 60 },
          misfire: { kind: 'coalesce_one' },
          notBefore: 0,
          until: null,
          jitterSeconds: 0,
          window: null,
        },
        frequency: 'every_trigger',
        runLifetimeSeconds: 300,
      },
    },
  })
  const collected = await agent('memory', collectionResource)
  const collectionDirectory = await until(
    () =>
      api(
        'GET',
        `${base}/operations?filter=${encodeURIComponent(`policy==${collectionPolicy}`)}&fields=id,kind,device,origin,policy,deadline,status,evidence&limit=20`,
      ),
    (v) => v.items.some((i) => i.id === collected.task),
  )
  const collectionItem = collectionDirectory.items.find((i) => i.id === collected.task)
  assert.equal(collectionItem.kind, 'action_run')
  assert.equal(collectionItem.evidence.owner, 'collection')
  assert.equal(collectionItem.evidence.channel, 'agent')
  await run.nav(
    p,
    `/operations?${new URLSearchParams({ filter: `policy==${collectionPolicy}` })}`,
    '执行与结果',
  )
  await button(collected.task).click()
  await p.getByText('原操作与结果', { exact: true }).waitFor()
  await button('读取详细结果与证据').click()
  await p.locator('.device-facts').getByText('成功', { exact: true }).first().waitFor()
  checks.push('real-collection-mtls-report-global-directory-evidence-and-original-run')

  run.step('configuration-publication-assignment-native-command')
  const configurationResource = randomUUID(),
    configurationPolicy = randomUUID(),
    configurationUpload = randomUUID()
  const node = './Device/Vendor/MSFT/Policy/Config/Experience/AllowCortana'
  const content = Buffer.from(
    JSON.stringify({
      target: { kind: 'device' },
      apply: {
        platform: 'windows',
        request: {
          kind: 'sync_ml',
          request: {
            kind: 'node',
            node,
            instance: [],
            operation: 'replace',
            value: { type: 'integer', value: '1' },
          },
        },
      },
      remove: {
        platform: 'windows',
        request: {
          kind: 'sync_ml',
          request: { kind: 'node', node, instance: [], operation: 'delete', value: null },
        },
      },
    }),
  )
  await mutate('resources', configurationResource, { action: 'create', kind: 'configuration' })
  await mutate(
    'resources',
    configurationResource,
    {
      action: 'version',
      kind: 'configuration',
      version: '1',
      variants: [
        {
          platform: 'windows',
          architecture: 'x86_64',
          key: 'default',
          declaration: {
            kind: 'configuration',
            artifact: {
              reference: 'configuration.json',
              length: content.length,
              sha256: [...createHash('sha256').update(content).digest()],
            },
          },
        },
      ],
    },
    1,
  )
  await api(
    'POST',
    `${base}/resources/${configurationResource}/uploads/${configurationUpload}?version=1&platform=windows&architecture=x86_64&variant=default`,
  )
  const configurationSession = await api('GET', `${base}/identity/tenants/${f.tenant}/session`)
  assert.equal(
    (
      await p.request.patch(
        `${origin}${base}/resources/${configurationResource}/uploads/${configurationUpload}?offset=0`,
        {
          headers: {
            Origin: origin,
            'X-Identity-Request': '1',
            'X-CSRF-Token': configurationSession.csrfToken,
            'Content-Type': 'application/octet-stream',
          },
          data: content,
        },
      )
    ).status(),
    200,
  )
  await api(
    'POST',
    `${base}/resources/${configurationResource}/uploads/${configurationUpload}/complete`,
    undefined,
    201,
  )
  await mutate('resources', configurationResource, { action: 'activate', version: '1' }, 2)
  await mutate('policies', configurationPolicy, {
    action: 'put',
    enabled: true,
    definition: {
      scope: { targets: [{ kind: 'device', id: f.mdm }], limitations: null, exclusions: [] },
      action: {
        kind: 'configuration',
        resource: {
          id: configurationResource,
          version: '1',
          platform: 'windows',
          architecture: 'x86_64',
          variant: 'default',
        },
        exit: 'remove',
      },
    },
  })
  const assignedConfiguration = await until(
    () => api('GET', `${base}/policies/${configurationPolicy}/assignments?limit=100`),
    (v) =>
      v.items.some(
        (i) =>
          i.object.id === f.mdm &&
          i.execution.kind === 'operations' &&
          i.execution.operationIds.length,
      ),
  )
  const command = assignedConfiguration.items.find((i) => i.object.id === f.mdm).execution
    .operationIds[0]
  await run.nav(p, `/policies?policy=${configurationPolicy}`, '策略与部署')
  await label('唯一别名').waitFor()
  await p.getByRole('tab', { name: '记录', exact: true }).click()
  await p.getByRole('tab', { name: '设备分配', exact: true }).click()
  await p.getByRole('link', { name: command, exact: true }).click()
  await p.getByRole('heading', { name: '执行与结果', exact: true }).waitFor()
  await p.getByText('原操作与结果', { exact: true }).waitFor()
  await button('读取详细结果与证据').click()
  await p.getByText('原输入版本', { exact: true }).waitFor()
  const native = await api('GET', `${base}/devices/${f.mdm}/operations/${command}`)
  assert.equal(native.owner, 'configuration')
  assert.notEqual(native.observation.effect, 'verified')
  checks.push(
    'real-published-configuration-policy-assignment-links-original-native-command-without-device-effect-claim',
  )

  run.step('device-access-authority-boundary')
  const enterpriseRead = await p.request.get(
    `${origin}/api/v1/device-access/enterprise/configuration?limit=1`,
  )
  if (enterpriseRead.status() === 403) {
    assert.equal((await enterpriseRead.json()).code, 'permission_denied')
    for (const path of [
      `/api/v1/devices/${f.executionAccess.device}/device-access?limit=1`,
      `/api/v1/apple/platform-sso/configuration?deviceId=${f.executionAccess.device}`,
    ])
      assert.equal((await api('GET', path, undefined, 403)).code, 'permission_denied')
    await run.nav(
      p,
      `/device-access?device=${encodeURIComponent(f.executionAccess.device)}`,
      'Device Access',
    )
    await p.getByText('当前账户没有此操作权限。', { exact: true }).first().waitFor()
    assert.equal(run.count(p, 'POST', '/api/v1/device-access/enterprise/configuration'), 0)
    await p.screenshot({
      path: join(screenshots, 'device-access-permission-denied.png'),
      fullPage: true,
      animations: 'disabled',
    })
    checks.push('real-da-http-denial-visible-without-enterprise-configuration-write')
    blocked.push({
      area: 'device-access-binding-enterprise-psso-success',
      status: 403,
      code: 'permission_denied',
    })
  } else {
    assert.equal(enterpriseRead.status(), 200)
    run.step('purpose-bound-device-access-and-enterprise')
    const cdp = await p.context().newCDPSession(p)
    await cdp.send('WebAuthn.enable')
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    })
    await run.nav(p, '/security', '安全设置')
    await label('通行密钥名称').fill('Execution access browser key')
    await button('添加通行密钥').click()
    await p.getByText('Execution access browser key', { exact: true }).waitFor()
    await run.nav(
      p,
      `/device-access?device=${encodeURIComponent(f.executionAccess.device)}`,
      'Device Access',
    )
    await p.getByText('fixture-da', { exact: false }).first().waitFor()
    await button('新建账户绑定').click()
    await label('Identity 实例 UUID').fill(f.instance)
    await label('账户主体 UUID').fill(f.principal)
    await label('Device Access 策略 UUID').fill(f.executionAccess.policy)
    await label('新账户名称').fill('browser-account')
    await button('冻结此绑定操作并核对').click()
    await button('验证此绑定用途').click()
    await p.getByText('用途验证已完成', { exact: true }).waitFor()
    await p.getByRole('checkbox', { name: '已核对当前设备、账户、策略和影响', exact: true }).check()
    let bindingInput
    const writeWait = p.waitForRequest(
      (request) =>
        request.method() === 'PUT' &&
        /\/device-access\/bindings\//.test(new URL(request.url()).pathname),
    )
    await button('确认保存绑定操作').click()
    const write = await writeWait
    bindingInput = write.postDataJSON()
    await p.getByText('当次回执:', { exact: false }).waitFor()
    const bindingId = new URL(write.url()).pathname.split('/').at(-1)
    const receipt = await api(
      'GET',
      `/api/v1/devices/${f.executionAccess.device}/device-access/operations/${bindingInput.operationId}`,
    )
    assert.equal(receipt.id, bindingId)
    assert.equal(receipt.operationId, bindingInput.operationId)
    assert.equal(receipt.serverState, 'pending')
    assert.equal(receipt.appliedRevision, null)
    assert.equal(receipt.effect, null)
    assert.equal(
      run.count(
        p,
        'PUT',
        `/api/v1/devices/${f.executionAccess.device}/device-access/bindings/${bindingId}`,
      ),
      1,
    )
    await p.screenshot({
      path: join(screenshots, 'device-access-binding.png'),
      fullPage: true,
      animations: 'disabled',
    })
    await button('结束或重新编辑此任务').click()
    await run.choose(p, label('绑定动作'), '重置因子')
    await button('冻结此绑定操作并核对').click()
    await button('验证此绑定用途').click()
    await p.getByText('用途验证已完成', { exact: true }).waitFor()
    await p.getByRole('checkbox', { name: '已核对当前设备、账户、策略和影响', exact: true }).check()
    await run.response(
      p,
      'PUT',
      `/api/v1/devices/${f.executionAccess.device}/device-access/bindings/${bindingId}`,
      () => button('确认保存绑定操作').click(),
    )
    await button('结束或重新编辑此任务').click()
    checks.push(
      'real-cookie-webauthn-binding-acceptance-factor-reset-and-original-snapshot-without-fake-device-effect',
    )
    const psso = await api(
      'GET',
      `/api/v1/apple/platform-sso/configuration?deviceId=${encodeURIComponent(f.executionAccess.device)}`,
    )
    assert.equal(psso.configuration.teamId, 'ABCDEFGHIJ')
    await p.getByText('Platform SSO 管理配置', { exact: true }).waitFor()
    checks.push(
      'real-current-psso-configuration-profile-without-registration-or-login-readiness-claim',
    )

    await button('配置企业应用或账户映射').click()
    await run.choose(p, label('配置类型'), '账户主体映射')
    await label('Provider UUID').fill(randomUUID())
    await label('Identity 实例 UUID').last().fill(f.instance)
    await label('主体 UUID').fill(f.principal)
    await label('Provider subject').fill('browser-subject')
    await label('Provider 用户名').fill('browser-user')
    await button('冻结并核对企业配置').click()
    await button('验证此企业配置用途').click()
    await p.getByText('用途验证已完成', { exact: true }).last().waitFor()
    await p.getByRole('checkbox', { name: '我已核对目标、版本及企业登录影响', exact: true }).check()
    await run.response(p, 'POST', '/api/v1/device-access/enterprise/configuration', () =>
      button('确认保存企业配置').click(),
    )
    await button('刷新当前配置以核对').click()
    await p.getByText('已读取当前配置版本:', { exact: false }).waitFor()
    await button('结束或重新编辑此任务').last().click()
    checks.push('real-purpose-bound-enterprise-subject-save-and-current-configuration-comparison')
    const daBase = '/api/v1/device-access/operation-diagnostics'
    const daOperation = `${daBase}/operations/device_access/${bindingInput.operationId}`
    const daQuery = new URLSearchParams({
      context: 'da',
      mode: 'operation',
      owner: 'device_access',
      operationId: bindingInput.operationId,
      device: f.executionAccess.device,
    })
    await run.nav(p, '/operation-diagnostics?' + daQuery, '操作排障')
    await p.getByText('原操作结果', { exact: true }).waitFor()
    await p.getByText(bindingInput.operationId, { exact: true }).waitFor()
    assert.equal(
      (await api('GET', daOperation + '?device=' + encodeURIComponent(f.executionAccess.device)))
        .originalResult.availability,
      'available',
    )
    await run.nav(p, '/operation-diagnostics?context=da', '操作排障')
    await label('原操作编号').fill(bindingInput.operationId)
    const discovery = await run.response(p, 'GET', daBase, () => button('查询操作').click())
    const daRequest = (await discovery.json()).items.find(
      ({ fact }) => fact.origin === 'request' && fact.requestId,
    )
    assert.ok(daRequest)
    const requestHref = `a[href*="context=da"][href*="requestId=${daRequest.fact.requestId}"]`
    const row = p
      .locator('details')
      .filter({ has: p.locator(requestHref) })
      .first()
    await row.locator(':scope > summary').click()
    const response = await run.response(
      p,
      'GET',
      daBase + '/requests/' + daRequest.fact.requestId,
      () => row.locator(requestHref).first().click(),
    )
    const attempts = await response.json()
    assert.ok(attempts.items.some(({ fact }) => fact.requestId === daRequest.fact.requestId))
    await p.getByText('请求尝试与关联证据', { exact: true }).waitFor()
    checks.push('real-da-diagnostics-directory-request-and-original-receipt')
  }

  run.step('task-signing-trust-management-and-public-layout')
  await run.nav(p, '/operations', '执行与结果')
  await button('读取信任与当前权限').click()
  await p.getByRole('checkbox', { name: '已核对信任版本、设备分发与轮换影响', exact: true }).check()
  await run.response(p, 'POST', '/api/v1/task-signing/trust', () =>
    button('准备新的签名 Key').click(),
  )
  await button('查询原信任变更').click()
  await p.getByText('原回执版本:', { exact: false }).waitFor()
  checks.push('real-trust-prepare-and-original-receipt-distinct-from-device-observations')
  const directory = await api(
    'GET',
    `/api/v1/operations?filter=${encodeURIComponent(`device=='${f.mdm}'`)}&limit=100`,
  )
  assert.ok(directory.items.some((item) => item.id === original.operationId))
  for (const [name, width] of [
    ['desktop', 1440],
    ['tablet', 900],
    ['mobile', 390],
  ]) {
    await p.setViewportSize({ width, height: 960 })
    for (const [path, title, file] of [
      ['/operations', '执行与结果', 'executions'],
      ['/device-access', 'Device Access', 'device-access'],
    ]) {
      await run.nav(p, path, title)
      await p.waitForFunction(() => document.querySelectorAll('.admin-loading').length === 0)
      const fits = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      if (!fits)
        console.error(
          JSON.stringify({
            phase: 'viewport-overflow',
            name,
            file,
            width,
            offenders: await p.evaluate(() =>
              [...document.querySelectorAll('main *')]
                .map((el) => ({
                  tag: el.tagName,
                  classes: el.className,
                  right: Math.round(el.getBoundingClientRect().right),
                  width: Math.round(el.getBoundingClientRect().width),
                  overflow: getComputedStyle(el).overflowX,
                }))
                .filter((el) => el.right > innerWidth + 1)
                .slice(0, 12),
            ),
          }),
        )
      await p.screenshot({
        path: join(screenshots, `${file}-${name}.png`),
        fullPage: true,
        animations: 'disabled',
      })
      assert.equal(fits, true)
      await p.screenshot({
        path: join(screenshots, `${file}-${name}.png`),
        fullPage: true,
        animations: 'disabled',
      })
    }
  }
  await p.getByRole('button', { name: '切换亮暗主题', exact: true }).click()
  await p.screenshot({
    path: join(screenshots, 'device-access-dark.png'),
    fullPage: true,
    animations: 'disabled',
  })
  checks.push('real-public-desktop-tablet-mobile-dark-layout-and-no-viewport-overflow')
  run.step('session-change-discards-device-confirmation')
  const controlPath = `/api/v1/devices/${f.mdm}/operations`
  const postsBeforeSignout = run.count(p, 'POST', controlPath)
  await run.nav(p, `/devices/endpoint/${f.mdm}`, '设备详情')
  await button('核对设备与动作').click()
  dialog = p.getByRole('dialog', { name: '确认设备动作', exact: true })
  await dialog.getByRole('checkbox').check()
  const otherTab = await p.context().newPage()
  await otherTab.goto(origin + '/security')
  await otherTab.getByRole('button', { name: '退出登录', exact: true }).click()
  await otherTab.getByRole('heading', { name: '欢迎回来', exact: true }).waitFor()
  await p.bringToFront()
  if (!(await p.getByRole('heading', { name: '欢迎回来', exact: true }).isVisible())) {
    if (await dialog.isVisible())
      await dialog.getByRole('button', { name: '确认提交此动作', exact: true }).click()
    else await button('读取最新设备事实').click()
  }
  await p.getByRole('heading', { name: '欢迎回来', exact: true }).waitFor()
  assert.equal(run.count(p, 'POST', controlPath), postsBeforeSignout)
  await run.login(p)
  await run.nav(p, `/devices/endpoint/${f.mdm}`, '设备详情')
  assert.equal(await p.getByRole('dialog', { name: '确认设备动作', exact: true }).count(), 0)
  await otherTab.close()
  checks.push(
    'real-cross-tab-session-end-and-new-login-discard-old-device-confirmation-without-post',
  )
  console.log(JSON.stringify({ journey: 'react-execution-access', screenshots, blocked }))
} catch (error) {
  console.error(
    JSON.stringify({
      journey: 'react-execution-access',
      location: error.stack
        ?.split('\n')
        .filter((line) => /^\s+at /.test(line))
        .slice(0, 3),
    }),
  )
  failure = error
}
await run.finish(failure ?? (blocked.length ? new Error('backend-seams-unverified') : undefined))
