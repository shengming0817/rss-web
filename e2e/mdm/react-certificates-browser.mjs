// Actual React pages over the existing isolated enrollment/PKI host. Never capture private material.
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { realBrowser } from './react-mdm-browser.mjs'
import { runPkiCollector } from './pki-browser.mjs'
const run = await realBrowser('MDM_ENROLLMENT_BROWSER_FIXTURE', 'react-certificates'),
  privateRoot = mkdtempSync(join(tmpdir(), 'rss-certificate-private-'))
let failure,
  activeCollector,
  interrupted = false,
  diagnosticPage
const stop = () => {
  interrupted = true
  activeCollector?.()
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
try {
  const { fixture: f, origin, checks } = run,
    p = await run.page(),
    label = (name) => p.getByLabel(name, { exact: true }).filter({ visible: true }),
    button = (name) => p.getByRole('button', { name, exact: true }).filter({ visible: true }),
    tab = (name) => p.getByRole('tab', { name, exact: true }).click(),
    master = 'Disposable-archive-master-2026!'
  diagnosticPage = p
  let nextApi = 0,
    interceptionFailure = false
  async function api(method, path, data, expected = 200, operation) {
    const delay = Math.max(0, nextApi - Date.now())
    nextApi = Date.now() + delay + 220
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
    let headers
    if (method !== 'GET') {
      const response = await p.request.get(origin + `/api/v1/identity/tenants/${f.tenant}/session`)
      assert.equal(response.status(), 200)
      headers = {
        Origin: origin,
        'X-Identity-Request': '1',
        'X-CSRF-Token': (await response.json()).csrfToken,
        ...(operation ? { 'Idempotency-Key': operation } : {}),
      }
    }
    const response = await p.request.fetch(origin + path, {
      method,
      ...(headers ? { headers } : {}),
      ...(data === undefined ? {} : { data }),
    })
    assert.equal(response.status(), expected, `${method} ${path.split('?')[0]}`)
    return expected === 204 ? undefined : response.json()
  }
  async function finishCommand() {
    await button('结束本次操作并读取当前状态').click()
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
  await run.login(p)
  await run.nav(p, '/certificates', '证书与设备 PKI')
  run.step('archive-initialize-and-unlock')
  const initialVault = await api('GET', '/api/v1/certificate-archive/vault')
  assert.equal(initialVault.initialized, false)
  await p.getByText('主密码管理', { exact: true }).click()
  await label('设置主密码（至少 12 字符）').fill(master)
  await run.response(p, 'POST', '/api/v1/certificate-archive/vault/initialize', () =>
    button('初始化档案').click(),
  )
  assert.equal(await label('设置主密码（至少 12 字符）').inputValue(), '')
  await finishCommand()
  await p.getByText('解锁与锁定档案', { exact: true }).click()
  await label('档案主密码').fill(master)
  await run.response(p, 'POST', '/api/v1/certificate-archive/vault/unlock', () =>
    button('解锁档案').click(),
  )
  assert.equal(await label('档案主密码').inputValue(), '')
  checks.push('real-archive-master-initialize-unlock-and-immediate-password-clear')

  run.step('archive-real-ca-generation-and-metadata')
  await button('新建档案材料').click()
  const caName = 'React archive CA ' + randomUUID()
  await label('证书名称').fill(caName)
  await label('通用名称 CN').fill('Disposable tenant CA')
  const generated = await (
      await run.response(p, 'POST', '/api/v1/certificate-archive/generate', () =>
        button('提交生成材料').click(),
      )
    ).json(),
    ca = generated.entryId
  assert.equal(generated.action, 'certificate_archive_generate')
  assert.equal(generated.version, 1)
  await finishCommand()
  await run.response(p, 'GET', `/api/v1/certificate-archive/entries/${ca}`, () =>
    button(caName).click(),
  )
  const original = await api('GET', `/api/v1/certificate-archive/entries/${ca}`)
  await api(
    'PUT',
    `/api/v1/certificate-archive/entries/${ca}/metadata`,
    {
      expectedRevision: original.revision,
      metadata: { ...original.latest.metadata, vendor: { nested: { retained: false, count: 0 } } },
    },
    200,
    randomUUID(),
  )
  await run.response(p, 'GET', `/api/v1/certificate-archive/entries/${ca}`, () =>
    button('重新读取详情版本').click(),
  )
  await button('编辑档案信息').click()
  const metadataForm = p
    .locator('form')
    .filter({ has: p.getByRole('button', { name: '保存为新材料版本', exact: true }) })
  await metadataForm.getByLabel('证书名称', { exact: true }).fill('Edited ' + caName)
  const metadata = await (
    await run.response(p, 'PUT', `/api/v1/certificate-archive/entries/${ca}/metadata`, () =>
      button('保存为新材料版本').click(),
    )
  ).json()
  assert.equal(metadata.version, 3)
  const edited = await api('GET', `/api/v1/certificate-archive/entries/${ca}`)
  assert.deepEqual(edited.latest.metadata.vendor, { nested: { retained: false, count: 0 } })
  await finishCommand()
  checks.push('real-ca-private-key-generation-independent-detail-cas-and-nested-metadata-retention')

  run.step('archive-exact-export-unknown-receipt-and-reexport')
  await p.getByRole('button', { name: '选择此精确版本导出', exact: true }).last().click()
  const exportForm = p
    .locator('form')
    .filter({ has: p.getByRole('button', { name: '请求导出此版本', exact: true }) })
  await exportForm.getByLabel('精确材料版本', { exact: true }).fill('1')
  let lostExport = false,
    exportOperation
  await p.route('**/api/v1/certificate-archive/export', async (route) => {
    try {
      if (!lostExport) {
        lostExport = true
        exportOperation = route.request().headers()['idempotency-key']
        const actual = await route.fetch()
        assert.equal(actual.status(), 200)
        await route.abort('failed')
      } else await route.continue()
    } catch {
      interceptionFailure = true
      await route.abort('failed').catch(() => {})
    }
  })
  await button('请求导出此版本').click()
  await p
    .getByText('结果未确认。请查询原操作；没有查询端点时，仅显式重提原请求。', { exact: true })
    .waitFor()
  assert.equal(await p.locator('a[download]').count(), 0)
  await run.response(p, 'GET', `/api/v1/certificate-archive/operations/${exportOperation}`, () =>
    button('读取原导出回执').click(),
  )
  assert.equal(await p.locator('a[download]').count(), 0)
  const exportedResponse = await run.response(p, 'POST', '/api/v1/certificate-archive/export', () =>
    button('使用原操作显式重新导出').click(),
  )
  assert.equal(exportedResponse.request().headers()['idempotency-key'], exportOperation)
  const exported = await exportedResponse.json()
  assert.equal(exported.entryId, ca)
  assert.equal(exported.version, 1)
  await p.locator('a[download]').first().waitFor()
  const caVersion = (
      await api('GET', `/api/v1/certificate-archive/entries/${ca}/versions`)
    ).items.find((value) => value.version === 1),
    materials = []
  for (const file of exported.files) {
    const fact = caVersion.facts.find((fact) => fact.name === file.name)
    if (!fact || !['certificate', 'private_key'].includes(fact.format)) continue
    assert.equal(basename(file.name), file.name)
    const path = join(privateRoot, file.name)
    writeFileSync(path, Buffer.from(file.data, 'base64'), { mode: 0o600 })
    materials.push({ path, format: fact.format })
  }
  assert.ok(materials.some((file) => file.format === 'certificate'))
  assert.ok(materials.some((file) => file.format === 'private_key'))
  await button('关闭并清除导出内容').click()
  assert.equal(await p.locator('a[download]').count(), 0)
  await button('结束本次导出').click()
  await p.unroute('**/api/v1/certificate-archive/export')
  checks.push(
    'exact-private-export-response-loss-original-receipt-not-delivery-and-same-id-reexport',
  )

  run.step('archive-import-response-loss-and-secret-reselection')
  await button('新建档案材料').click()
  await tab('导入材料')
  await label('证书名称').fill('Imported ' + caName)
  for (let index = 0; index < materials.length; index++) {
    if (index) await button('添加材料文件').click()
    await label(`选择原始文件 ${index + 1}`).setInputFiles(materials[index].path)
    await run.choose(
      p,
      p
        .getByRole('combobox', { name: `文件格式 ${index + 1}`, exact: true })
        .filter({ visible: true }),
      materials[index].format,
    )
  }
  let importOperation,
    lostImport = false,
    importedId
  await p.route('**/api/v1/certificate-archive/import', async (route) => {
    try {
      if (!lostImport) {
        lostImport = true
        importOperation = route.request().headers()['idempotency-key']
        const actual = await route.fetch()
        assert.equal(actual.status(), 200)
        importedId = (await actual.json()).entryId
        await route.abort('failed')
      } else await route.continue()
    } catch {
      interceptionFailure = true
      await route.abort('failed').catch(() => {})
    }
  })
  await button('提交导入材料').click()
  await p
    .getByText('结果未确认。请查询原操作；没有查询端点时，仅显式重提原请求。', { exact: true })
    .waitFor()
  assert.equal(await label('选择原始文件 1').inputValue(), '')
  await run.response(p, 'GET', `/api/v1/certificate-archive/operations/${importOperation}`, () =>
    button('读取原操作回执').click(),
  )
  for (let index = 0; index < materials.length; index++)
    await label(`选择原始文件 ${index + 1}`).setInputFiles(materials[index].path)
  const replay = await run.response(p, 'POST', '/api/v1/certificate-archive/import', () =>
    button('重新选择原文件并显式重提').click(),
  )
  assert.equal(replay.request().headers()['idempotency-key'], importOperation)
  assert.equal((await replay.json()).version, 1)
  await p.unroute('**/api/v1/certificate-archive/import')
  await finishCommand()
  const imported = await api('GET', `/api/v1/certificate-archive/entries/${importedId}`)
  assert.equal(imported.revision, 1)
  assert.ok(imported.latest.facts.some((fact) => fact.containsPrivateKey))
  checks.push(
    'real-certificate-private-key-import-exact-unknown-receipt-reselect-and-single-version',
  )

  run.step('archive-independent-export-permission')
  await button('按精确版本导出').click()
  await changeAuthority(
    f.rule.grants.filter((grant) => grant.operation !== 'certificate_archive_export'),
  )
  await button('重新读取证书管理权限').click()
  assert.equal(await button('请求导出此版本').count(), 0)
  await api(
    'POST',
    '/api/v1/certificate-archive/export',
    { entryId: ca, version: 1 },
    403,
    randomUUID(),
  )
  await changeAuthority(f.rule.grants)
  await button('重新读取证书管理权限').click()
  checks.push('archive-export-authority-independent-of-read-write-and-unlock')

  run.step('archive-settings-lifecycle-cas-and-lock')
  await button('档案设置').click()
  const settingsBefore = await api('GET', '/api/v1/certificate-archive/settings')
  await label('到期提醒天数').fill('45')
  await run.response(p, 'PUT', '/api/v1/certificate-archive/settings', () =>
    button('保存档案设置').click(),
  )
  await finishCommand()
  const settingsAfter = await api('GET', '/api/v1/certificate-archive/settings')
  assert.equal(settingsAfter.value.reminderDays, 45)
  await api(
    'PUT',
    '/api/v1/certificate-archive/settings',
    { expectedRevision: settingsBefore.revision, value: settingsBefore.value },
    409,
    randomUUID(),
  )
  await run.response(p, 'GET', `/api/v1/certificate-archive/entries/${ca}`, () =>
    button('Edited ' + caName).click(),
  )
  await button('编辑档案信息').click()
  const managedBefore = await api('GET', `/api/v1/certificate-archive/entries/${ca}`)
  await label('推荐的精确材料版本（可清空）').fill('1')
  await run.response(p, 'PUT', `/api/v1/certificate-archive/entries/${ca}`, () =>
    button('保存生命周期与推荐版本').click(),
  )
  await finishCommand()
  const managedAfter = await api('GET', `/api/v1/certificate-archive/entries/${ca}`)
  assert.equal(managedAfter.recommendedVersion, 1)
  assert.equal(managedAfter.latest.version, managedBefore.latest.version)
  await api(
    'PUT',
    `/api/v1/certificate-archive/entries/${ca}`,
    { expectedRevision: managedBefore.revision, retired: true, recommendedVersion: null },
    409,
    randomUUID(),
  )
  await run.response(
    p,
    'POST',
    '/api/v1/certificate-archive/vault/lock',
    () => button('清除本地秘密并锁定档案').click(),
    200,
  )
  await api(
    'POST',
    '/api/v1/certificate-archive/export',
    { entryId: ca, version: 1 },
    423,
    randomUUID(),
  )
  assert.equal(await p.locator('a[download]').count(), 0)
  checks.push(
    'real-settings-and-lifecycle-cas-recommendation-does-not-create-material-and-locked-export-denied',
  )

  run.step('pki-prepare-ack-and-separate-loading')
  await tab('设备 PKI')
  await tab('Agent')
  const trusted = await api('GET', '/api/v1/pki/agent/trust'),
    next = f.pki.candidateTrust.issuers[0],
    preparation = p.locator('form').filter({ has: button('提交准备材料') })
  for (const [name, value] of [
    ['新 CA 证书（PEM / DER Base64）', next.certificate],
    ['根 CA 证书', next.root],
    ['新 CA 撤销列表', next.crl],
    ['根 CA 撤销列表', next.root_crl],
    ['已配置的签发 Provider', next.provisioner],
    ['Provider 公钥标识', next.kid],
  ])
    await preparation.getByLabel(name, { exact: true }).fill(value)
  const prepared = await (
    await run.response(p, 'POST', '/api/v1/pki/rotations', () => button('提交准备材料').click())
  ).json()
  assert.equal(prepared.state, 'distributing')
  assert.equal(prepared.revision, trusted.revision + 1)
  await button('结束本次操作并重新读取').click()
  await label('原轮换 UUID').fill(prepared.operation)
  await run.response(
    p,
    'POST',
    '/api/v1/pki/agent/rotations',
    () => button('提交阶段转换').click(),
    409,
  )
  const ack = await runPkiCollector(process.env.MDM_ENROLLMENT_BROWSER_FIXTURE, {
    onChild: (_child, terminate) => {
      activeCollector = terminate
      if (interrupted) terminate()
    },
    onRelease: () => {
      activeCollector = undefined
    },
    interrupted: () => interrupted,
  })
  assert.equal(ack.status, 0)
  const activated = await (
    await run.response(p, 'POST', '/api/v1/pki/agent/rotations', () =>
      button('显式重提原请求').click(),
    )
  ).json()
  assert.equal(activated.operation, prepared.operation)
  assert.equal(activated.state, 'activated')
  await button('结束本次操作并重新读取').click()
  await run.response(p, 'POST', '/api/v1/pki/crls', () => button('发布这些撤销列表').click(), 204)
  await button('结束本次操作并重新读取').click()
  checks.push('real-ca-preparation-missing-ack-conflict-mtls-ack-activation-and-crl-publication')

  run.step('agent-original-issuance-and-registration-recovery')
  const device = f.collector.runtime.deviceId
  await p.goto(origin + `/devices/endpoint/${encodeURIComponent(device)}`)
  await tab('设备安全')
  await tab('设备 PKI 恢复与观察')
  await button('重新读取材料观察').click()
  const candidate = f.pki.recoveryCandidate
  await label('原签发 UUID').fill(candidate.issuanceId)
  await label('原 CA 已签证书链').fill(candidate.certificateChain.join('\n'))
  const recovered = await (
    await run.response(p, 'POST', `/api/v1/agent-issuances/${candidate.issuanceId}/recover`, () =>
      button('关联原签发结果').click(),
    )
  ).json()
  assert.equal(recovered.issuanceId, candidate.issuanceId)
  assert.equal(recovered.operationId, candidate.operationId)
  await button('读取原恢复回执').click()
  await button('结束本次候选恢复').click()
  const grant = JSON.parse(readFileSync(f.pki.recoveryInputFile, 'utf8'))
  await run.choose(p, label('原请求平台'), grant.platform === 'macos' ? 'macOS' : 'Windows')
  await label('原设备公钥 CSR（PEM / DER Base64）').fill(grant.csr)
  await label('恢复秘密').fill(grant.secret)
  await run.response(
    p,
    'POST',
    `/api/v1/devices/${f.collector.runtime.deviceId}/registration/recovery`,
    () => button('提交注册恢复').click(),
  )
  assert.equal(await label('重新输入同一恢复秘密').inputValue(), '')
  await button('结束本次注册恢复').click()
  checks.push(
    'real-agent-original-candidate-operation-and-registration-recovery-without-activation-claim',
  )

  run.step('certificate-public-design-screenshots')
  await run.nav(p, '/certificates', '证书与设备 PKI')
  await button('Edited ' + caName).waitFor()
  await p.waitForFunction(() => !document.querySelector('.ant-spin-spinning'))
  assert.equal(Math.round((await p.locator('aside.sidebar').boundingBox()).width), 218)
  assert.equal(Math.round((await p.locator('header.topbar').boundingBox()).height), 58)
  const screenshots = mkdtempSync(join(tmpdir(), 'rss-react-certificates-'))
  for (const [name, width, height] of [
    ['desktop', 1440, 960],
    ['tablet', 900, 960],
    ['mobile', 390, 844],
  ]) {
    await p.setViewportSize({ width, height })
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await p.screenshot({
      path: join(screenshots, `certificates-${name}.png`),
      fullPage: true,
      animations: 'disabled',
    })
  }
  await p.setViewportSize({ width: 1440, height: 960 })
  await button('新建档案材料').click()
  await label('证书名称').waitFor()
  assert.equal(await label('证书名称').inputValue(), '')
  await p.screenshot({
    path: join(screenshots, 'certificates-create.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await button('返回档案目录').click()
  await button('切换亮暗主题').click()
  await p.screenshot({
    path: join(screenshots, 'certificates-dark.png'),
    fullPage: true,
    animations: 'disabled',
  })
  assert.equal(interceptionFailure, false)
  console.log(JSON.stringify({ journey: 'react-certificates', screenshots }))
  checks.push('certificate-directory-desktop-tablet-mobile-dark-without-private-content')
} catch (error) {
  failure = error
  console.error(
    JSON.stringify({
      journey: 'react-certificates',
      failureClassification: /strict mode violation/.test(error.message)
        ? 'strict-selector'
        : /not an <input>|not an input|not editable/.test(error.message)
          ? 'control-kind'
          : /Timeout/.test(error.name)
            ? 'timeout'
            : error.name,
      passwordFieldLabels: diagnosticPage
        ? (
            await diagnosticPage
              .locator('label')
              .allTextContents()
              .catch(() => [])
          ).filter((value) => /密码|主密码操作/.test(value))
        : [],
      failureLocation: error.stack?.match(/react-certificates-browser\.mjs:(\d+):(\d+)/)?.[0],
    }),
  )
} finally {
  activeCollector?.()
  try {
    rmSync(privateRoot, { recursive: true, force: true })
  } catch {
    failure ??= new Error('private-material-cleanup-unconfirmed')
  }
  process.removeListener('SIGINT', stop)
  process.removeListener('SIGTERM', stop)
  await run.finish(failure)
}
