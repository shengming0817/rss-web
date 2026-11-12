// Real HTTPS ordinary recovery and FileVault. RSS Login remains covered by the explicit HTTP mock until the MDM/DA authority seam is available.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { realBrowser } from './react-mdm-browser.mjs'
const run = await realBrowser('MDM_DEVICE_BROWSER_FIXTURE', 'react-recovery')
let failure
try {
  const { fixture: f, origin, checks } = run,
    p = await run.page(),
    label = (name) => p.getByLabel(name, { exact: true }).filter({ visible: true }),
    button = (name) => p.getByRole('button', { name, exact: true }).filter({ visible: true }),
    tab = (name) => p.getByRole('tab', { name, exact: true }).filter({ visible: true }).click(),
    base = `/api/v1/devices/${f.recovery.device}`,
    ordinaryPath = `${base}/recovery-credentials/${f.recovery.ordinary}/versions/1`
  let nextApi = 0
  async function api(method, path, data, expected = 200) {
    const delay = Math.max(0, nextApi - Date.now())
    nextApi = Date.now() + delay + 220
    if (delay) await new Promise((done) => setTimeout(done, delay))
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
    const result = await p.request.fetch(origin + path, {
      method,
      ...(headers ? { headers } : {}),
      ...(data === undefined ? {} : { data }),
    })
    if (result.status() !== expected) {
      const value = await result.json().catch(() => null),
        code = value?.code
      console.error(
        JSON.stringify({
          journey: 'react-recovery',
          method,
          area: path.split('/').slice(0, 5).join('/'),
          expected,
          actual: result.status(),
          code:
            typeof code === 'string' && /^[a-zA-Z0-9_.-]{1,80}$/.test(code) ? code : 'unclassified',
        }),
      )
    }
    assert.equal(result.status(), expected, `${method} ${path.split('?')[0]}`)
    return expected === 204 ? undefined : result.json()
  }
  async function open(device) {
    await p.goto(origin + `/devices/endpoint/${device}`)
    await button('读取最新设备事实').waitFor()
    await tab('设备安全')
    await tab('恢复凭据')
    await button('读取材料目录').waitFor()
  }
  async function exact(id) {
    if (await label('精确设备 ID').count()) await label('精确设备 ID').fill(f.recovery.device)
    await label('材料 UUID').fill(id)
    await label('精确材料版本').fill('1')
    await run.choose(p, label('正式披露类型'), '普通恢复凭据')
    await button('选择精确披露坐标').click()
    await button('披露此精确材料').waitFor()
  }
  async function secretVisible(yes) {
    await p
      .getByRole('region', { name: '恢复凭据秘密', exact: true })
      .waitFor({ state: yes ? 'visible' : 'hidden' })
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
  run.step('ordinary-disclosure-and-independent-current-permission')
  await open(f.recovery.device)
  await exact(f.recovery.ordinary)
  await run.response(p, 'GET', ordinaryPath + '/secret', () => button('披露此精确材料').click())
  await secretVisible(true)
  await button('清除秘密并取消本地等待').click()
  await secretVisible(false)
  const noRead = f.rule.grants.filter((g) => g.operation !== 'inventory_read')
  await changeAuthority(noRead)
  await run.nav(p, '/recovery-credentials', '恢复凭据披露')
  await exact(f.recovery.ordinary)
  // Exact disclosure is independently authorized; no InventoryRead preflight may be required.
  await run.response(p, 'GET', ordinaryPath + '/secret', () => button('披露此精确材料').click())
  await secretVisible(true)
  await changeAuthority(noRead.filter((g) => g.operation !== 'credentials'))
  await run.response(
    p,
    'GET',
    ordinaryPath + '/secret',
    () => button('披露此精确材料').click(),
    403,
  )
  await secretVisible(false)
  await changeAuthority(f.rule.grants)
  checks.push(
    'ordinary-real-decryption-local-clear-credentials-independent-from-inventory-and-server-revocation',
  )

  run.step('filevault-configuration-and-native-original-request')
  await open(f.recovery.mac)
  const configPath = `/api/v1/devices/${f.recovery.mac}/recovery-credentials/filevault/configuration`
  await label('已配置的接收证书标识').fill(f.recovery.recipient)
  await label('允许收集 FileVault 恢复密钥').click()
  const configured = await (
    await run.response(p, 'POST', configPath, () => button('保存 FileVault 收集授权').click())
  ).json()
  assert.equal(configured.enabled, true)
  assert.equal(configured.materialRevision, 0)
  await button('结束本次配置操作并重新读取').click()
  // A stale configuration CAS is rejected without mutating material revision.
  await api(
    'POST',
    configPath,
    {
      operationId: randomUUID(),

      expectedRevision: 0,
      enabled: false,
      recipientId: f.recovery.recipient,
    },
    409,
  )
  const collector = f.collector.runtime
  await api('POST', '/api/v1/device-associations', {
    operationId: randomUUID(),
    associationId: null,
    expectedVersion: 0,
    mdm: {
      device: f.recovery.mac,
      channel: 'mdm',
    },
    agent: {
      device: collector.deviceId,
      channel: 'agent',
    },
    evidence: 'Disposable independent macOS endpoint identity prerequisite',
  })
  // The existing Group job builds sealed planning input snapshots. Use its real
  // create/membership workflow to prepare this disposable, newly confirmed pair.
  const groupId = randomUUID()
  async function settlePlanningTask(task) {
    const deadline = Date.now() + 90000
    let state
    do {
      state = await api('GET', `/api/v1/groups/${groupId}/tasks/${task}`)
      if (state.status === 'completed' || state.status === 'failed') break
      await new Promise((done) => setTimeout(done, 350))
    } while (Date.now() < deadline)
    assert.equal(state.status, 'completed')
  }
  const definition = await api(
    'POST',
    `/api/v1/groups/${groupId}`,
    {
      operationId: randomUUID(),
      expectedRevision: 0,
      input: {
        action: 'create',
        presentation: { name: 'Recovery planning prerequisite', description: '' },
        assetContext: 'associated_device',
        criteria: {
          selector: { kind: 'device' },
          quantifier: 'one',
          criteria: { kind: 'predicate', field: 'custom.asset_tag', op: 'is_null' },
        },
      },
    },
    202,
  )
  await settlePlanningTask(definition.task)
  const recompute = await api(
    'POST',
    `/api/v1/groups/${groupId}`,
    {
      operationId: randomUUID(),
      expectedRevision: 1,
      input: { action: 'recompute' },
    },
    202,
  )
  await settlePlanningTask(recompute.task)
  await label('正式关联的另一端点 ID').fill(collector.deviceId)
  const linkPath = `/api/v1/devices/${f.recovery.mac}/recovery-credentials/filevault/link`
  async function linkResponse(trigger) {
    const waiting = p.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === linkPath,
    )
    await trigger()
    return waiting
  }
  let linkedResponse = await linkResponse(() => button('关联 FileVault 托管归属').click())
  const originalLink = linkedResponse.request().postDataJSON(),
    linkDeadline = Date.now() + 60000
  // A committed association can precede its sealed planning snapshot. Explicitly repeat
  // the same original UI request after an unavailable result; never seed that projection.
  while (linkedResponse.status() === 503 && Date.now() < linkDeadline) {
    assert.equal((await linkedResponse.json()).code, 'service_unavailable')
    await new Promise((done) => setTimeout(done, 500))
    linkedResponse = await linkResponse(() => button('显式重提原 FileVault 配置操作').click())
    assert.deepEqual(linkedResponse.request().postDataJSON(), originalLink)
  }
  assert.equal(linkedResponse.status(), 200)
  const linked = await linkedResponse.json()
  assert.equal(linked.custodyId, configured.custodyId)
  await button('结束本次配置操作并重新读取').click()
  checks.push('real-formal-device-association-and-filevault-custody-link-with-distinct-cas')
  await run.choose(p, label('凭据操作'), '设置或清除恢复锁')
  await p
    .getByRole('checkbox', { name: '已核对无现有材料，以 absence revision 0 新建', exact: true })
    .check()
  const operationsPath = `/api/v1/devices/${f.recovery.mac}/recovery-credentials/operations`
  const accepted = await (
    await run.response(p, 'POST', operationsPath, () => button('提交原生凭据操作').click(), 202)
  ).json()
  assert.equal(accepted.accepted, true)
  const original = await run.response(
    p,
    'GET',
    `/api/v1/devices/${f.recovery.mac}/operations/${accepted.operationId}`,
    () => button('读取原凭据操作事实').click(),
  )
  const facts = await original.json()
  assert.equal(facts.operationId, accepted.operationId)
  assert.notEqual(facts.observation?.effect, 'verified')
  await button('结束本次凭据操作').click()
  checks.push(
    'real-filevault-configuration-cas-distinct-from-material-and-native-202-original-get-without-device-effect-claim',
  )

  run.step('safe-responsive-directory-design')
  await run.response(p, 'GET', '/api/v1/device-views', () => run.nav(p, '/devices', '设备'))
  await p.waitForFunction(() => !document.querySelector('.ant-spin-spinning'))
  const screenshots = mkdtempSync(join(tmpdir(), 'rss-react-recovery-design-'))
  for (const [name, width] of [
    ['desktop', 1440],
    ['tablet', 860],
    ['mobile', 390],
  ]) {
    await p.setViewportSize({ width, height: 960 })
    await p.screenshot({
      path: join(screenshots, name + '.png'),
      fullPage: true,
      animations: 'disabled',
    })
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  }
  await p.setViewportSize({ width: 1440, height: 960 })
  await button('切换亮暗主题').click()
  await p.screenshot({
    path: join(screenshots, 'dark.png'),
    fullPage: true,
    animations: 'disabled',
  })
  checks.push('safe-device-directory-desktop-tablet-mobile-dark-and-no-horizontal-overflow')
  console.log(JSON.stringify({ journey: 'react-recovery', screenshots }))
} catch (error) {
  failure = error
  console.error(
    JSON.stringify({
      journey: 'react-recovery',
      failure: error.name,
      failureClassification: /strict mode violation/.test(error.message)
        ? 'strict-selector'
        : /not an <input>|not an input|not editable/.test(error.message)
          ? 'control-kind'
          : /Timeout/.test(error.name)
            ? 'timeout'
            : error.name,
      failureLocation: error.stack?.match(/react-recovery-browser\.mjs:(\d+):(\d+)/)?.[0],
    }),
  )
} finally {
  await run.finish(failure)
}
