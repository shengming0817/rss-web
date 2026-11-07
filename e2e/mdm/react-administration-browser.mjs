// React administration over disposable real PG, Identity, Keycloak and HTTPS MDM.
import { chromium } from 'playwright'
import { readFileSync, statSync, mkdtempSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import process from 'node:process'
let browser,
  phase = 'fixture',
  failed = false,
  closing
const contexts = [],
  checks = [],
  errors = [],
  csp = []
const close = () =>
  (closing ??= (async () => {
    for (const context of contexts.reverse()) {
      try {
        await context.close()
      } catch {
        failed = true
      }
    }
    try {
      await browser?.close()
    } catch {
      failed = true
    }
  })())
const stop = () => {
  failed = true
  void close()
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
const timer = setTimeout(stop, 800_000)
let screenshots
try {
  const f = JSON.parse(readFileSync(process.env.MDM_PROFILE_BROWSER_FIXTURE, 'utf8'))
  assert.equal(new URL(f.origin).protocol, 'https:')
  assert.equal(new URL(f.origin).hostname, 'localhost')
  assert.equal(statSync(f.passwordFile).mode & 0o077, 0)
  const password = readFileSync(f.passwordFile, 'utf8'),
    origin = f.origin
  browser = await chromium.launch()
  const traffic = new WeakMap()
  const requestCount = (p, method, path) =>
    traffic.get(p).filter((r) => r.method === method && r.path === path).length
  async function page() {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 960 },
    })
    contexts.push(context)
    let next = 0
    await context.route('**/api/v1/**', async (route) => {
      const wait = Math.max(0, next - Date.now())
      next = Date.now() + wait + 180
      if (wait) await new Promise((done) => setTimeout(done, wait))
      await route.continue()
    })
    const p = await context.newPage()
    p.setDefaultTimeout(20_000)
    traffic.set(p, [])
    p.on('request', (r) =>
      traffic.get(p).push({ method: r.method(), path: new URL(r.url()).pathname }),
    )
    p.on('pageerror', (e) => errors.push(e.name))
    await p.addInitScript(() =>
      window.addEventListener('securitypolicyviolation', (e) =>
        console.info(
          'mdm-csp:' +
            JSON.stringify({
              directive: e.effectiveDirective,
              origin: location.origin,
              blocked: e.blockedURI === 'inline' ? 'inline' : 'other',
              source: e.sourceFile.includes('/assets/') ? 'asset' : 'document',
              line: e.lineNumber,
              column: e.columnNumber,
            }),
        ),
      ),
    )
    p.on('console', (m) => {
      if (m.text().startsWith('mdm-csp:')) {
        const v = JSON.parse(m.text().slice(8))
        csp.push({ ...v, origin: v.origin === origin ? 'product' : 'idp', phase })
      }
      if (m.type() === 'error' && /Content Security Policy|violates.*policy/i.test(m.text()))
        csp.push('csp')
    })
    return p
  }
  async function login(p, management = false, login = 'admin', secret = password) {
    await p.goto(origin + (management ? '/platform/login' : '/login'))
    await p.getByRole('heading', { name: '欢迎回来', exact: true }).waitFor()
    await p.getByLabel('账户', { exact: true }).fill(login)
    await p.getByLabel('密码', { exact: true }).fill(secret)
    await p.getByRole('button', { name: '登录', exact: true }).click()
    const initialSetup = !management && login === 'admin'
    await p
      .getByRole('heading', { name: initialSetup ? '租户初始化' : '工作台', exact: true })
      .waitFor()
    assert.equal(
      new URL(p.url()).pathname,
      initialSetup ? '/setup' : management ? '/platform' : '/',
    )
  }
  const dialog = (p, name) => p.getByRole('dialog', { name, exact: true })
  async function shut(p, name) {
    const d = dialog(p, name)
    await d.locator('.ant-modal-close').click()
    await d.waitFor({ state: 'hidden' })
  }
  async function choose(p, control, label) {
    await control.click()
    // Searchable Ant Design selects virtualize long permission lists.
    if (await control.isEditable()) await control.fill(label)
    await p
      .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
      .getByText(label, { exact: true })
      .click()
  }
  async function result(p, method, suffix, submit, expected = 200) {
    const response = p.waitForResponse(
      (r) => r.request().method() === method && new URL(r.url()).pathname.endsWith(suffix),
    )
    await submit()
    const r = await response
    assert.equal(r.status(), expected, `Unexpected status during ${phase}`)
    return r.json()
  }
  async function nav(p, route, title) {
    await p.goto(origin + route)
    await p.getByRole('heading', { name: title, exact: true }).waitFor()
    await p
      .locator('.admin-loading')
      .waitFor({ state: 'hidden' })
      .catch(() => {})
  }
  const admin = await page()
  await login(admin)
  phase = 'accounts'
  await nav(admin, '/identity', '账户与身份来源')
  await admin.getByRole('button', { name: '创建本地账户', exact: true }).click()
  let d = dialog(admin, '创建本地账户')
  const memberLogin = 'react-reader',
    memberPassword = 'Disposable-' + randomUUID()
  await d.getByLabel('本地登录名', { exact: true }).fill(memberLogin)
  await d.getByLabel('密码', { exact: true }).fill(memberPassword)
  const member = await result(
    admin,
    'POST',
    '/accounts',
    () => d.getByRole('button', { name: '创建账户', exact: true }).click(),
    201,
  )
  await d.waitFor({ state: 'hidden' })
  assert.equal(member.memberActive, true)
  checks.push('identity-account-create-through-react')

  phase = 'invalid-directory-source'
  const source = admin.getByLabel('来源（local 或 Provider UUID）', { exact: true })
  const accountPath = `/api/v1/identity/tenants/${f.tenant}/accounts`
  const accountReads = requestCount(admin, 'GET', accountPath)
  await source.fill('foo')
  await admin.getByRole('button', { name: '应用来源', exact: true }).click()
  await admin.getByText('无法读取当前数据，请检查查询或连接后重新读取。', { exact: true }).waitFor()
  assert.equal(await admin.getByRole('heading', { name: '账户与身份来源', exact: true }).count(), 1)
  assert.equal(requestCount(admin, 'GET', accountPath), accountReads)
  await source.fill('local')
  await result(admin, 'GET', '/accounts', () =>
    admin.getByRole('button', { name: '应用来源', exact: true }).click(),
  )
  assert.deepEqual(errors, [])
  checks.push('invalid-source-read-error-keeps-page-and-explicit-correction-recovers')

  phase = 'local-profile-unknown'
  await admin.getByRole('tab', { name: '本人本地资料', exact: true }).click()
  await admin.getByLabel('显示名称', { exact: true }).fill('React administrator')
  const extensions = {
    employeeNumber: 'LOCAL-REACT',
    remote: false,
    allocation: 0,
    vendorFuture: { retained: true },
    private_Key: 'ordinary label',
  }
  await admin.getByLabel('完整扩展 JSON', { exact: true }).fill(JSON.stringify(extensions))
  await admin.getByLabel('观察最长有效期（秒）', { exact: true }).fill('60')
  let localOperation
  const localPath = `/api/v1/identity/tenants/${f.tenant}/accounts/${f.principal}/profile`
  const loseLocal = async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback()
    localOperation = route.request().postDataJSON().operationId
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    await route.abort('failed')
  }
  await admin.route('**/accounts/*/profile', loseLocal)
  await admin.getByRole('button', { name: '保存本地资料', exact: true }).click()
  await admin.getByRole('button', { name: '查询原资料操作', exact: true }).waitFor()
  assert.equal(
    await admin.getByRole('button', { name: '读取本地资料', exact: true }).isEnabled(),
    false,
  )
  assert.equal(
    await admin.getByRole('button', { name: '放弃已拒绝请求并读取最新版本', exact: true }).count(),
    0,
  )
  const localReads = requestCount(admin, 'GET', `${localPath}/operations/${localOperation}`)
  await admin.getByRole('button', { name: '查询原资料操作', exact: true }).click()
  await admin
    .getByText('原资料操作已确认。需重新读取详情或重新登录后查看新的观察。', { exact: true })
    .waitFor()
  await admin.getByRole('button', { name: '读取本地资料', exact: true }).click()
  await admin.getByLabel('完整扩展 JSON', { exact: true }).waitFor()
  assert.deepEqual(
    JSON.parse(await admin.getByLabel('完整扩展 JSON', { exact: true }).inputValue()),
    extensions,
  )
  await admin.unroute('**/accounts/*/profile', loseLocal)
  assert.equal(requestCount(admin, 'PUT', localPath), 1)
  assert.equal(
    requestCount(admin, 'GET', `${localPath}/operations/${localOperation}`),
    localReads + 1,
  )
  checks.push(
    'real-local-profile-commit-loss-original-query-no-replay',
    'unknown-extension-roundtrip',
  )

  phase = 'local-profile-real-conflict-recovery'
  // A concurrent real write advances the revision before the original reaches the backend.
  // Both replies are genuine: the concurrent write succeeds and the stale original is rejected.
  const conflictLocal = async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback()
    const original = route.request().postDataJSON()
    const concurrent = await route.fetch({ postData: { ...original, operationId: randomUUID() } })
    assert.equal(concurrent.status(), 200)
    await route.continue()
  }
  await admin.route('**/accounts/*/profile', conflictLocal)
  await result(
    admin,
    'PUT',
    '/profile',
    () => admin.getByRole('button', { name: '保存本地资料', exact: true }).click(),
    409,
  )
  await admin.getByText('内容已变化，请重新读取详情后编辑。', { exact: true }).waitFor()
  assert.equal(
    await admin.getByRole('button', { name: '保存本地资料', exact: true }).isEnabled(),
    false,
  )
  await admin.unroute('**/accounts/*/profile', conflictLocal)
  const latestProfile = await result(admin, 'GET', '/profile', () =>
    admin.getByRole('button', { name: '放弃已拒绝请求并读取最新版本', exact: true }).click(),
  )
  await admin.getByRole('button', { name: '保存本地资料', exact: true }).waitFor()
  await admin.getByLabel('显示名称', { exact: true }).fill('React administrator recovered')
  const recovered = await result(admin, 'PUT', '/profile', () =>
    admin.getByRole('button', { name: '保存本地资料', exact: true }).click(),
  )
  assert.equal(recovered.revision, latestProfile.revision + 1)
  checks.push('real-local-profile-CAS-conflict-discard-reread-new-revision-save')

  phase = 'field-definition'
  await nav(admin, '/user-profiles', '用户资料')
  await admin.getByRole('tab', { name: '字段与来源映射', exact: true }).click()
  async function field(key, type, pointer, sensitive = false, sourceLabel) {
    await admin.getByRole('button', { name: '创建用户字段', exact: true }).click()
    const e = dialog(admin, '用户字段详情')
    await e.getByLabel('字段键', { exact: true }).fill(key)
    await e.getByLabel('显示名称', { exact: true }).fill(key)
    await e.getByLabel('JSON Pointer（标准化资料）', { exact: true }).fill(pointer)
    await choose(admin, e.getByLabel('值类型', { exact: true }), type)
    if (sourceLabel) await choose(admin, e.getByLabel('资料来源', { exact: true }), sourceLabel)
    await e.getByLabel('完整性必需', { exact: true }).click()
    if (sensitive) await e.getByLabel('敏感字段', { exact: true }).click()
    const response = admin.waitForResponse(
      (r) =>
        r.request().method() === 'PUT' &&
        new URL(r.url()).pathname.startsWith('/api/v1/user-attribute-definitions/'),
    )
    await e.getByRole('button', { name: '保存用户字段', exact: true }).click()
    const reply = await response
    assert.equal(reply.status(), 200)
    const r = await reply.json()
    await e.waitFor({ state: 'hidden' })
    return r.definition
  }
  const localField = await field('EmployeeLocal', 'string', '/extensions/employeeNumber', true)
  await field('RemoteLocal', 'boolean', '/extensions/remote')
  await field('AllocationLocal', 'number', '/extensions/allocation')
  const row = admin.locator('.main tbody tr').filter({ hasText: 'EmployeeLocal' })
  await row.getByRole('button').first().click()
  d = dialog(admin, '用户字段详情')
  await d.getByLabel('显示名称', { exact: true }).fill('EmployeeLocalUpdated')
  let fieldOperation
  const fieldPath = '/api/v1/user-attribute-definitions/' + localField.fieldId
  const initialFieldWrites = requestCount(admin, 'PUT', fieldPath)
  const loseField = async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback()
    fieldOperation = route.request().postDataJSON().operationId
    const r = await route.fetch()
    assert.equal(r.status(), 200)
    await route.abort('failed')
  }
  await admin.route('**/user-attribute-definitions/' + localField.fieldId, loseField)
  await d.getByRole('button', { name: '保存用户字段', exact: true }).click()
  await d.getByRole('button', { name: '查询原字段操作', exact: true }).waitFor()
  const fieldReads = requestCount(
    admin,
    'GET',
    '/api/v1/user-attribute-operations/' + fieldOperation,
  )
  await d.getByRole('button', { name: '查询原字段操作', exact: true }).click()
  await d.waitFor({ state: 'hidden' })
  await admin.unroute('**/user-attribute-definitions/' + localField.fieldId, loseField)
  assert.equal(requestCount(admin, 'PUT', fieldPath), initialFieldWrites + 1)
  assert.equal(
    requestCount(admin, 'GET', '/api/v1/user-attribute-operations/' + fieldOperation),
    fieldReads + 1,
  )
  checks.push('real-field-definition-cas-and-original-query')

  phase = 'profile-current-expiry-redaction'
  const signedOut = admin.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/session/logout'),
  )
  await admin.getByRole('button', { name: '退出登录', exact: true }).click()
  assert.equal((await signedOut).status(), 204)
  await admin.getByRole('heading', { name: '欢迎回来', exact: true }).waitFor()
  await login(admin)
  await nav(admin, '/user-profiles', '用户资料')
  await admin.locator('.profile-value').getByText('false', { exact: true }).waitFor()
  await admin.locator('.profile-value').getByText('0', { exact: true }).waitFor()
  await admin.locator('.profile-value').getByText('LOCAL-REACT', { exact: true }).waitFor()
  await admin.getByLabel('预览脱敏（需要权限）', { exact: true }).click()
  await admin.getByText('已脱敏', { exact: true }).waitFor()
  assert.equal(
    await admin.locator('.profile-value').getByText('LOCAL-REACT', { exact: true }).count(),
    0,
  )
  await admin.getByLabel('预览脱敏（需要权限）', { exact: true }).click()
  await admin.locator('.profile-value').getByText('LOCAL-REACT', { exact: true }).waitFor()
  screenshots = mkdtempSync(resolve(tmpdir(), 'rss-react-administration-'))
  await admin.screenshot({
    path: resolve(screenshots, 'profile-desktop-light.png'),
    fullPage: true,
    animations: 'disabled',
  })
  // Let the real 60-second observation expire. No fixture clock or response substitution.
  await admin
    .getByText('观察已过期；原完整性计数不再代表当前状态，请重新读取。', { exact: true })
    .waitFor({ timeout: 70_000 })
  assert.equal(
    await admin.locator('.profile-value').getByText('LOCAL-REACT', { exact: true }).count(),
    0,
  )
  checks.push(
    'real-current-login-observation-false-zero',
    'sensitive-preview-redaction',
    'real-ttl-clears-values',
  )

  phase = 'authorization-rules-and-groups'
  await nav(admin, '/authorization', '授权管理')
  async function rule(principalId, permission = 'user_profiles_read') {
    await admin.getByRole('button', { name: '创建规则', exact: true }).click()
    const e = dialog(admin, '授权规则')
    await e.getByLabel('账户主体标识', { exact: true }).fill(principalId)
    await e.getByRole('button', { name: '添加权限', exact: true }).click()
    await choose(admin, e.getByLabel('权限', { exact: true }), permission)
    const response = admin.waitForResponse(
      (r) =>
        r.request().method() === 'PUT' &&
        new URL(r.url()).pathname.startsWith('/api/v1/authorization/rules/'),
    )
    await e.getByRole('button', { name: '保存规则', exact: true }).click()
    const r = await response
    assert.equal(r.status(), 200)
    const saved = await r.json()
    await e.waitFor({ state: 'hidden' })
    return saved.id
  }
  const readerRule = await rule(member.principalId)
  await admin.getByRole('tab', { name: '授权用户组', exact: true }).click()
  await admin.getByRole('button', { name: '创建授权用户组', exact: true }).click()
  d = dialog(admin, '授权用户组详情')
  await d.getByLabel('用户组名称', { exact: true }).fill('React operators')
  await d.getByLabel('Identity 账户主体标识，每行一个', { exact: true }).fill(member.principalId)
  const groupResponse = admin.waitForResponse(
    (r) =>
      r.request().method() === 'PUT' &&
      new URL(r.url()).pathname.includes('/authorization/user-groups/'),
  )
  await d.getByRole('button', { name: '保存用户组', exact: true }).click()
  const groupResult = await groupResponse
  assert.equal(groupResult.status(), 200)
  const group = await groupResult.json()
  await d.waitFor({ state: 'hidden' })
  await admin
    .locator('.main tbody tr')
    .filter({ hasText: 'React operators' })
    .getByRole('button')
    .first()
    .click()
  d = dialog(admin, '授权用户组详情')
  await d.getByText(member.principalId, { exact: true }).waitFor()
  await d.getByLabel('用户组名称', { exact: true }).fill('React operators changed')
  let concurrent = false
  const conflict = async (route) => {
    if (route.request().method() !== 'PUT' || concurrent) return route.fallback()
    concurrent = true
    const body = route.request().postDataJSON()
    body.operationId = randomUUID()
    const r = await route.fetch({ postData: JSON.stringify(body) })
    assert.equal(r.status(), 200)
    await route.continue()
  }
  await admin.route('**/authorization/user-groups/' + group.id, conflict)
  const rejected = admin.waitForResponse(
    (r) =>
      r.request().method() === 'PUT' &&
      new URL(r.url()).pathname.endsWith('/user-groups/' + group.id),
  )
  await d.getByRole('button', { name: '保存用户组', exact: true }).click()
  assert.equal((await rejected).status(), 409)
  await d.getByText('内容已变化，请重新读取详情后编辑。', { exact: true }).waitFor()
  await admin.unroute('**/authorization/user-groups/' + group.id, conflict)
  await shut(admin, '授权用户组详情')
  checks.push('real-user-group-detail-members-cas-conflict')

  phase = 'permission-withdrawal'
  const reader = await page()
  await login(reader, false, memberLogin, memberPassword)
  await nav(reader, '/user-profiles', '用户资料')
  await reader.getByLabel('他人主体标识（留空查看本人）', { exact: true }).fill(f.principal)
  await reader.getByRole('button', { name: '读取资料', exact: true }).click()
  await reader.getByText('最新展示投影，不是认证事实', { exact: false }).waitFor()
  await admin.getByRole('tab', { name: '授权规则', exact: true }).click()
  await admin
    .locator('.main tbody tr')
    .filter({ hasText: readerRule })
    .getByRole('button')
    .first()
    .click()
  await dialog(admin, '授权规则').getByRole('button', { name: '删除规则', exact: true }).click()
  await dialog(admin, '删除授权规则？').getByRole('button', { name: '删除', exact: true }).click()
  await dialog(admin, '删除授权规则？').waitFor({ state: 'hidden' })
  const denied = reader.waitForResponse((r) =>
    new URL(r.url()).pathname.endsWith('/user-profiles/' + f.principal),
  )
  await reader.getByRole('button', { name: '读取资料', exact: true }).click()
  assert.equal((await denied).status(), 403)
  await reader.getByText('当前账户没有此操作权限。', { exact: true }).waitFor()
  assert.equal(await reader.locator('.profile-value').count(), 0)
  checks.push('real-permission-withdrawal-clears-projection', 'rule-tombstone-delete')

  phase = 'api-key-secret'
  await admin.getByRole('tab', { name: 'API Key', exact: true }).click()
  await admin.getByRole('button', { name: '创建 API Key', exact: true }).click()
  d = dialog(admin, 'API Key 详情')
  await d.getByLabel('名称', { exact: true }).fill('React program')
  await d.getByRole('button', { name: '添加权限', exact: true }).click()
  const key = await result(admin, 'POST', '/api/v1/api-keys', () =>
    d.getByRole('button', { name: '创建 API Key', exact: true }).click(),
  )
  assert.equal(typeof key.secret, 'string')
  assert.ok(key.secret.length > 20)
  await dialog(admin, 'API Key 操作已确认').locator('.api-secret').waitFor()
  await admin.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  })
  await dialog(admin, 'API Key 操作已确认').waitFor({ state: 'hidden' })
  assert.equal(await admin.locator('.api-secret').count(), 0)
  assert.equal(
    await admin.evaluate(
      (secret) =>
        [localStorage, sessionStorage].some((storage) =>
          Object.values(storage).some((v) => String(v).includes(secret)),
        ),
      key.secret,
    ),
    false,
  )
  checks.push('formal-first-response-key-secret-hidden-cleanup-no-storage')

  async function lateRotation(returnBeforeResponse) {
    await admin
      .locator('.main tbody tr')
      .filter({ hasText: 'React program' })
      .getByRole('button')
      .first()
      .click()
    await dialog(admin, 'API Key 详情')
      .getByRole('button', { name: '轮换秘密', exact: true })
      .click()
    let release, arrived
    const gate = new Promise((done) => {
        release = done
      }),
      entered = new Promise((done) => {
        arrived = done
      })
    const pattern = '**/api-keys/' + key.receipt.id + '/rotate'
    const hold = async (route) => {
      const response = await route.fetch()
      arrived(response.status())
      await gate
      await route.fulfill({ response })
    }
    await admin.route(pattern, hold)
    try {
      await dialog(admin, '轮换 API Key 秘密？')
        .getByRole('button', { name: '确认', exact: true })
        .click()
      assert.equal(await entered, 200)
      await admin.evaluate((visibleAgain) => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => 'hidden',
        })
        document.dispatchEvent(new Event('visibilitychange'))
        if (visibleAgain)
          Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => 'visible',
          })
      }, returnBeforeResponse)
      release()
      await admin
        .getByText('操作已确认，秘密披露已因隐藏或关闭失效。需要新秘密时请显式轮换。', {
          exact: true,
        })
        .waitFor()
      await admin.evaluate(() =>
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => 'visible',
        }),
      )
      assert.equal(await admin.locator('.api-secret').count(), 0)
      await dialog(admin, 'API Key 操作已确认')
        .getByRole('button', { name: '已保存，关闭', exact: true })
        .click()
    } finally {
      release()
      await admin.unroute(pattern, hold)
    }
  }
  await lateRotation(false)
  await lateRotation(true)
  checks.push(
    'late-key-secret-hidden-response-discarded',
    'late-key-secret-hide-return-response-discarded',
  )

  phase = 'provider-management'
  await nav(admin, '/identity', '账户与身份来源')
  await admin.getByRole('tab', { name: 'Providers', exact: true }).click()
  await admin.getByRole('button', { name: '创建 Provider', exact: true }).click()
  d = dialog(admin, 'Provider 配置')
  await d.getByLabel('Issuer', { exact: true }).fill(f.issuer)
  await d.getByLabel('Client ID', { exact: true }).fill('identity-test')
  await d.getByLabel('Client secret', { exact: true }).fill('fixture-secret')
  await d.getByLabel('专用 CA PEM（可留空）', { exact: true }).fill(readFileSync(f.caFile, 'utf8'))
  await d.getByLabel('资料扩展声明根（可留空）', { exact: true }).fill('attributes')
  await d.getByLabel('即时创建联合主体', { exact: true }).click()
  const provider = await result(
    admin,
    'POST',
    '/providers',
    () => d.getByRole('button', { name: '创建 Provider', exact: true }).click(),
    201,
  )
  await d.waitFor({ state: 'hidden' })
  await admin
    .locator('.main tbody tr')
    .filter({ hasText: provider.id })
    .getByRole('button')
    .first()
    .click()
  d = dialog(admin, 'Provider 配置')
  assert.equal(
    await d.getByLabel('资料扩展声明根（可留空）', { exact: true }).inputValue(),
    'attributes',
  )
  assert.equal(await d.getByLabel('Client secret', { exact: true }).inputValue(), '')
  await d.getByRole('button', { name: '启用 Provider', exact: true }).click()
  await dialog(admin, '变更 Provider 启用状态？')
    .getByRole('button', { name: '确定', exact: true })
    .click()
  await d.waitFor({ state: 'hidden' })
  await admin
    .locator('.main tbody tr')
    .filter({ hasText: provider.id })
    .getByRole('button')
    .first()
    .click()
  d = dialog(admin, 'Provider 配置')
  await d.getByRole('button', { name: '测试连接', exact: true }).click()
  await d
    .getByText('连接测试返回成功；仅证明列出的检查，不代表完整登录验收。', { exact: true })
    .waitFor()
  await shut(admin, 'Provider 配置')
  checks.push('react-provider-full-mapping-roundtrip-real-keycloak-connection')
  await nav(admin, '/user-profiles', '用户资料')
  await admin.getByRole('tab', { name: '字段与来源映射', exact: true }).click()
  await field('EmployeeOIDC', 'string', '/extensions/employeeNumber', true, `IdP · ${provider.id}`)
  const alice = await page()
  await alice.goto(origin + '/login')
  await alice.getByRole('button', { name: f.issuer, exact: false }).click()
  await alice.waitForURL((u) => u.origin === new URL(f.issuer).origin)
  await alice.locator('#username').fill('alice')
  await alice.locator('#password').fill('fixture-password')
  await alice.locator('#kc-login').click()
  await alice.getByRole('heading', { name: '工作台', exact: true }).waitFor()
  await nav(alice, '/user-profiles', '用户资料')
  await alice.locator('.profile-value').getByText('OIDC-1', { exact: true }).waitFor()
  checks.push('real-oidc-normalized-source-mapping-current-profile')

  phase = 'management-tenants'
  const manager = await page()
  await login(manager, true)
  await nav(manager, '/platform/tenants', '租户管理')
  assert.equal(
    await manager.locator('.sidebar').getByRole('link', { name: '用户资料', exact: true }).count(),
    0,
  )
  await manager.getByRole('button', { name: '创建租户', exact: true }).click()
  d = dialog(manager, '创建并供应业务租户')
  const tenantName = 'React supplied tenant',
    tenantPassword = 'Disposable-' + randomUUID()
  await d.getByLabel('租户名称', { exact: true }).fill(tenantName)
  await d.getByLabel('初始管理员登录名', { exact: true }).fill('tenant-admin')
  await d.getByLabel('初始管理员密码', { exact: true }).fill(tenantPassword)
  let provisionOperation
  const provisionPath = '/api/v1/tenant-administration/provisionings'
  const loseProvision = async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    provisionOperation = route.request().headers()['idempotency-key']
    const r = await route.fetch()
    assert.ok([200, 202].includes(r.status()))
    await route.abort('failed')
  }
  await manager.route('**/tenant-administration/provisionings', loseProvision)
  await d.getByRole('button', { name: '创建并供应租户', exact: true }).click()
  await d.getByRole('button', { name: '查询原供应操作', exact: true }).waitFor()
  const provisionReads = requestCount(manager, 'GET', `${provisionPath}/${provisionOperation}`)
  await d.getByRole('button', { name: '查询原供应操作', exact: true }).click()
  await d.getByText('供应尚未完成，不能进入业务租户', { exact: true }).waitFor()
  assert.equal(await d.getByRole('link', { name: '进入业务租户', exact: false }).count(), 0)
  await manager.unroute('**/tenant-administration/provisionings', loseProvision)
  assert.equal(requestCount(manager, 'POST', provisionPath), 1)
  assert.equal(
    requestCount(manager, 'GET', `${provisionPath}/${provisionOperation}`),
    provisionReads + 1,
  )
  assert.equal(
    (await d.getByLabel('重输原管理员密码', { exact: true }).count())
      ? await d.getByLabel('重输原管理员密码', { exact: true }).inputValue()
      : '',
    '',
  )
  await shut(manager, '创建并供应业务租户')
  const diagnosticBase = '/api/v1/tenant-administration/operation-diagnostics'
  const diagnosticPath = `${diagnosticBase}/operations/tenant_administration/${provisionOperation}`
  const diagnosticQuery = new URLSearchParams({
    mode: 'operation',
    owner: 'tenant_administration',
    operationId: provisionOperation,
  })
  await nav(manager, '/platform/operation-diagnostics?' + diagnosticQuery, '操作排障')
  await manager.getByText('原操作结果', { exact: true }).waitFor()
  await manager.getByText(provisionOperation, { exact: true }).waitFor()
  const diagnostics = await manager.request.get(origin + diagnosticPath)
  assert.equal(diagnostics.status(), 200)
  assert.equal((await diagnostics.json()).originalResult.availability, 'available')
  assert.ok([401, 403].includes((await admin.request.get(origin + diagnosticPath)).status()))
  await nav(manager, '/platform/operation-diagnostics', '操作排障')
  await manager.getByLabel('原操作编号', { exact: true }).fill(provisionOperation)
  const indexed = await result(manager, 'GET', diagnosticBase, () =>
    manager.getByRole('button', { name: '查询操作', exact: true }).click(),
  )
  const attempt = indexed.items.find(({ fact }) => fact.origin === 'request' && fact.requestId)
  assert.ok(attempt)
  const requestHref = `a[href*="/platform/operation-diagnostics"][href*="requestId=${attempt.fact.requestId}"]`
  const discoveryRow = manager
    .locator('details')
    .filter({ has: manager.locator(requestHref) })
    .first()
  await discoveryRow.locator(':scope > summary').click()
  await result(manager, 'GET', diagnosticBase + '/requests/' + attempt.fact.requestId, () =>
    discoveryRow.locator(requestHref).first().click(),
  )
  await manager.getByText('请求尝试与关联证据', { exact: true }).waitFor()
  await manager
    .locator('details > summary')
    .filter({ hasText: attempt.fact.action })
    .first()
    .click()
  await manager.getByText(attempt.fact.requestId, { exact: true }).first().waitFor()
  checks.push('real-platform-diagnostics-directory-request-and-exact-read')
  await nav(manager, '/platform/tenants', '租户管理')

  await manager.getByRole('button', { name: '重新读取', exact: true }).click()
  await manager
    .locator('.main tbody tr')
    .filter({ hasText: tenantName })
    .getByRole('button')
    .first()
    .click()
  d = dialog(manager, '租户详情')
  await d.getByLabel('备注', { exact: true }).fill('Changed through React')
  await result(
    manager,
    'PUT',
    '/api/v1/tenant-administration/tenants/' +
      (await d.locator('.ant-descriptions-item-content').first().innerText()),
    () => d.getByRole('button', { name: '保存租户', exact: true }).click(),
  )
  await d
    .getByText('原操作已确认；回执是当时的结果，不代表对象的当前状态。', { exact: true })
    .waitFor()
  await d.getByRole('tab', { name: '业务租户管理员', exact: true }).click()
  await d.getByLabel('管理员登录名', { exact: true }).fill('react-second-admin')
  await d.getByLabel('密码', { exact: true }).fill('Disposable-' + randomUUID())
  const administratorResponse = manager.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/administrators'),
  )
  await d.getByRole('button', { name: '创建业务租户管理员', exact: true }).click()
  assert.equal((await administratorResponse).status(), 200)
  checks.push('management-creates-business-tenant-administrator')
  await shut(manager, '租户详情')
  await manager
    .locator('.main tbody tr')
    .filter({ hasText: 'Disposable unused tenant' })
    .getByRole('button')
    .first()
    .click()
  d = dialog(manager, '租户详情')
  await d.getByRole('button', { name: '删除租户', exact: true }).click()
  const deleted = await result(
    manager,
    'DELETE',
    '/api/v1/tenant-administration/tenants/' + f.unusedTenant,
    () =>
      dialog(manager, '删除此租户？')
        .getByRole('button', { name: '删除租户', exact: true })
        .click(),
  )
  assert.equal(deleted.action, 'delete')
  await dialog(manager, '删除此租户？').waitFor({ state: 'hidden' })
  await shut(manager, '租户详情')
  await manager.getByRole('tab', { name: '原操作查询', exact: true }).click()
  await manager.getByLabel('原操作标识', { exact: true }).fill(deleted.operationId)
  await manager.getByRole('button', { name: '查询原操作', exact: true }).click()
  await manager
    .getByText('原操作已确认；回执是当时的结果，不代表对象的当前状态。', { exact: true })
    .waitFor()
  checks.push(
    'management-realm-cross-tenant-cas-update-delete',
    'provision-unknown-query-without-fake-enabled',
    'tenant-original-operation-query',
  )

  phase = 'network-policy-rejection-recovery'
  await nav(manager, '/platform/authorization', '授权管理')
  await manager.getByRole('tab', { name: '网络策略', exact: true }).click()
  const networkInput = manager.getByLabel('CIDR 网络，每行一个', { exact: true })
  await networkInput.fill('not-a-cidr')
  await manager.getByRole('button', { name: '更新网络策略', exact: true }).click()
  await result(
    manager,
    'PUT',
    '/api/v1/tenant-administration/api-access/network-policy',
    () =>
      dialog(manager, '更新网络策略？').getByRole('button', { name: '确定', exact: true }).click(),
    400,
  )
  await dialog(manager, '更新网络策略？').getByRole('button', { name: '取消', exact: true }).click()
  assert.equal(await networkInput.isEnabled(), true)
  assert.equal(
    await manager.getByRole('button', { name: '读取网络策略', exact: true }).isEnabled(),
    true,
  )
  await result(manager, 'GET', '/api/v1/tenant-administration/api-access/network-policy', () =>
    manager.getByRole('button', { name: '读取网络策略', exact: true }).click(),
  )
  await networkInput.fill('127.0.0.1/32')
  await manager.getByRole('button', { name: '更新网络策略', exact: true }).click()
  let changedNetwork = false
  const networkPattern = '**/tenant-administration/api-access/network-policy'
  const networkConflict = async (route) => {
    if (route.request().method() !== 'PUT' || changedNetwork) return route.fallback()
    changedNetwork = true
    const body = route.request().postDataJSON()
    body.operationId = randomUUID()
    const r = await route.fetch({ postData: JSON.stringify(body) })
    assert.equal(r.status(), 200)
    await route.continue()
  }
  await manager.route(networkPattern, networkConflict)
  await result(
    manager,
    'PUT',
    '/api/v1/tenant-administration/api-access/network-policy',
    () =>
      dialog(manager, '更新网络策略？').getByRole('button', { name: '确定', exact: true }).click(),
    409,
  )
  await manager.unroute(networkPattern, networkConflict)
  await dialog(manager, '更新网络策略？').getByRole('button', { name: '取消', exact: true }).click()
  await result(manager, 'GET', '/api/v1/tenant-administration/api-access/network-policy', () =>
    manager.getByRole('button', { name: '读取网络策略', exact: true }).click(),
  )
  await networkInput.fill('127.0.0.0/8')
  await manager.getByRole('button', { name: '更新网络策略', exact: true }).click()
  await result(manager, 'PUT', '/api/v1/tenant-administration/api-access/network-policy', () =>
    dialog(manager, '更新网络策略？').getByRole('button', { name: '确定', exact: true }).click(),
  )
  await dialog(manager, '更新网络策略？').waitFor({ state: 'hidden' })
  checks.push('network-policy-real-400-409-edit-read-recovery')

  phase = 'design-and-scope'
  await nav(manager, '/platform/authorization', '授权管理')
  assert.equal(await manager.getByRole('combobox', { name: '排序', exact: true }).count(), 1)
  assert.equal(await manager.getByRole('combobox', { name: '列', exact: true }).count(), 1)
  assert.equal(await manager.getByRole('spinbutton', { name: '每页', exact: true }).count(), 1)
  await manager.screenshot({
    path: resolve(screenshots, 'management-desktop-light.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await manager.getByRole('button', { name: 'English', exact: true }).click()
  assert.equal(await manager.getByRole('combobox', { name: 'Sort', exact: true }).count(), 1)
  assert.equal(await manager.getByRole('combobox', { name: 'Columns', exact: true }).count(), 1)
  assert.equal(await manager.getByRole('spinbutton', { name: 'Page size', exact: true }).count(), 1)
  await manager.getByRole('button', { name: 'Toggle color theme', exact: true }).click()
  await manager.setViewportSize({ width: 390, height: 844 })
  await manager.screenshot({
    path: resolve(screenshots, 'management-mobile-dark.png'),
    fullPage: true,
    animations: 'disabled',
  })
  assert.equal(
    await manager.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  )
  assert.deepEqual(errors, [])
  assert.deepEqual(csp, [])
  console.log(
    JSON.stringify({
      phase: 'react-administration-browser',
      result: 'passed',
      checks,
      screenshots,
      backendRevision: f.backendRevision,
      identityRevision: f.identityRevision,
    }),
  )
} catch (error) {
  failed = true
  // Never print page text, request bodies, provider credentials or raw network errors.
  console.error(
    JSON.stringify({
      phase,
      result: 'failed',
      classification: error.name,
      location: /react-administration-browser\.mjs:(\d+)/.exec(error.stack ?? '')?.[1],
      checks,
      csp,
      screenshots,
    }),
  )
} finally {
  clearTimeout(timer)
  await close()
  if (failed) process.exitCode = 1
}
