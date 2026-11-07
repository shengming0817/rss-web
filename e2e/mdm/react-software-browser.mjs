// React over the existing isolated real HTTPS product, storage and controlled WinGet source.
import { Buffer } from 'node:buffer'
import { realBrowser } from './react-mdm-browser.mjs'
import { randomUUID, createHash } from 'node:crypto'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const run = await realBrowser('MDM_DEVICE_BROWSER_FIXTURE', 'react-software')
let failure, diagnosticPage
try {
  const { fixture: f, origin, checks } = run,
    p = await run.page()
  diagnosticPage = p
  await run.login(p)
  const label = (name) => p.getByLabel(name, { exact: true }).filter({ visible: true }),
    button = (name) => p.getByRole('button', { name, exact: true }).filter({ visible: true }),
    tab = (name) => p.getByRole('tab', { name, exact: true }).click(),
    resource = 'react-software-' + randomUUID(),
    direct = 'react-direct-' + randomUUID(),
    escaped = (id) => encodeURIComponent(id),
    versionPath = (id) => `/api/v1/software/resources/${escaped(id)}/versions/resource-v1`,
    resourcePath = (id) => `/api/v1/resources/${escaped(id)}`,
    contentPath = (id) =>
      versionPath(id) +
      `/content?platform=windows&architecture=x86_64&variant=${id === direct ? 'direct' : 'main'}`,
    sha = [...createHash('sha256').update('abc').digest()]
  let nextApi = 0,
    interceptionFailure = false
  async function api(method, path, data, expected = 200) {
    const wait = Math.max(0, nextApi - Date.now())
    nextApi = Date.now() + wait + 220
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait))
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
    if (response.status() !== expected) {
      const value = await response.json().catch(() => null)
      console.error(
        JSON.stringify({
          journey: 'react-software',
          method,
          path: path.split('?')[0],
          expected,
          status: response.status(),
          code:
            typeof value?.code === 'string' && /^[a-z0-9_]{1,96}$/.test(value.code)
              ? value.code
              : 'unclassified',
        }),
      )
    }
    assert.equal(response.status(), expected, `${method} ${path.split('?')[0]}`)
    return [201, 204].includes(expected) ? undefined : response.json()
  }
  async function intercept(pattern, handler) {
    await p.route(pattern, async (route) => {
      try {
        await handler(route)
      } catch (error) {
        interceptionFailure = true
        console.error(
          JSON.stringify({
            journey: 'react-software',
            interceptionFailure: error.name,
            location: error.stack?.match(/react-software-browser\.mjs:(\d+):(\d+)/)?.[0],
          }),
        )
        await route.abort('failed').catch(() => {})
      }
    })
  }
  async function waitUntil(condition) {
    const deadline = Date.now() + 20000
    while (!condition()) {
      if (interceptionFailure || Date.now() > deadline) throw new Error('interception-unconfirmed')
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  async function loseFirst(pattern, status) {
    const calls = [],
      statuses = []
    const handler = async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      calls.push(route.request().postDataJSON())
      const response = await route.fetch()
      statuses.push(response.status())
      if (response.status() !== status) {
        const body = await response.json().catch(() => null)
        console.error(
          JSON.stringify({
            journey: 'react-software',
            expectedStatus: status,
            actualStatus: response.status(),
            code:
              typeof body?.code === 'string' && /^[a-z0-9_]{1,96}$/.test(body.code)
                ? body.code
                : 'unclassified',
          }),
        )
        interceptionFailure = true
        await route.fulfill({ response })
        return
      }
      if (calls.length === 1) return route.abort('failed')
      return route.fulfill({ response })
    }
    await intercept(pattern, handler)
    return { calls, statuses, stop: () => p.unroute(pattern) }
  }
  run.step('source-exact-registration-unknown')
  await run.nav(p, '/software', '软件目录')
  await button('软件来源').click()
  await tab('注册来源')
  await label('来源标识').fill('browser-rest')
  await label('来源精确版本').fill('1')
  await run.choose(p, label('来源协议'), 'winget_rest')
  await label('WinGet HTTPS 地址').fill(f.upstream + '/rest/')
  await label('WinGet 源标识').fill('browser-rest')
  const sourceLoss = await loseFirst('**/api/v1/software/sources/browser-rest/revisions/1', 200)
  await button('注册来源精确版本').click()
  await waitUntil(() => sourceLoss.statuses.length === 1)
  await button('显式重提原软件请求').waitFor()
  await tab('组织软件')
  await button('软件来源').click()
  await tab('注册来源')
  assert.equal(sourceLoss.calls.length, 1)
  await button('读取原来源当前状态').click()
  assert.equal(sourceLoss.calls.length, 1)
  await button('显式重提原软件请求').click()
  await p.getByText('来源注册回执已确认。', { exact: true }).waitFor()
  assert.deepEqual(sourceLoss.calls[1], sourceLoss.calls[0])
  await sourceLoss.stop()
  checks.push('source-registration-committed-loss-tab-retention-read-observation-and-exact-replay')

  run.step('exact-winget-import')
  await tab('精确来源导入')
  await run.choose(p, label('精确导入来源'), 'browser-rest / 1 · winget_rest · enabled')
  await button('读取选中来源快照').click()
  for (const [name, value] of [
    ['导入资源标识', resource],
    ['导入后的资源固定版本', 'resource-v1'],
    ['来源包标识', 'Acme.App'],
    ['来源包精确版本', '1.2'],
    ['导入变体键', 'main'],
    ['安装材料字节', '3'],
    ['WinGet 安装器类型', 'msi'],
    ['WinGet 安装范围', 'machine'],
    ['安装器材料键', 'installer'],
    ['检测软件版本', '1.2'],
    ['MSI 产品代码', '{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}'],
  ])
    await label(name).fill(value)
  await label('生成原生源导出定义').click()
  const importLoss = await loseFirst('**/api/v1/software/imports', 200)
  await button('提交精确软件导入').click()
  await waitUntil(() => importLoss.statuses.length === 1)
  await button('读取原导入资源当前状态').click()
  assert.equal(importLoss.calls.length, 1)
  await button('显式重提原软件请求').click()
  await p
    .getByText('精确导入回执已确认。安装材料、软件准入与源发布仍分别确认。', { exact: true })
    .waitFor()
  assert.deepEqual(importLoss.calls[1], importLoss.calls[0])
  await importLoss.stop()
  const imported = await api('GET', resourcePath(resource))
  assert.equal(imported.versions[0].state, 'frozen')
  assert.equal(imported.versions[0].variants[0].declaration.definition.version, '1.2')
  assert.equal((await api('GET', versionPath(resource))).lifecycle, null)
  checks.push(
    'real-tls-winget-import-fixed-resource-versus-actual-package-version-and-original-replay',
  )

  // The immutable upload ID is generated in the real panel; observe its actual begin response.
  async function deliver(id, lose) {
    await button('读取导入资源与材料').click()
    const current = await api('GET', resourcePath(id)),
      definition = current.versions[0].variants[0].declaration.definition,
      installer = definition.artifacts[definition.material.installer]
    assert.deepEqual(installer.sha256, sha)
    await run.choose(p, label('交付材料引用'), `${installer.reference} · 3`)
    await button('准备新的材料交付').click()
    await label('选择原材料文件').setInputFiles({
      name: 'Acme.msi',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('abc'),
    })
    const beginning = p.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/uploads\/[^/]+$/.test(new URL(r.url()).pathname),
    )
    await button('开始原上传').click()
    const response = await beginning
    assert.equal(response.status(), 200)
    const upload = (await response.json()).id,
      uploadPath = resourcePath(id) + '/uploads/' + upload
    let patches = 0
    if (lose)
      await intercept('**' + uploadPath + '?*', async (route) => {
        if (route.request().method() !== 'PATCH') return route.continue()
        patches++
        const result = await route.fetch()
        assert.equal(result.status(), 200)
        await route.abort('failed')
      })
    await button('从已确认位置续传一块').click()
    if (lose) {
      await waitUntil(() => patches === 1)
      await button('读取原上传状态').click()
      assert.equal(patches, 1)
      await p.unroute('**' + uploadPath + '?*')
    } else await button('完成原上传').waitFor({ state: 'visible' })
    let completed = 0
    if (lose)
      await intercept('**' + uploadPath + '/complete', async (route) => {
        const result = await route.fetch()
        assert.equal(result.status(), 201)
        completed++
        await route.abort('failed')
      })
    await button('完成原上传').click()
    if (lose) {
      await waitUntil(() => completed === 1)
      await button('查询原内容回执').click()
      await p.unroute('**' + uploadPath + '/complete')
    }
    await p.getByText('原内容提交回执已确认。', { exact: true }).waitFor()
    const receipt = await api('GET', resourcePath(id) + '/content/operations/' + upload)
    assert.equal(receipt.committed, true)
    assert.deepEqual(receipt.sha256, sha)
    return installer.reference
  }
  run.step('lost-chunk-completion-and-receipt')
  const reference = await deliver(resource, true)
  checks.push(
    'real-material-file-hash-lost-chunk-read-frontier-lost-complete-durable-original-receipt',
  )

  async function admission(id, action = 'enable') {
    await tab('版本准入')
    await label('准入资源标识').fill(id)
    await button('读取此软件资源的版本').click()
    await label('读取准入的固定版本').fill('resource-v1')
    await button('读取精确准入事实').click()
    await button(action === 'enable' ? '准入此软件版本' : '撤回此软件版本准入').click()
    await p.getByText('软件准入变更回执已确认。', { exact: true }).waitFor()
    assert.equal(
      (await api('GET', versionPath(id))).lifecycle.state,
      action === 'enable' ? 'enabled' : 'withdrawn',
    )
    await button('结束此操作并重新编辑或读取').click()
  }
  run.step('admission-and-authorized-private-download')
  assert.equal(
    (
      await p.request.get(origin + contentPath(resource) + '&artifact=' + escaped(reference))
    ).status(),
    403,
  )
  await admission(resource)
  await tab('精确来源导入')
  await button('读取小文件下载（最大 16 MiB）').click()
  const save = p.getByRole('link', { name: '保存已校验小文件', exact: true })
  await save.waitFor()
  const downloading = p.waitForEvent('download')
  await save.click()
  const download = await downloading
  assert.equal(readFileSync(await download.path()).toString(), 'abc')
  await button('清除临时下载').click()
  const anonymous = await p.context().browser().newContext({ ignoreHTTPSErrors: true })
  try {
    assert.equal((await anonymous.request.get(origin + contentPath(resource))).status(), 401)
  } finally {
    await anonymous.close()
  }
  checks.push('independent-admission-authorized-range-bytes-digest-and-anonymous-denial')

  await button('读取导入资源与材料').click()
  await label('显示名称').fill('Acme 企业应用')
  await label('分类').fill('业务工具')
  await run.response(p, 'POST', resourcePath(resource), () => button('保存资源元数据').click())
  const presentedResource = await api('GET', resourcePath(resource))
  assert.equal(presentedResource.presentation.name, 'Acme 企业应用')
  assert.equal(presentedResource.presentation.category, '业务工具')
  checks.push('real-resource-presentation-name-and-category-before-publication')

  run.step('native-publication-unknown-replay-and-withdrawal')
  await tab('WinGet / Brew 源发布')
  await tab('新建源发布')
  await label('发布软件资源标识').fill(resource)
  await button('读取发布资源当前版本').click()
  await run.choose(p, label('发布的精确资源版本'), 'resource-v1 · frozen')
  await label('发布目标标识').fill('absent-host-target')
  await button('读取精确目标当前摘要').click()
  await p.getByText('未找到此发布目标。目标由宿主配置。', { exact: true }).waitFor()
  assert.equal(await button('提交此精确源发布').isDisabled(), true)
  await label('发布目标标识').fill(f.target)
  await button('读取精确目标当前摘要').click()
  const publicationLoss = await loseFirst('**/api/v1/software/publications', 202)
  await button('提交此精确源发布').click()
  await waitUntil(() => publicationLoss.statuses.length === 1)
  await button('显式重提原软件请求').click()
  await waitUntil(() => publicationLoss.statuses.length === 2)
  assert.deepEqual(publicationLoss.calls[1], publicationLoss.calls[0])
  const publicationId = publicationLoss.calls[0].operationId
  await publicationLoss.stop()
  await tab('发布与撤回')
  await label('精确发布记录标识').fill(publicationId)
  async function readPublication() {
    const result = await run.response(
      p,
      'GET',
      `/api/v1/software/publications/${publicationId}`,
      () => button('读取精确发布记录').click(),
    )
    return result.json()
  }
  let published
  const publicationDeadline = Date.now() + 60000
  do {
    published = await readPublication()
    if (published.outcome === 'published') break
    await new Promise((resolve) => setTimeout(resolve, 300))
  } while (Date.now() < publicationDeadline)
  assert.equal(published.outcome, 'published')
  assert.equal(published.resource, resource)
  await button('请求撤回此源发布').click()
  await button('结束此操作并重新编辑或读取').click()
  const withdrawalDeadline = Date.now() + 60000
  do {
    published = await readPublication()
    if (published.withdrawal === 'withdrawn') break
    await new Promise((resolve) => setTimeout(resolve, 300))
  } while (Date.now() < withdrawalDeadline)
  assert.equal(published.withdrawn, true)
  assert.equal(published.withdrawal, 'withdrawn')
  checks.push(
    'host-target-digest-absence-publish-committed-loss-original-replay-and-source-withdrawal',
  )

  run.step('direct-import-without-native-export')
  await tab('精确来源导入')
  await button('结束此操作并重新编辑或读取').click()
  await label('导入资源标识').fill(direct)
  await label('导入变体键').fill('direct')
  await label('生成原生源导出定义').click()
  await run.response(p, 'POST', '/api/v1/software/imports', () =>
    button('提交精确软件导入').click(),
  )
  const directReference = await deliver(direct, false)
  await admission(direct)
  const directContent = await p.request.get(
    origin + contentPath(direct) + '&artifact=' + escaped(directReference),
    { headers: { Range: 'bytes=0-2' } },
  )
  assert.equal(directContent.status(), 206)
  assert.equal((await directContent.body()).toString(), 'abc')
  const directResource = await api('GET', resourcePath(direct))
  assert.equal(
    directResource.versions[0].variants[0].declaration.definition.export.kind,
    'disabled',
  )
  run.step('software-self-service-and-rollout')
  if (directResource.activeVersion !== 'resource-v1')
    await api('POST', resourcePath(direct), {
      operationId: randomUUID(),
      expectedRevision: directResource.revision,
      input: { action: 'activate', version: 'resource-v1' },
    })
  const scope = randomUUID(),
    laterScope = randomUUID(),
    policyId = randomUUID()
  for (const id of [scope, laterScope])
    await api('POST', '/api/v1/scopes/' + id, {
      operationId: randomUUID(),
      expectedRevision: 0,
      input: {
        action: 'put',
        definition: {
          targets: [{ kind: 'device', id: f.agent }],
          limitations: null,
          exclusions: [],
        },
      },
    })
  const opensAt = Math.floor(Date.now() / 1000) + 7200,
    schedule = {
      trigger: { kind: 'check_in', minimumSeconds: 60 },
      misfire: { kind: 'coalesce_one' },
      notBefore: 0,
      until: null,
      jitterSeconds: 0,
      window: null,
    }
  await api('POST', '/api/v1/policies/' + policyId, {
    operationId: randomUUID(),
    expectedRevision: 0,
    input: {
      action: 'put',
      enabled: false,
      definition: {
        scope,
        alias: null,
        customEvent: null,
        action: {
          kind: 'software',
          channel: 'agent',
          delivery: { kind: 'direct' },
          resource: {
            kind: 'software',
            id: direct,
            version: 'resource-v1',
            variants: { windows_x86_64: 'direct' },
          },
          intent: 'available_install',
          schedule,
          runLifetimeSeconds: 86400,
          rollout: {
            stages: [
              { scope, opensAt: 0, minimumVerifiedPercent: null },
              { scope: laterScope, opensAt, minimumVerifiedPercent: 85 },
            ],
          },
        },
        selfService: {
          access: { kind: 'device' },
          published: false,
          allowAi: false,
          riskLevel: 1,
          presentation: {
            displayName: 'Self-service software',
            description: '',
            prerequisites: '',
            sideEffects: '',
            category: 'Software',
            keywords: [],
            future: { retained: false, count: 0 },
          },
        },
      },
    },
  })
  for (const [kind, caption] of [
    ['device', '当前范围内的受信设备'],
    ['authenticated_user', '已认证企业用户'],
    ['users', '指定用户与组织'],
  ]) {
    await run.nav(p, '/policies?policy=' + policyId, '策略与部署')
    await button('打开定位策略').click()
    await run.choose(p, label('访问主体'), caption)
    if (kind === 'users') {
      await button('添加访问引用').click()
      await label('账户主体标识').fill(f.principal)
    }
    await label('发布到自助目录').check()
    await label('确认范围、资源、调度与潜在影响').check()
    const saved = await run.response(p, 'POST', '/api/v1/policies/' + policyId, () =>
      button('保存策略定义').click(),
    )
    const current = await saved.json()
    assert.equal(current.definition.selfService.access.kind, kind)
    assert.equal(current.definition.selfService.published, true)
    assert.equal(current.definition.selfService.allowAi, false)
    assert.equal(current.definition.selfService.riskLevel, 1)
    assert.deepEqual(current.definition.selfService.presentation.future, {
      retained: false,
      count: 0,
    })
    assert.deepEqual(current.definition.action.rollout.stages, [
      { scope, opensAt: 0, minimumVerifiedPercent: null },
      { scope: laterScope, opensAt, minimumVerifiedPercent: 85 },
    ])
    if (kind === 'users')
      assert.equal(current.definition.selfService.access.selectors[0].principalId, f.principal)
  }
  await run.nav(p, '/policies?policy=' + policyId, '策略与部署')
  await button('打开定位策略').click()
  await label('发布到自助目录').uncheck()
  await label('批次开放时间 2').fill(String(opensAt + 3600))
  await label('最低核实成功率（%）').fill('90')
  await label('确认范围、资源、调度与潜在影响').check()
  await run.response(p, 'POST', '/api/v1/policies/' + policyId, () =>
    button('保存策略定义').click(),
  )
  const withdrawn = await api('GET', '/api/v1/policies/' + policyId)
  assert.equal(withdrawn.definition.selfService.published, false)
  assert.equal(withdrawn.definition.selfService.allowAi, false)
  assert.equal(withdrawn.definition.selfService.riskLevel, 1)
  assert.equal(withdrawn.definition.action.rollout.stages[1].opensAt, opensAt + 3600)
  assert.equal(withdrawn.definition.action.rollout.stages[1].minimumVerifiedPercent, 90)
  checks.push(
    'real-software-self-service-three-access-modes-publication-withdrawal-preserves-metadata-and-explicit-risk',
    'real-software-rollout-exact-scopes-time-and-success-gate',
  )

  await run.nav(p, '/software', '软件目录')
  await tab('组织软件')
  await admission(direct, 'withdraw')
  assert.equal(
    (
      await p.request.get(origin + contentPath(direct) + '&artifact=' + escaped(directReference))
    ).status(),
    403,
  )
  checks.push(
    'direct-without-native-target-publication-independent-admission-and-withdrawal-revokes-download',
  )

  run.step('resource-script-authoring-content-and-original-source')
  const scriptId = 'react-script-' + randomUUID(),
    sourceText = 'Write-Output 0\n'
  await run.nav(p, '/resources', '资源库')
  await tab('新建资源')
  await label('资源标识').fill(scriptId)
  await run.response(p, 'POST', resourcePath(scriptId), () => button('创建资源').click())
  await tab('资源目录')
  await label('精确资源标识').fill(scriptId)
  await run.response(p, 'GET', resourcePath(scriptId), () => button('读取精确资源').click())
  await label('新资源固定版本').fill('author-v1')
  await button('添加变体').click()
  await label('变体键').fill('main')
  await label('作者材料引用').fill('script/source.ps1')
  await label('新脚本原文').fill(sourceText)
  await button('准备完整资源版本').click()
  await button('声明此完整固定版本').waitFor()
  await run.response(p, 'POST', resourcePath(scriptId), () => button('声明此完整固定版本').click())
  async function commitPreparedScript(version) {
    await button('校验原材料长度与摘要').click()
    const beginning = p.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        new URL(r.url()).pathname.startsWith(resourcePath(scriptId) + '/uploads/') &&
        !new URL(r.url()).pathname.endsWith('/complete'),
    )
    await button('开始原上传').click()
    const begun = await beginning
    assert.equal(begun.status(), 200)
    const upload = (await begun.json()).id,
      path = resourcePath(scriptId) + '/uploads/' + upload
    await run.response(p, 'PATCH', path, () => button('从已确认位置续传一块').click())
    await run.response(p, 'POST', path + '/complete', () => button('完成原上传').click(), 201)
    await p.getByText('原内容提交回执已确认。', { exact: true }).waitFor()
    const receipt = await api('GET', resourcePath(scriptId) + '/content/operations/' + upload)
    assert.equal(receipt.version, version)
    assert.equal(receipt.committed, true)
  }
  await commitPreparedScript('author-v1')
  await run.response(p, 'GET', resourcePath(scriptId), () => button('重新读取选定资源').click())
  const scriptReadPath = resourcePath(scriptId) + '/versions/author-v1/script'
  const scriptReading = p.waitForResponse(
    (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === scriptReadPath,
  )
  await button('读取精确原脚本供编辑').click()
  assert.ok([200, 206].includes((await scriptReading).status()))
  await p.waitForFunction(
    (expected) => document.querySelector('textarea[aria-label="新脚本原文"]')?.value === expected,
    sourceText,
  )
  await label('新资源固定版本').fill('author-v2')
  await label('新脚本原文').fill('Write-Output 1\n')
  await button('准备完整资源版本').click()
  await run.response(p, 'POST', resourcePath(scriptId), () => button('声明此完整固定版本').click())
  await commitPreparedScript('author-v2')
  const authored = await api('GET', resourcePath(scriptId))
  assert.deepEqual(authored.versions.map((value) => value.id).sort(), ['author-v1', 'author-v2'])
  assert.ok(authored.versions.every((value) => value.state === 'frozen'))
  for (const [version, text] of [
    ['author-v1', sourceText],
    ['author-v2', 'Write-Output 1\n'],
  ]) {
    const response = await p.request.get(
      origin +
        resourcePath(scriptId) +
        `/versions/${version}/script?variant=main&platform=windows&architecture=x86_64`,
      { headers: { Range: `bytes=0-${Buffer.byteLength(text) - 1}` } },
    )
    assert.ok([200, 206].includes(response.status()))
    assert.equal((await response.body()).toString(), text)
    const definition = authored.versions.find((value) => value.id === version).variants[0]
      .declaration.definition
    assert.equal(definition.profile, 'power_shell7')
    assert.equal(definition.purpose.kind, 'action')
  }
  checks.push(
    'resource-script-typed-author-prepare-declare-content-original-read-new-version-and-exact-bytes',
  )

  run.step('exact-official-blueprint-instantiation')
  await tab('Blueprints')
  const catalog = await api('GET', '/api/v1/collection-blueprints'),
    blueprint = catalog.items.find(
      (value) => value.definition.kind === 'native_collection' && value.platform === 'windows',
    )
  assert.ok(blueprint)
  const blueprintName =
      typeof blueprint.presentation.name === 'string' ? blueprint.presentation.name : blueprint.id,
    blueprintResource = 'react-blueprint-' + randomUUID()
  await run.choose(
    p,
    label('Blueprint 精确版本'),
    `${blueprintName} · ${blueprint.version} · ${blueprint.platform}`,
  )
  await label('新资源标识').fill(blueprintResource)
  const instantiatedResponse = await run.response(p, 'POST', resourcePath(blueprintResource), () =>
    button('从此精确 Blueprint 创建资源').click(),
  )
  const instantiated = await instantiatedResponse.json()
  assert.equal(instantiated.id, blueprintResource)
  assert.equal(instantiated.origin.blueprint, blueprint.id)
  assert.equal(instantiated.origin.version, blueprint.version)
  assert.ok(instantiated.versions.length > 0)
  assert.ok(instantiated.versions.every((value) => value.state === 'frozen'))
  assert.equal(instantiated.request, undefined)
  checks.push('real-blueprint-exact-origin-resource-result-and-independent-content-activation')

  run.step('software-rsql-beyond-first-page-and-version-policy-context')
  const searchName = String.raw`Acme ÉCLAIR O'Reilly \ %_ 企业应用`
  const catalogResource = await api('GET', resourcePath(resource))
  await api('POST', resourcePath(resource), {
    operationId: randomUUID(),
    expectedRevision: catalogResource.revision,
    input: {
      action: 'present',
      presentation: { ...catalogResource.presentation, name: searchName },
    },
  })
  const catalogVersion = await api('GET', resourcePath(resource))
  if (catalogVersion.activeVersion !== 'resource-v1')
    await api('POST', resourcePath(resource), {
      operationId: randomUUID(),
      expectedRevision: catalogVersion.revision,
      input: { action: 'activate', version: 'resource-v1' },
    })
  for (let index = 0; index < 21; index++)
    await api('POST', resourcePath('aa-catalog-' + String(index).padStart(2, '0')), {
      operationId: randomUUID(),
      expectedRevision: 0,
      input: { action: 'create', kind: 'software' },
    })
  const firstCatalog = await api('GET', '/api/v1/resources?filter=kind%3D%3Dsoftware&limit=20')
  assert.equal(
    firstCatalog.items.some((row) => row.id === resource),
    false,
  )
  assert.ok(firstCatalog.nextCursor)
  await run.nav(p, '/software', '软件目录')
  await tab('组织软件')
  const continued = p.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/api/v1/resources' && url.searchParams.has('cursor')
  })
  await button('下一页').click()
  const secondPage = await continued
  assert.equal(secondPage.status(), 200)
  assert.ok((await secondPage.json()).items.length > 0)
  const expired = new URL(p.url())
  assert.ok(expired.searchParams.get('cursor'))
  const disjunction = `id=='${resource}',kind=='script'`
  expired.searchParams.set('filter', disjunction)
  await run.response(p, 'GET', '/api/v1/resources', () => p.goto(expired.href), 409)
  const restarted = await run.response(p, 'GET', '/api/v1/resources', () =>
    button('保留条件重新开始').click(),
  )
  assert.deepEqual(
    (await restarted.json()).items.map((row) => row.id),
    [resource],
  )
  assert.equal(new URL(p.url()).searchParams.get('filter'), disjunction)
  assert.equal(new URL(p.url()).searchParams.has('cursor'), false)
  await run.response(p, 'GET', '/api/v1/resources', () => button('清除条件').click())
  const detailRequests = []
  const captureDetails = (request) => {
    if (
      request.method() === 'GET' &&
      new URL(request.url()).pathname.startsWith('/api/v1/resources/')
    )
      detailRequests.push(new URL(request.url()).pathname)
  }
  p.on('request', captureDetails)
  await label('软件名称').fill(String.raw`éclair O'Reilly \ %_`)
  await label('分类').fill('业务工具')
  await run.choose(p, label('激活状态'), '有激活版本')
  const softwareDirectory = await run.response(p, 'GET', '/api/v1/resources', () =>
    button('搜索软件').click(),
  )
  const softwareRows = (await softwareDirectory.json()).items
  assert.deepEqual(
    softwareRows.map((row) => row.id),
    [resource],
  )
  assert.equal(detailRequests.length, 0)
  p.off('request', captureDetails)
  await button('查看版本与材料').click()
  await p.getByRole('link', { name: '从此版本新建分配', exact: true }).waitFor()
  await p.getByRole('link', { name: '从此版本新建分配', exact: true }).click()
  await p
    .getByText(resource + ' @ resource-v1', { exact: true })
    .first()
    .waitFor()
  const draftReturn = p.getByRole('dialog').getByRole('link', { name: '返回来源', exact: true })
  const sourceUrl = new URL(await draftReturn.getAttribute('href'), origin)
  assert.equal(sourceUrl.pathname, '/software')
  assert.equal(sourceUrl.searchParams.get('resource'), resource)
  assert.equal(sourceUrl.searchParams.get('version'), 'resource-v1')
  assert.ok(sourceUrl.searchParams.get('variant'))
  await draftReturn.click()
  await p.waitForURL(sourceUrl.href)
  await p.getByRole('link', { name: '查看此版本的分配', exact: true }).waitFor()
  await button('清除条件').click()
  await p.locator('.resource-toolbar summary').click()
  await label('服务端筛选').fill(`id=='${direct}'`)
  await run.response(p, 'GET', '/api/v1/resources', () => button('应用').click())
  await button('查看版本与材料').click()
  await p.getByRole('link', { name: '查看此版本的分配', exact: true }).click()
  await p.getByRole('button', { name: '查看策略 ' + policyId, exact: true }).waitFor()
  await p.getByRole('link', { name: '返回来源', exact: true }).click()
  await button('清除条件').click()
  await p.waitForFunction(() => document.querySelectorAll('.software-card').length === 20)
  assert.equal(Math.round((await p.locator('aside.sidebar').boundingBox()).width), 218)
  assert.equal(Math.round((await p.locator('header.topbar').boundingBox()).height), 58)
  checks.push('real-resource-rsql-cross-page-and-exact-policy-navigation')

  run.step('snapshot-lossless-unknown-receipt-and-independent-resource-draft')
  await tab('JSON 来源快照')
  const snapshot = 'browser-snapshot-' + randomUUID(),
    snapshotPath = '/api/v1/software/source-snapshots/' + snapshot,
    json = String.raw`[{"id":"fixture.package","name":"Editor \u4e2d","version":"7.1","number":9007199254740993,"ratio":0.123456789123456789},{"id":"fixture.package","version":"7.2"}]`
  await label('新来源标识').fill(snapshot)
  await label('导入 JSON 原文').fill(json)
  await p.getByText('可选 JSON Pointer', { exact: true }).click()
  await label('packageId JSON Pointer').fill('/id')
  await label('name JSON Pointer').fill('/name')
  await label('version JSON Pointer').fill('/version')
  const lostSnapshot = await loseFirst('**' + snapshotPath, 200)
  await button('导入新快照').click()
  await waitUntil(() => lostSnapshot.statuses.length === 1)
  await button('查询原回执').click()
  await p.getByRole('status').filter({ hasText: '原操作已确认' }).waitFor()
  await lostSnapshot.stop()
  await button(snapshot).click()
  await button('读取文档原文').click()
  await p.waitForFunction(
    (expected) => document.querySelector('textarea[aria-label="文档原文"]')?.value === expected,
    json,
  )
  const digest = createHash('sha256').update(json).digest('hex')
  await p.getByText(digest, { exact: true }).waitFor()
  await p
    .getByRole('button', { name: /^读取记录 / })
    .first()
    .click()
  await button('用于软件草稿').click()
  await label('软件名称').fill('ÉCLAIR')
  await button('搜索软件').click()
  await button(searchName).click()
  await button('复制所选记录字段').click()
  const version = await label('实际软件版本').inputValue()
  assert.ok(['7.1', '7.2'].includes(version))
  await label('导入 JSON 原文').fill('{"id":"replaced"}')
  await run.response(p, 'POST', snapshotPath, () => button('完整替换快照').click())
  assert.equal(await label('实际软件版本').inputValue(), version)
  const privateSource = 'browser-snapshot-private',
    source = await api('POST', '/api/v1/software/sources/' + privateSource + '/revisions/1', {
      operationId: randomUUID(),
      expectedRevision: 0,
      input: {
        action: 'register',
        definition: { id: privateSource, revision: '1', protocol: { kind: 'private' } },
      },
    })
  await label('软件来源标识').fill(privateSource)
  await label('软件来源精确版本').fill('1')
  await label('软件来源快照 SHA-256').fill(Buffer.from(source.snapshot.sha256).toString('hex'))
  await run.choose(p, label('来源证据类型'), 'private')
  await run.choose(p, label('导出类型'), 'disabled')
  await label('新资源固定版本').fill('snapshot-copy')
  await button('准备完整资源版本').click()
  await run.response(p, 'POST', resourcePath(resource), () => button('声明此完整固定版本').click())
  const savedSnapshot = await api('GET', resourcePath(resource))
  assert.equal(
    savedSnapshot.versions.find((row) => row.id === 'snapshot-copy').variants[0].declaration
      .definition.version,
    version,
  )
  checks.push(
    'real-json-snapshot-lossless-original-receipt-replacement-and-independent-resource-version',
  )

  run.step('software-responsive-layout')
  await tab('组织软件')
  await p.waitForFunction(() => document.querySelectorAll('.software-card').length === 20)
  const columns = () =>
    p
      .locator('.software-grid')
      .evaluate((node) => getComputedStyle(node).gridTemplateColumns.trim().split(/\s+/).length)
  assert.equal(await columns(), 3)
  const screenshots = mkdtempSync(join(tmpdir(), 'rss-react-software-'))
  await p.screenshot({
    path: join(screenshots, 'software-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await p.setViewportSize({ width: 900, height: 960 })
  assert.equal(await columns(), 2)
  await p.screenshot({
    path: join(screenshots, 'software-tablet.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await p.setViewportSize({ width: 390, height: 844 })
  assert.equal(await columns(), 1)
  await p
    .waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, undefined, {
      timeout: 5000,
    })
    .catch(() => undefined)
  const overflow = await p.evaluate(() => {
    if (document.documentElement.scrollWidth <= innerWidth) return null
    return {
      width: document.documentElement.scrollWidth,
      elements: [...document.body.querySelectorAll('*')]
        .filter((node) => {
          if (node.getBoundingClientRect().right <= innerWidth + 1) return false
          for (let parent = node.parentElement; parent; parent = parent.parentElement)
            if (
              parent.getBoundingClientRect().right <= innerWidth + 1 &&
              getComputedStyle(parent).overflowX !== 'visible'
            )
              return false
          return true
        })
        .map((node) => ({
          tag: node.tagName + '.' + [...node.classList].join('.'),
          parent: [...(node.parentElement?.classList ?? [])].join('.'),
          right: Math.round(node.getBoundingClientRect().right),
        }))
        .sort((a, b) => b.right - a.right)
        .slice(0, 6),
    }
  })
  if (overflow)
    console.error(JSON.stringify({ journey: 'react-software', layoutOverflow: overflow }))
  assert.equal(overflow, null)
  await p.screenshot({
    path: join(screenshots, 'software-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await p.setViewportSize({ width: 1440, height: 960 })
  await button('切换亮暗主题').click()
  await p.screenshot({
    path: join(screenshots, 'software-dark.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await button('English').press('Enter')
  await p.getByRole('heading', { name: 'Software catalog', exact: true }).waitFor()
  await p.getByRole('tab', { name: 'JSON source snapshots', exact: true }).press('Enter')
  await p.getByRole('button', { name: 'Refresh sources', exact: true }).waitFor()
  console.log(JSON.stringify({ journey: 'react-software', screenshots }))
  checks.push('canonical-resource-software-card-desktop-mobile-dark-design')
  checks.push('software-catalog-bilingual-keyboard')
} catch (error) {
  failure = error
  if (diagnosticPage)
    console.error(
      JSON.stringify({
        journey: 'react-software',
        failureLocation: error.stack?.match(/react-software-browser\.mjs:(\d+):(\d+)/)?.[0],
        route: new URL(diagnosticPage.url()).pathname,
        locatorKeys: [...new URL(diagnosticPage.url()).searchParams.keys()],
      }),
    )
} finally {
  await run.finish(failure)
}
