// Extends the existing settings HTTPS journey; all mutations reach the actual backend.
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
export async function authorizationJourney({
  page,
  context,
  origin,
  fixture: f,
  login,
  password,
  coverage,
}) {
  const prefix = '/api/v1/tenant-administration/authorization',
    url = `${origin}/tenants/${f.managementTenant}/operations/authorization`,
    prepared = f.authorization,
    target = prepared.accounts['authorization-target']
  const secret = (account) => {
    assert.equal(statSync(account.passwordFile).mode & 0o077, 0)
    return readFileSync(account.passwordFile, 'utf8').trim()
  }
  async function api(method, path, data, tenant = f.managementTenant) {
    const session = await context.request.get(`${origin}/api/v1/identity/tenants/${tenant}/session`)
    assert.equal(session.status(), 200)
    const csrf = (await session.json()).csrfToken
    return context.request.fetch(origin + path, {
      method,
      data,
      headers: { Origin: origin, 'X-Identity-Request': '1', 'X-CSRF-Token': csrf },
    })
  }
  let activeTenant = f.managementTenant
  async function signIn(tenant, name, secret) {
    const logout = await api(
      'POST',
      `/api/v1/identity/tenants/${activeTenant}/session/logout`,
      undefined,
      activeTenant,
    )
    assert.equal(logout.status(), 204)
    const anonymous = await context.request.get(origin + prefix + '/rules')
    assert.equal(anonymous.status(), 401)
    await login(origin, tenant, name, secret)
    activeTenant = tenant
  }
  const rule = (operations) => ({
    subject: {
      kind: 'user',
      user: {
        instanceId: prepared.instanceId,
        tenantId: f.managementTenant,
        principalId: target.principalId,
      },
    },
    grants: operations.map((operation) => ({ operation, scope: { kind: 'tenant' } })),
  })
  const dialog = () => page.getByRole('dialog')
  async function review() {
    await dialog().getByTestId('review-rule').click()
    await dialog().getByRole('heading', { name: '待提交变更核对', exact: true }).waitFor()
  }
  async function save(status = 200) {
    const response = page.waitForResponse(
      (r) => r.request().method() === 'PUT' && r.url().includes(prefix + '/rules/'),
    )
    await dialog().getByTestId('save-rule').click()
    const r = await response
    assert.equal(r.status(), status)
    return r.json()
  }
  async function close() {
    await dialog().getByRole('button', { name: '关闭', exact: true }).click()
    await dialog().waitFor({ state: 'hidden' })
  }
  await page.goto(url)
  await page.getByRole('heading', { name: '平台授权', exact: true }).waitFor()
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await page.getByText('当前页 2', { exact: true }).waitFor()
  await page.getByRole('button', { name: '上一页', exact: true }).click()
  await page.getByText('当前页 1', { exact: true }).waitFor()
  await page.getByRole('button', { name: '添加授权规则', exact: true }).click()
  await dialog().getByRole('button', { name: '读取已有管理账户', exact: true }).click()
  await dialog()
    .locator('#authorization-principal option')
    .filter({ hasText: target.login })
    .waitFor({ state: 'attached' })
  await dialog().locator('#authorization-principal').selectOption(target.principalId)
  assert.equal(await dialog().locator('.authorization-permissions input[type=checkbox]').count(), 8)
  await dialog().locator('input[value=tenant_read]').check()
  await review()
  const created = await save()
  await close()
  const current = await context.request.get(origin + prefix + '/rules')
  assert.equal(current.status(), 200)
  coverage.push('management-uuid-pagination-existing-account-eight-permissions-review-native-cas')
  // Known row through the supported query locator scans paginated rules; no rule GET is invented.
  await page.goto(url + '?id=' + created.id)
  await dialog().locator('input[value=tenant_update]').check()
  const concurrent = await api('PUT', prefix + '/rules/' + created.id, {
    operationId: randomUUID(),
    expectedRevision: 1,
    value: rule(['tenant_read', 'tenant_delete']),
  })
  assert.equal(concurrent.status(), 200)
  await review()
  await save(409)
  await dialog().getByRole('button', { name: '回读当前规则以核对', exact: true }).click()
  await dialog().getByRole('button', { name: '保留草稿，采用已核对版本', exact: true }).click()
  await review()
  assert.equal((await save()).revision, 3)
  await close()
  coverage.push('real-management-409-compare-current-keep-local-draft-new-operation')
  await page.goto(url + '?id=' + created.id)
  await dialog().locator('input[value=tenant_create]').check()
  await review()
  let original,
    attempts = 0,
    interceptionFailure = false
  const lose = async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue()
      return
    }
    try {
      attempts++
      const input = route.request().postDataJSON()
      if (original) assert.deepEqual(input, original)
      else original = input
      const response = await route.fetch({ timeout: 45000, maxRetries: 0 })
      assert.equal(response.status(), 200)
      await route.abort('failed')
    } catch {
      interceptionFailure = true
      await route.abort('failed').catch(() => {})
    }
  }
  await page.route('**' + prefix + '/rules/*', lose)
  await dialog().getByTestId('save-rule').click()
  await dialog().getByTestId('replay-write').waitFor()
  assert.equal(await dialog().getByTestId('replay-write').isDisabled(), true)
  assert.equal(attempts, 1)
  assert.equal(interceptionFailure, false)
  await close()
  await page.getByRole('link', { name: '设置', exact: true }).click()
  await page.getByRole('link', { name: '平台管理', exact: true }).click()
  await page.getByRole('link', { name: '授权规则', exact: true }).click()
  await dialog().getByTestId('replay-write').waitFor()
  assert.equal(attempts, 1)
  await dialog().getByRole('button', { name: '回读当前规则以核对', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('[data-testid=replay-write]')?.disabled)
  assert.equal(attempts, 1)
  await page.unroute('**' + prefix + '/rules/*', lose)
  const replay = page.waitForRequest(
    (r) => r.method() === 'PUT' && r.url().includes(prefix + '/rules/'),
  )
  const replayReceipt = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && r.url().includes(prefix + '/rules/'),
  )
  await dialog().getByTestId('replay-write').click()
  assert.deepEqual((await replay).postDataJSON(), original)
  assert.equal((await replayReceipt).status(), 200)
  await close()
  coverage.push(
    'real-committed-response-loss-spa-resume-current-read-not-confirmation-explicit-exact-replay',
  )
  await page.goto(url + '?id=' + created.id)
  await dialog().getByRole('button', { name: '确认撤销规则', exact: true }).click()
  assert.equal((await save()).deleted, true)
  await close()
  await page.goto(url + '?id=' + created.id)
  await dialog().getByText('已删除', { exact: true }).waitFor()
  assert.equal(await dialog().getByTestId('review-rule').count(), 0)
  await close()
  await page.goto(url + '?id=' + prepared.initialRule.id)
  await dialog().getByRole('button', { name: '确认撤销规则', exact: true }).click()
  await save(403)
  await dialog()
    .getByText('服务端拒绝了请求。授权及初始主体保护均由服务端核验，当前草稿未被保存。', {
      exact: true,
    })
    .waitFor()
  await close()
  coverage.push('real-delete-tombstone-and-initial-three-core-grant-protection-403')
  const maintainer = prepared.accounts['authorization-maintainer']
  await signIn(f.managementTenant, maintainer.login, secret(maintainer))
  await page.goto(url)
  await page.getByRole('button', { name: '添加授权规则', exact: true }).click()
  assert.equal(
    await dialog().getByRole('button', { name: '读取已有管理账户', exact: true }).count(),
    0,
  )
  const denied = await context.request.get(
    `${origin}/api/v1/identity/tenants/${f.managementTenant}/accounts`,
  )
  assert.equal(denied.status(), 403)
  await dialog().getByText('按主体 UUID 定位（高级）', { exact: true }).click()
  await dialog().locator('#authorization-principal-id').fill(target.principalId)
  await dialog().locator('input[value=tenant_read]').check()
  await review()
  const delegated = await save()
  await close()
  const reader = prepared.accounts['authorization-reader']
  await signIn(f.managementTenant, reader.login, secret(reader))
  await page.goto(url)
  await page.getByText('当前会话没有授权维护许可，页面仅展示可读事实。', { exact: true }).waitFor()
  assert.equal(
    await page.getByRole('button', { name: '添加授权规则', exact: true }).isDisabled(),
    true,
  )
  const readerWrite = await api('PUT', prefix + '/rules/' + delegated.id, {
    operationId: randomUUID(),
    expectedRevision: 1,
    value: null,
  })
  assert.equal(readerWrite.status(), 403)
  const managementBusiness = await context.request.get(origin + '/api/v1/resources')
  assert.ok([401, 403].includes(managementBusiness.status()))
  await signIn(f.tenant, f.login, password)
  const businessManagement = await context.request.get(origin + prefix + '/rules')
  assert.ok([401, 403].includes(businessManagement.status()))
  await signIn(f.managementTenant, f.login, password)
  await page.goto(`${origin}/tenants/${f.managementTenant}/settings`)
  await page.locator('[data-setting]').first().waitFor()
  coverage.push(
    'directory-403-independent-maintainer-manual-existing-principal-reader-403-and-realm-cookie-isolation',
  )
}
