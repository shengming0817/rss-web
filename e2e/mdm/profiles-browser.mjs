// Real production UI/API; the only transport fault discards an already committed response.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, renameSync, existsSync, statSync } from 'node:fs'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import process from 'node:process'
const f = JSON.parse(readFileSync(process.env.MDM_PROFILE_BROWSER_FIXTURE, 'utf8'))
assert.equal(new URL(f.origin).protocol, 'https:')
assert.equal(statSync(f.passwordFile).mode & 0o077, 0)
const origin = f.origin,
  base = `/api/v1/identity/tenants/${f.tenant}`,
  password = readFileSync(f.passwordFile, 'utf8').trim()
let browser,
  phase = 'launch',
  result = 'failed',
  closing
const checks = [],
  errors = []
const stop = () =>
  (closing ??= (async () => {
    await browser?.close()
  })())
for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => void stop())
const timer = setTimeout(() => void stop(), 800000)
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
async function page() {
  const c = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN' })
  let next = 0
  await c.route('**/api/v1/**', async (route) => {
    const at = Math.max(Date.now(), next)
    next = at + 220
    if (at > Date.now()) await delay(at - Date.now())
    await route.continue().catch(() => {})
  })
  const p = await c.newPage()
  p.setDefaultTimeout(25000)
  p.on('pageerror', (e) => errors.push(e.name))
  return p
}
async function api(p, path, method = 'GET', body) {
  return p.evaluate(
    async ({ path, method, body, base }) => {
      let csrf
      if (method !== 'GET') {
        const s = await fetch(base + '/session', { credentials: 'same-origin' })
        if (s.status !== 200) return { status: s.status, value: null }
        csrf = (await s.json()).csrfToken
      }
      const r = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Identity-Request': '1',
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const text = await r.text()
      return { status: r.status, value: text ? JSON.parse(text) : null }
    },
    { path, method, body, base },
  )
}
async function login(p, name, secret) {
  await p.goto(origin + '/login')
  await p.locator('#login-name').fill(name)
  await p.locator('#login-password').fill(secret)
  await p.locator('form').first().getByRole('button', { name: '登录', exact: true }).click()
  await p.waitForURL((u) => u.pathname !== '/login')
  const s = await api(p, base + '/session')
  assert.equal(s.status, 200)
  assert.ok(s.value.session.issuedAt)
  assert.equal('authTime' in s.value.session, false)
  return s.value.identity.principalId
}
async function localEditor(p, principal) {
  await p.goto(`${origin}/tenants/${f.tenant}/accounts`)
  const row = p.locator('tbody tr').filter({ hasText: principal })
  await row.getByRole('button', { name: '本地资料', exact: true }).click()
  await p.locator('#local-display').waitFor()
}
async function localSave(p, value) {
  await p.locator('#local-display').fill('Profile member')
  await p
    .locator('#local-extensions')
    .fill(JSON.stringify({ employeeNumber: value, remote: false, allocation: 0 }))
  const response = p.waitForResponse(
    (r) => r.request().method() === 'PUT' && new URL(r.url()).pathname.endsWith('/profile'),
  )
  await p.getByRole('dialog').getByRole('button', { name: '保存配置', exact: true }).click()
  assert.equal((await response).status(), 200)
  await p.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
}
async function fields(p) {
  await p.goto(`${origin}/tenants/${f.tenant}/settings/user-attributes`)
  await p.getByRole('button', { name: '新建字段', exact: true }).waitFor()
  await p.getByRole('button', { name: '新建字段', exact: true }).waitFor({ state: 'visible' })
}
async function newField(p, key, source, pointer, sensitive = false) {
  await fields(p)
  await p.getByRole('button', { name: '新建字段', exact: true }).click()
  await p.locator('#attribute-key').fill(key)
  await p.locator('#attribute-name').fill(key)
  await p.locator('#attribute-source').selectOption(source)
  await p.locator('#attribute-pointer').fill(pointer)
  await p.getByRole('dialog').getByLabel('必填（完整性）', { exact: true }).check()
  if (sensitive) await p.getByRole('dialog').getByLabel('敏感字段', { exact: true }).check()
  const response = p.waitForResponse(
    (r) =>
      r.request().method() === 'PUT' &&
      new URL(r.url()).pathname.startsWith('/api/v1/user-attribute-definitions/'),
  )
  await p.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
  const r = await response
  assert.equal(r.status(), 200)
  const saved = await r.json()
  await p.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
  return saved.definition
}
async function myProfile(p) {
  await p.goto(`${origin}/tenants/${f.tenant}/profile`)
  await p.getByRole('heading', { name: '我的资料', exact: true }).waitFor()
  await p.locator('p[role=status]').waitFor()
}
async function sso() {
  const p = await page()
  await p.goto(origin + '/login')
  await p
    .getByRole('button', { name: /单点|SSO|企业|身份提供方/ })
    .last()
    .click()
  await p.waitForURL((u) => u.origin === new URL(f.issuer).origin)
  assert.equal(new URL(p.url()).origin, new URL(f.issuer).origin)
  await p.locator('#username').fill('alice')
  await p.locator('#password').fill('fixture-password')
  await p.locator('#kc-login').click()
  await p.waitForURL((u) => u.origin === origin && !u.pathname.startsWith('/auth/'))
  assert.equal((await api(p, base + '/session')).status, 200)
  return p
}
async function upstream(action) {
  const id = crypto.randomUUID()
  writeFileSync(f.idpRequest + '.tmp', JSON.stringify({ id, action }), { mode: 0o600 })
  renameSync(f.idpRequest + '.tmp', f.idpRequest)
  for (let i = 0; i < 200; i++) {
    if (existsSync(f.idpResponse) && JSON.parse(readFileSync(f.idpResponse, 'utf8')).id === id)
      return
    await delay(100)
  }
  throw new Error('upstream-control-timeout')
}
try {
  browser = await chromium.launch()
  phase = 'local-config-login'
  const admin = await page()
  await login(admin, 'admin', password)
  const memberPassword = 'Profile-member-password-2026!'
  const memberAccount = await api(admin, base + '/accounts', 'POST', {
    login: 'profile-member',
    password: memberPassword,
  })
  assert.equal(memberAccount.status, 201)
  const principal = memberAccount.value.principalId
  await localEditor(admin, principal)
  await localSave(admin, 'LOCAL-1')
  let member = await page()
  await login(member, 'profile-member', memberPassword)
  let localField = await newField(
    admin,
    'EmployeeLocal',
    'identity_local',
    '/extensions/employeeNumber',
  )
  await myProfile(member)
  await member.getByText('等待下次登录', { exact: true }).waitFor()
  assert.equal((await api(member, base + '/session')).status, 200)
  const previous = member
  member = await page()
  await login(member, 'profile-member', memberPassword)
  await myProfile(member)
  await member.getByText('LOCAL-1', { exact: true }).waitFor()
  const old = await api(previous, '/api/v1/user-profiles/me')
  assert.equal(old.status, 200)
  assert.equal(old.value.profiles[0].status, 'unavailable')
  await localEditor(admin, principal)
  await localSave(admin, 'LOCAL-2')
  assert.equal(
    (await api(member, '/api/v1/user-profiles/me')).value.fields.find(
      (v) => v.fieldId === localField.fieldId,
    ).value,
    'LOCAL-1',
  )
  member = await page()
  await login(member, 'profile-member', memberPassword)
  await myProfile(member)
  await member.getByText('LOCAL-2', { exact: true }).waitFor()
  checks.push('local-two-logins-and-bound-current')
  phase = 'receipt-conflict'
  await fields(admin)
  await admin
    .locator('tbody tr')
    .filter({ hasText: 'EmployeeLocal' })
    .getByRole('button', { name: '编辑字段', exact: true })
    .click()
  await admin.locator('#attribute-name').fill('Employee local updated')
  let lostId,
    writeCount = 0
  const lost = async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue()
      return
    }
    writeCount++
    lostId = route.request().postDataJSON().operationId
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    await route.abort('failed')
  }
  await admin.route('**/api/v1/user-attribute-definitions/*', lost)
  await admin.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
  await admin
    .getByText(/结果未知|结果未确认|提交结果/)
    .first()
    .waitFor()
  await admin.unroute('**/api/v1/user-attribute-definitions/*', lost)
  await admin.getByRole('dialog').getByRole('button', { name: '查询原操作', exact: true }).click()
  await admin.locator('#attribute-name:enabled').waitFor()
  assert.equal(writeCount, 1)
  const receipt = await api(admin, '/api/v1/user-attribute-operations/' + lostId)
  assert.equal(receipt.status, 200)
  localField = receipt.value.definition
  const changed = { ...localField.value, displayName: 'Concurrent edit' }
  assert.equal(
    (
      await api(admin, '/api/v1/user-attribute-definitions/' + localField.fieldId, 'PUT', {
        operationId: crypto.randomUUID(),
        expectedRevision: localField.revision,
        value: changed,
      })
    ).status,
    200,
  )
  await admin.locator('#attribute-name').fill('After comparison')
  const conflict = admin.waitForResponse(
    (r) => r.request().method() === 'PUT' && new URL(r.url()).pathname.endsWith(localField.fieldId),
  )
  await admin.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
  assert.equal((await conflict).status(), 409)
  await admin.getByRole('button', { name: '读取最新状态以比较', exact: true }).click()
  await admin.locator('#attribute-name').filter({ visible: true }).waitFor()
  await admin
    .getByRole('button', { name: /比较.*新|新操作|重新编辑/ })
    .last()
    .click()
  await admin.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
  checks.push('lost-response-receipt-and-cas')
  phase = 'local-delete'
  await localEditor(admin, principal)
  const deleted = admin.waitForResponse(
    (r) => r.request().method() === 'PUT' && new URL(r.url()).pathname.endsWith('/profile'),
  )
  await admin.getByRole('dialog').getByRole('button', { name: '删除本地资料', exact: true }).click()
  assert.equal((await deleted).status(), 200)
  await admin.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
  member = await page()
  await login(member, 'profile-member', memberPassword)
  const missing = await api(member, '/api/v1/user-profiles/me')
  assert.equal(missing.status, 200)
  assert.equal(missing.value.fields.find((v) => v.fieldId === localField.fieldId).value, null)
  checks.push('local-delete-does-not-block-login')
  phase = 'provider-editor'
  await admin.goto(`${origin}/tenants/${f.tenant}/providers`)
  await admin.getByRole('button', { name: '新增身份提供方', exact: true }).click()
  await admin.locator('#issuer').fill(f.issuer)
  await admin.locator('#client-id').fill('identity-test')
  await admin.locator('#client-secret').fill('fixture-secret')
  await admin.locator('#ca-pem').fill(readFileSync(f.caFile, 'utf8'))
  await admin.locator('#profile-claim').fill('profile_attributes')
  await admin.locator('#groups-claim').fill('')
  await admin.locator('#jit').check()
  const created = admin.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/providers'),
  )
  await admin.getByRole('dialog').getByRole('button', { name: '保存配置', exact: true }).click()
  const providerResponse = await created
  assert.equal(providerResponse.status(), 201)
  const provider = await providerResponse.json()
  const enabled = admin.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/enabled'))
  await admin
    .locator('tbody tr')
    .filter({ hasText: f.issuer })
    .getByRole('button', { name: '启用身份提供方', exact: true })
    .click()
  assert.equal((await enabled).status(), 200)
  let alice = await sso()
  const aliceId = (await api(alice, base + '/session')).value.identity.principalId
  const oidcField = await newField(admin, 'EmployeeOIDC', provider.id, '/extensions/employeeNumber')
  await myProfile(alice)
  await alice.getByText('等待下次登录', { exact: true }).waitFor()
  alice = await sso()
  await myProfile(alice)
  await alice.getByText('OIDC-1', { exact: true }).waitFor()
  await upstream('update')
  assert.equal(
    (await api(alice, '/api/v1/user-profiles/me')).value.fields.find(
      (v) => v.fieldId === oidcField.fieldId,
    ).value,
    'OIDC-1',
  )
  alice = await sso()
  await myProfile(alice)
  await alice.getByText('OIDC-2', { exact: true }).waitFor()
  checks.push('real-keycloak-editor-two-logins')
  phase = 'authorization-withdrawal'
  const effective = await api(admin, '/api/v1/authorization'),
    rule = crypto.randomUUID()
  assert.equal(
    (
      await api(admin, '/api/v1/authorization/rules/' + rule, 'PUT', {
        operationId: crypto.randomUUID(),
        expectedRevision: 0,
        value: {
          subject: {
            kind: 'user',
            user: {
              instanceId: effective.value.instanceId,
              tenantId: f.tenant,
              principalId: principal,
            },
          },
          grants: [{ operation: 'user_profiles_read', scope: { kind: 'tenant' } }],
        },
      })
    ).status,
    200,
  )
  await myProfile(member)
  await member.locator('#profile-principal').fill(aliceId)
  await member.getByRole('button', { name: '读取资料', exact: true }).click()
  await member.getByText('OIDC-2', { exact: true }).waitFor()
  assert.equal(
    (
      await api(admin, '/api/v1/authorization/rules/' + rule, 'PUT', {
        operationId: crypto.randomUUID(),
        expectedRevision: 1,
        value: null,
      })
    ).status,
    200,
  )
  await member.getByRole('button', { name: '重新读取', exact: true }).click()
  await member.getByRole('heading', { name: /权限|拒绝/ }).waitFor()
  assert.ok(!(await member.locator('body').innerText()).includes('OIDC-2'))
  checks.push('403-clears-profile-data')
  phase = 'preview-and-delete'
  await fields(admin)
  await admin.getByRole('button', { name: '授权预览', exact: true }).click()
  await admin.locator('#preview-principal').fill(aliceId)
  await admin.getByRole('button', { name: '读取资料', exact: true }).click()
  await admin.getByText('OIDC-2', { exact: true }).waitFor()
  // Mark the mapped field sensitive through the same editor, retaining explicit both visibility for this preview test.
  await admin
    .locator('tbody tr')
    .filter({ hasText: 'EmployeeOIDC' })
    .getByRole('button', { name: '编辑字段', exact: true })
    .click()
  await admin.getByRole('dialog').getByLabel('敏感字段', { exact: true }).check()
  await admin.locator('#attribute-visibility').selectOption('both')
  await admin.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
  await admin.locator('#attribute-name:enabled').waitFor()
  await admin.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
  await admin.getByRole('button', { name: '重新读取', exact: true }).last().click()
  await admin.getByText('已脱敏', { exact: true }).waitFor()
  assert.ok(!(await admin.locator('body').innerText()).includes('OIDC-2'))
  await upstream('delete')
  alice = await sso()
  const deletedClaims = await api(alice, '/api/v1/user-profiles/me')
  assert.equal(deletedClaims.status, 200)
  assert.equal(deletedClaims.value.fields.find((v) => v.fieldId === oidcField.fieldId).value, null)
  await fields(admin)
  await admin
    .locator('tbody tr')
    .filter({ hasText: 'EmployeeOIDC' })
    .getByRole('button', { name: '编辑字段', exact: true })
    .click()
  await admin.getByRole('dialog').getByLabel('启用', { exact: true }).uncheck()
  await admin.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
  await admin.locator('#attribute-name:enabled').waitFor()
  assert.ok(
    !(await api(alice, '/api/v1/user-profiles/me')).value.fields.some(
      (v) => v.fieldId === oidcField.fieldId,
    ),
  )
  await admin
    .getByRole('dialog')
    .getByLabel('确认删除此字段，立即停止暴露', { exact: true })
    .check()
  await admin.getByRole('dialog').getByRole('button', { name: '删除字段', exact: true }).click()
  await admin.locator('#attribute-name:enabled').waitFor()
  assert.ok(
    !(await api(alice, '/api/v1/user-profiles/me')).value.fields.some(
      (v) => v.fieldId === oidcField.fieldId,
    ),
  )
  checks.push('sensitive-preview-upstream-delete-disable-delete')
  assert.equal((await api(alice, base + '/profile')).status, 404)
  assert.deepEqual(errors, [])
  result = 'passed'
} catch (error) {
  console.error(JSON.stringify({ phase, result: 'failed', classification: error.name }))
  process.exitCode = 1
} finally {
  clearTimeout(timer)
  try {
    await stop()
  } catch {
    result = 'failed'
    process.exitCode = 1
  }
  console.log(
    JSON.stringify({
      phase: 'profiles-browser',
      result,
      checks,
      backendRevision: f.backendRevision,
      identityRevision: f.identityRevision,
    }),
  )
}
