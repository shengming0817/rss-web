import { realBrowser } from './react-mdm-browser.mjs'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const run = await realBrowser('MDM_ENROLLMENT_BROWSER_FIXTURE', 'react-enrollment-connections')
let failure
try {
  const { origin, fixture: f, checks } = run,
    anonymous = await run.page()
  await run.nav(anonymous, '/downloads/agent', 'Agent 安装包')
  assert.equal(new URL(anonymous.url()).pathname, '/downloads/agent')
  const catalogResponse = await anonymous
    .context()
    .request.get(origin + '/api/v1/agent/enroll/packages')
  assert.equal(catalogResponse.status(), 200)
  const packages = await catalogResponse.json()
  assert.ok(packages.length > 0)
  assert.ok(packages.some((item) => item.releaseId === f.installerRelease))
  for (const item of packages) {
    const link = anonymous.locator(`a[download="${item.filename}"]`)
    await link.waitFor()
    const downloaded = anonymous.waitForEvent('download')
    await link.click()
    const file = await downloaded
    assert.equal(file.suggestedFilename(), item.filename)
    assert.equal(await file.failure(), null)
    let actual = Buffer.alloc(0)
    for await (const chunk of await file.createReadStream()) actual = Buffer.concat([actual, chunk])
    assert.equal(actual.length, item.length)
    assert.deepEqual([...createHash('sha256').update(actual).digest()], item.installerSha256)
    await file.delete()
  }
  checks.push('anonymous-fixed-installer-catalog-and-present-package-bytes')
  const admin = await run.page()
  await run.login(admin)
  const api = async (method, path, data) => {
    await new Promise((done) => setTimeout(done, 200))
    let headers
    if (method !== 'GET') {
      const session = await admin
        .context()
        .request.get(origin + `/api/v1/identity/tenants/${f.tenant}/session`)
      assert.equal(session.status(), 200)
      headers = {
        Origin: origin,
        'X-Identity-Request': '1',
        'X-CSRF-Token': (await session.json()).csrfToken,
      }
    }
    let body = data
    if (data?.operationId) {
      const { operationId, ...values } = data
      headers['Idempotency-Key'] = operationId
      body = values
    }
    const response = await admin
      .context()
      .request.fetch(origin + path, { method, headers, data: body })
    run.step(`fixture-${method}:${path}:${response.status()}`)
    assert.equal(response.status(), 200)
    return response.json()
  }
  await run.nav(admin, '/enroll', '设备注册')
  await admin.getByRole('button', { name: '准备一次性注册密码', exact: true }).click()
  await admin.getByLabel('本次原生注册密码', { exact: true }).waitFor()
  await admin.getByRole('tab', { name: '管理员安装配置', exact: true }).click()
  await admin.getByRole('tab', { name: '注册我的设备', exact: true }).click()
  assert.equal(await admin.getByLabel('本次原生注册密码', { exact: true }).count(), 0)
  checks.push('inactive-tab-clears-native-secret-without-unmounting-operation-state')
  await admin.getByRole('tab', { name: '通道与配额', exact: true }).click()
  await admin.getByRole('tab', { name: '默认配额', exact: true }).click()
  await admin.getByLabel('Windows MDM', { exact: true }).fill('0')
  const quotaPath = '/api/v1/registration-quotas/defaults'
  await run.response(admin, 'PUT', quotaPath, () =>
    admin.getByRole('button', { name: '保存注册配额', exact: true }).click(),
  )
  checks.push('default-quota-observed-version-edit-through-react')
  await admin.getByRole('tab', { name: 'Apple 组织接入', exact: true }).click()
  await admin.getByRole('button', { name: '创建 Apple 组织绑定', exact: true }).click()
  await admin.getByLabel('组织域名', { exact: true }).fill('fixture.example.test')
  await admin.getByLabel('Apple 服务器 UUID', { exact: true }).fill(randomUUID())
  await admin.getByLabel('受管账户签名密钥别名', { exact: true }).fill('   ')
  const organizationId = (await admin.locator('section.device-editor h2').textContent()).trim(),
    accountOrganizationPath = `/api/v1/apple/organizations/${organizationId}/account-enrollment`,
    organizationWrites = run.count(admin, 'PUT', accountOrganizationPath)
  await admin.getByRole('button', { name: '保存 Apple 组织绑定', exact: true }).click()
  await admin.getByText('请求未完成，请检查输入、权限或当前状态。', { exact: true }).waitFor()
  assert.equal(await admin.getByLabel('受管账户签名密钥别名', { exact: true }).isDisabled(), false)
  assert.equal(run.count(admin, 'PUT', accountOrganizationPath), organizationWrites)
  await admin.getByLabel('受管账户签名密钥别名', { exact: true }).fill('correctable-input')
  checks.push('local-authoring-error-keeps-form-editable-without-unknown-http-intent')
  const employee = await run.page()
  await run.login(employee, f.reader)
  await run.nav(employee, '/enroll', '设备注册')
  assert.equal(await employee.getByRole('tab', { name: '管理员安装配置', exact: true }).count(), 0)
  async function prepareNative() {
    await employee.bringToFront()
    await employee.getByRole('button', { name: '准备一次性注册密码', exact: true }).click()
    await employee.getByRole('checkbox', { name: '已保存本次注册密码', exact: true }).check()
  }
  await prepareNative()
  const rejected = await run.response(
    employee,
    'POST',
    '/api/v1/self-enrollments',
    () => employee.getByRole('button', { name: '提交原生注册申请', exact: true }).click(),
    429,
  )
  assert.equal((await rejected.json()).code, 'registration_limit')
  await employee.getByRole('button', { name: '放弃已拒绝请求并重读', exact: true }).click()
  checks.push('quota-zero-still-reaches-formal-server-admission-rejection')
  const quota = await api('GET', quotaPath)
  await api('PUT', quotaPath, {
    operationId: randomUUID(),
    expectedRevision: quota.revision,
    limits: { ...quota.limits, windows_mdm: 50 },
  })
  await employee.getByRole('button', { name: '重新读取准入与配额', exact: true }).click()
  await prepareNative()
  const channelsPath = '/api/v1/registration-channels',
    admissionPath = channelsPath + '/windows_mdm/admission',
    channel = (await api('GET', channelsPath)).channels.find((c) => c.channel === 'windows_mdm')
  const paused = await api('PUT', admissionPath, {
    operationId: randomUUID(),
    expectedRevision: channel.revision,
    admission: 'paused',
  })
  const stale = await run.response(
    employee,
    'POST',
    '/api/v1/self-enrollments',
    () => employee.getByRole('button', { name: '提交原生注册申请', exact: true }).click(),
    409,
  )
  assert.equal((await stale.json()).code, 'enrollment_paused')
  await employee.getByRole('button', { name: '放弃已拒绝请求并重读', exact: true }).click()
  assert.equal(
    await employee.getByRole('button', { name: '准备一次性注册密码', exact: true }).isDisabled(),
    true,
  )
  const established = await api('GET', `/api/v1/devices/${f.existingDevice}/registrations`)
  assert.ok(established.items.some((r) => r.status === 'active'))
  await anonymous.reload()
  await anonymous.getByRole('heading', { name: 'Agent 安装包', exact: true }).waitFor()
  assert.equal(new URL(anonymous.url()).pathname, '/downloads/agent')
  checks.push('real-stale-admission-rejected-maintenance-and-public-downloads-continue')
  await api('PUT', admissionPath, {
    operationId: randomUUID(),
    expectedRevision: paused.revision,
    admission: 'allowed',
  })
  await employee.getByRole('button', { name: '重新读取准入与配额', exact: true }).click()
  await prepareNative()
  const enrolled = await (
    await run.response(employee, 'POST', '/api/v1/self-enrollments', () =>
      employee.getByRole('button', { name: '提交原生注册申请', exact: true }).click(),
    )
  ).json()
  await employee
    .getByText('管理尚未就绪。注册申请或配置文件下载不代表设备注册完成。', { exact: true })
    .waitFor()
  assert.match(enrolled.enrollmentId, /^[a-f0-9-]{36}$/)
  assert.equal(await employee.getByLabel('本次原生注册密码', { exact: true }).count(), 0)
  checks.push('native-instructions-and-progress-do-not-imply-device-enrollment')
  const cancellationPath = `/api/v1/enrollments/${enrolled.enrollmentId}/cancel`
  let originalCancellation, replayCancellation
  await employee.route(origin + cancellationPath, async (route) => {
    const operationId = route.request().headers()['idempotency-key']
    if (!originalCancellation) {
      originalCancellation = operationId
      const actual = await route.fetch()
      assert.equal(actual.status(), 200)
      await route.abort('failed')
    } else {
      replayCancellation = operationId
      await route.continue()
    }
  })
  await employee.getByRole('checkbox', { name: '明确继续或取消此注册申请', exact: true }).check()
  await employee.getByRole('button', { name: '取消原注册申请', exact: true }).click()
  await employee.getByRole('button', { name: '显式重提原维护请求', exact: true }).waitFor()
  assert.equal(await employee.getByLabel('注册申请标识', { exact: true }).isDisabled(), true)
  await run.response(employee, 'GET', `/api/v1/enrollments/${enrolled.enrollmentId}`, () =>
    employee.getByRole('button', { name: '读取原生注册进度', exact: true }).click(),
  )
  assert.equal(run.count(employee, 'POST', cancellationPath), 1)
  assert.equal(await employee.getByLabel('注册申请标识', { exact: true }).isDisabled(), true)
  await run.response(employee, 'POST', cancellationPath, () =>
    employee.getByRole('button', { name: '显式重提原维护请求', exact: true }).click(),
  )
  assert.equal(replayCancellation, originalCancellation)
  await employee.unroute(origin + cancellationPath)
  checks.push('unknown-native-maintenance-retains-original-request-and-fences-enrollment-selection')

  await run.nav(admin, '/enroll', '设备注册')
  await admin.getByRole('tab', { name: '管理员安装配置', exact: true }).click()
  await admin.getByRole('button', { name: '生成管理员安装配置', exact: true }).click()
  const dialog = admin.getByRole('dialog', { name: '交付管理员安装配置', exact: true })
  await dialog.getByRole('checkbox', { name: '通过受保护渠道交付此秘密 JSON', exact: true }).check()
  const configurationPath = '/api/v1/agent-configurations'
  const delivered = await run.response(admin, 'POST', configurationPath, () =>
    dialog.getByRole('button', { name: '签发并准备下载 JSON', exact: true }).click(),
  )
  const originalBytes = await delivered.body(),
    document = JSON.parse(originalBytes.toString('utf8'))
  assert.ok(document.configuration && document.secret && document.signature)
  const download = admin.waitForEvent('download')
  await dialog.getByRole('link', { name: '下载 rss-agent-enrollment.json', exact: true }).click()
  const file = await download
  let received = Buffer.alloc(0)
  for await (const chunk of await file.createReadStream())
    received = Buffer.concat([received, chunk])
  assert.equal(received.equals(originalBytes), true)
  received.fill(0)
  originalBytes.fill(0)
  document.secret = ''
  await file.delete()
  const issuedCount = run.count(admin, 'POST', configurationPath)
  await admin.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    delete document.visibilityState
  })
  await dialog
    .getByRole('link', { name: '下载 rss-agent-enrollment.json', exact: true })
    .waitFor({ state: 'hidden' })
  assert.equal(run.count(admin, 'POST', configurationPath), issuedCount)
  await dialog.locator('.ant-modal-close').click()
  checks.push('single-json-exact-bytes-secret-clears-on-hide-no-automatic-issuance')

  await admin.getByRole('button', { name: '生成管理员安装配置', exact: true }).click()
  await dialog.getByRole('checkbox', { name: '通过受保护渠道交付此秘密 JSON', exact: true }).check()
  let lostOperation
  const pattern = origin + configurationPath
  await admin.route(pattern, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    lostOperation = route.request().postDataJSON().operationId
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    await route.abort('failed')
  })
  await dialog.getByRole('button', { name: '签发并准备下载 JSON', exact: true }).click()
  await dialog.getByRole('button', { name: '查询原签发操作', exact: true }).waitFor()
  const lostCount = run.count(admin, 'POST', configurationPath)
  await run.response(admin, 'GET', `/api/v1/agent-configuration-operations/${lostOperation}`, () =>
    dialog.getByRole('button', { name: '查询原签发操作', exact: true }).click(),
  )
  await dialog
    .getByText('原配置已找到，秘密文件不能恢复。请在详情确认撤销后，再显式开始新签发。', {
      exact: true,
    })
    .waitFor()
  assert.equal(await dialog.locator('a[download]').count(), 0)
  assert.equal(run.count(admin, 'POST', configurationPath), lostCount)
  await dialog.getByRole('button', { name: '确认撤销原安装配置', exact: true }).click()
  await dialog.getByRole('button', { name: '配置已撤销，准备新签发', exact: true }).waitFor()
  await admin.unroute(pattern)
  await dialog.locator('.ant-modal-close').click()
  await admin.reload()
  await admin.getByRole('heading', { name: '设备注册', exact: true }).waitFor()
  assert.equal(run.count(admin, 'POST', configurationPath), lostCount)
  checks.push('committed-json-loss-original-metadata-only-revoke-before-new-no-refresh-reissue')

  await run.nav(admin, '/connections', '连接配置')
  await admin.getByRole('tab', { name: '存储', exact: true }).click()
  await admin.getByText('材料登记版本', { exact: true }).waitFor()
  await admin.getByText('当前有效代次', { exact: true }).waitFor()
  checks.push('storage-native-material-version-and-generation-directory')
  await admin.getByRole('tab', { name: 'Windows 推送', exact: true }).click()
  const wns = admin.getByRole('tabpanel', { name: 'Windows 推送', exact: true })
  await wns.getByText('材料登记版本', { exact: true }).waitFor()
  await wns.getByText('已应用材料版本', { exact: true }).waitFor()
  checks.push('wns-desired-and-applied-revisions-separate')
  await admin.getByRole('tab', { name: 'Apple 材料', exact: true }).click()
  await admin.getByRole('tab', { name: '配置签名', exact: true }).click()
  const material = admin.getByRole('tabpanel', { name: '配置签名', exact: true })
  const keyReceipt = await (
    await run.response(admin, 'POST', '/api/v1/apple/materials/profile/keys', () =>
      material.getByRole('button', { name: '明确提交材料操作', exact: true }).click(),
    )
  ).json()
  await material.getByLabel('原 Apple 材料操作标识', { exact: true }).fill(keyReceipt.operationId)
  await material.getByRole('button', { name: '读取原材料操作', exact: true }).click()
  await material.getByText('Apple 材料回执', { exact: true }).waitFor()
  checks.push('apple-generated-key-and-original-receipt-through-real-owner')
  await admin.getByRole('tab', { name: 'Agent 连接', exact: true }).click()
  const connectionPath = '/api/v1/agent-connections'
  await admin.getByLabel('首选 HTTPS origin', { exact: true }).fill(origin)
  await admin.getByLabel('允许的 HTTPS origins（1–8 个，每行一个）', { exact: true }).fill(origin)
  let savedOperation
  await admin.route(origin + connectionPath, async (route) => {
    if (route.request().method() !== 'PUT') return route.continue()
    savedOperation = route.request().postDataJSON().operationId
    const actual = await route.fetch()
    assert.equal(actual.status(), 200)
    await route.abort('failed')
  })
  await admin.getByRole('button', { name: '仅保存连接草稿', exact: true }).click()
  await admin.getByRole('button', { name: '查询本次原连接操作', exact: true }).waitFor()
  await run.response(admin, 'GET', '/api/v1/authorization', () =>
    admin.getByRole('button', { name: '重新读取当前入口权限', exact: true }).click(),
  )
  await admin.getByRole('button', { name: '查询本次原连接操作', exact: true }).waitFor()
  await admin.getByText(savedOperation, { exact: true }).waitFor()
  assert.equal(run.count(admin, 'PUT', connectionPath), 1)
  await run.response(admin, 'GET', `/api/v1/agent-connection-operations/${savedOperation}`, () =>
    admin.getByRole('button', { name: '查询本次原连接操作', exact: true }).click(),
  )
  await admin.getByRole('button', { name: '原连接操作已确认，读取最新版本', exact: true }).click()
  await admin.unroute(origin + connectionPath)
  checks.push('permission-refresh-retains-the-original-unknown-connection-owner-without-replay')
  const savedWrites = run.count(admin, 'POST', connectionPath + '/publish')
  await admin.getByRole('heading', { name: '网关部署观察', exact: true }).waitFor()
  const publication = await run.response(
    admin,
    'POST',
    connectionPath + '/publish',
    () => admin.getByRole('button', { name: /^明确发布已保存草稿/ }).click(),
    409,
  )
  assert.equal((await publication.json()).code, 'connection_deployment_unobserved')
  await admin.getByRole('button', { name: '放弃已拒绝请求并重读', exact: true }).click()
  await admin.getByRole('heading', { name: '网关部署观察', exact: true }).waitFor()
  assert.equal(run.count(admin, 'POST', connectionPath + '/publish'), savedWrites + 1)
  checks.push('agent-draft-real-unobserved-gateway-publication-rejection-no-automatic-replay')
  await admin.getByRole('tab', { name: '加载与启用观察', exact: true }).click()
  await admin.getByRole('button', { name: '读取当前连接运行观察', exact: true }).waitFor()
  checks.push('narrow-catalog-and-runtime-loaded-observations')
  const screenshots = mkdtempSync(join(tmpdir(), 'rss-react-enrollment-connections-'))
  for (const [path, title, name] of [
    ['/enroll', '设备注册', 'enrollment'],
    ['/connections', '连接配置', 'connections'],
  ]) {
    await run.nav(admin, path, title)
    await admin
      .getByRole('button', {
        name: name === 'enrollment' ? '准备一次性注册密码' : '读取连接状态与版本',
        exact: true,
      })
      .waitFor()
    if (name === 'enrollment') {
      await admin.getByRole('tab', { name: '管理员安装配置', exact: true }).waitFor()
    } else {
      await admin.getByText('当前有效代次', { exact: true }).waitFor()
    }
    await admin.waitForFunction(() =>
      [...document.querySelectorAll('.admin-loading')].every(
        (element) => !element.checkVisibility(),
      ),
    )
    await admin.screenshot({
      path: join(screenshots, `${name}-desktop.png`),
      fullPage: true,
      animations: 'disabled',
    })
    await admin.setViewportSize({ width: 390, height: 844 })
    await admin.screenshot({
      path: join(screenshots, `${name}-mobile.png`),
      fullPage: true,
      animations: 'disabled',
    })
    assert.equal(
      await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    )
    await admin.setViewportSize({ width: 1440, height: 960 })
    await admin.getByRole('button', { name: '切换亮暗主题', exact: true }).click()
    await admin.screenshot({
      path: join(screenshots, `${name}-dark.png`),
      fullPage: true,
      animations: 'disabled',
    })
  }
  console.log(JSON.stringify({ journey: 'react-enrollment-connections', screenshots }))
  checks.push('enrollment-and-connections-desktop-mobile-dark-without-secret-disclosure')
} catch (error) {
  failure = error
}
await run.finish(failure)
