// Production UI + real disposable HTTPS MDM; no credential, body or browser trace output.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import process from 'node:process'
import {
  chooseOption,
  selectedValue,
  pageAlert,
  submitForm,
  waitForPageIdle,
} from './vuetify-policy-controls.mjs'
let browser, context, page, fixture, origin
let phase = 'environment',
  result = 'failed',
  cleanup = 'passed'
const journeys = []
let diagnostic
const failedStatuses = []
let writes = 0,
  interrupted = false
async function stop() {
  interrupted = true
  await browser?.close().catch(() => {})
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
const deadline = setTimeout(stop, 180000)
async function read(id) {
  const response = await context.request.get(`${origin}/api/v1/policies/${id}`)
  assert.equal(response.status(), 200)
  const policy = await response.json()
  assert.ok(['enabled', 'disabled', 'archived'].includes(policy.state), 'Current Policy wire state')
  return { ...policy, enabled: policy.state === 'enabled' }
}
async function headers() {
  const response = await context.request.get(
    `${origin}/api/v1/identity/tenants/${fixture.tenant}/session`,
  )
  assert.equal(response.status(), 200)
  return {
    Origin: origin,
    'X-Identity-Request': '1',
    'X-CSRF-Token': (await response.json()).csrfToken,
  }
}
async function put(policy, definition = policy.definition, expectedRevision = policy.revision) {
  return context.request.post(`${origin}/api/v1/policies/${policy.id}`, {
    headers: await headers(),
    data: {
      operationId: randomUUID(),
      expectedRevision,
      input: { action: 'put', definition, enabled: policy.enabled },
    },
  })
}
const accessLabels = {
  device: '不需要企业登录：此设备可用',
  authenticated_user: '需要企业登录：当前租户全部企业用户',
  users: '需要企业登录：指定用户范围',
}
const selectorLabels = {
  user: '企业用户',
  user_group: '静态用户组',
  department: '部门',
  idp_group: 'IdP 组',
}
const access = () => page.locator('[data-field="access"]')
const published = () => page.locator('[data-field="published"]').getByRole('checkbox')
async function bindScript() {
  if (new URL(page.url()).searchParams.get('action') === 'software') return
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      /\/api\/v1\/resources\/[^/]+$/.test(new URL(r.url()).pathname),
  )
  await page.getByRole('button', { name: '加载资源版本', exact: true }).click()
  assert.equal((await response).status(), 200)
  await waitForPageIdle(page)
  assert.notEqual(await selectedValue(page.locator('#policy-variant')), '-1')
}
async function prepareSave(form) {
  if (!form.includes('deployment')) return
  for (let step = 0; step < 3; step++) {
    const next = page.getByRole('button', { name: '下一步', exact: true })
    if (!(await next.isVisible())) break
    await next.click()
  }
  await page.getByRole('button', { name: '预览目标准入', exact: true }).click()
  await waitForPageIdle(page)
}
async function save(id, form) {
  await bindScript()
  assert.deepEqual(
    await page
      .locator(form)
      .evaluate((f) =>
        [...f.elements].filter((e) => e.willValidate && !e.validity.valid).map((e) => e.id),
      ),
    [],
  )
  const response = page.waitForResponse(
    (r) => r.url() === `${origin}/api/v1/policies/${id}` && r.request().method() === 'POST',
  )
  await prepareSave(form)
  await submitForm(page, form)
  assert.equal((await response).status(), 200)
  await waitForPageIdle(page)
  return read(id)
}
async function open(id, software = false) {
  await page.goto(
    `${origin}/tenants/${fixture.tenant}/policies?id=${id}${software ? '&action=software' : ''}`,
  )
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await access().waitFor()
  await bindScript()
  await page
    .locator('[data-section="resource-identity"]')
    .getByText(/系统服务|本机登录用户/)
    .waitFor()
}
async function refresh(kind) {
  await page.reload()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await access().waitFor()
  await bindScript()
  assert.equal(await selectedValue(access()), kind)
}
async function principalName(principal) {
  let cursor
  for (let directoryPage = 0; directoryPage < 64; directoryPage++) {
    const response = await context.request.get(
      `${origin}/api/v1/identity/tenants/${fixture.tenant}/accounts${cursor ? '?cursor=' + encodeURIComponent(cursor) : ''}`,
      { headers: { 'X-Identity-Request': '1' } },
    )
    assert.equal(response.status(), 200)
    const directory = await response.json()
    const account = directory.accounts.find((account) => account.principalId === principal)
    if (account) {
      assert.equal(account.enabled, true)
      assert.equal(account.memberActive, true)
      return account.login ?? '已关联组织人员'
    }
    cursor = directory.nextCursor
    if (!cursor) break
  }
  throw new Error('Fixed principal is unavailable in the authorized account directory')
}
async function userGroupName(id) {
  const response = await context.request.get(`${origin}/api/v1/authorization/user-groups/${id}`)
  assert.equal(response.status(), 200)
  const group = await response.json()
  assert.equal(group.id, id)
  assert.equal(group.value?.enabled, true)
  return group.value.name
}
async function departmentName(selection) {
  const response = await context.request.get(`${origin}/api/v1/authorization/departments`)
  assert.equal(response.status(), 200)
  const directory = await response.json()
  assert.equal(directory.status, 'available')
  assert.deepEqual(directory.source, selection.source)
  const node = directory.snapshot.nodes.find((node) => node.id === selection.id)
  assert.ok(node, 'Fixed department must exist in the authoritative directory')
  return node.displayName
}
async function login(account = fixture) {
  await page.goto(`${origin}/login`)
  await page.locator('#login-name').fill(account.login)
  await page.locator('#login-password').fill(readFileSync(account.passwordFile, 'utf8').trim())
  await page.locator('form button[type=submit]').click()
  await page.waitForURL((url) => /\/(?:workspace|settings\/guide)$/.test(url.pathname))
}
try {
  fixture = JSON.parse(readFileSync(process.env.MDM_POLICY_BROWSER_FIXTURE, 'utf8'))
  const url = new URL(fixture.origin)
  assert.equal(url.protocol, 'https:')
  assert.equal(url.hostname, 'localhost')
  assert.equal(url.origin, fixture.origin)
  origin = url.origin
  browser = await chromium.launch()
  context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN' })
  page = await context.newPage()
  page.setDefaultTimeout(10000)
  page.on('response', (response) => {
    if (response.status() >= 400) failedStatuses.push(response.status())
  })
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/api\/v1\/policies\//.test(request.url())) writes++
  })
  phase = 'login'
  await login()
  for (const software of [false, true]) {
    const id = software ? fixture.software : fixture.script
    const form = `[data-form="${software ? 'deployment' : 'policy'}"]`
    phase = `${software ? 'software' : 'script'}-device`
    await open(id, software)
    const before = await read(id)
    if (!software) {
      assert.equal(before.definition.selfService.access, null)
      assert.equal(before.definition.selfService.published, false)
      assert.equal(await page.locator('[data-field="access-required"]').count(), 1)
    }
    assert.equal(await page.locator('[data-field="riskLevel"]').count(), 1)
    await chooseOption(page, page.locator('[data-field="riskLevel"]'), '1：规则内直接执行')
    await chooseOption(page, access(), accessLabels.device)
    await published().check()
    let saved = await save(id, form)
    assert.deepEqual(saved.definition.selfService.access, { kind: 'device' })
    assert.equal(saved.definition.selfService.allowAi, before.definition.selfService.allowAi)
    assert.equal(saved.definition.selfService.riskLevel, 1)
    assert.equal(saved.versionId, before.versionId)
    assert.deepEqual(saved.definition.action, before.definition.action)
    assert.equal(saved.definition.scope, before.definition.scope)
    await refresh('device')
    journeys.push(phase)
    phase = `${software ? 'software' : 'script'}-authenticated-user`
    await chooseOption(page, access(), accessLabels.authenticated_user)
    saved = await save(id, form)
    assert.deepEqual(saved.definition.selfService.access, { kind: 'authenticated_user' })
    await refresh('authenticated_user')
    journeys.push(phase)
    phase = `${software ? 'software' : 'script'}-empty-users`
    await chooseOption(page, access(), accessLabels.users)
    const count = writes
    await prepareSave(form)
    if (software)
      assert.equal(await page.locator(form).locator('button[type=submit]').isDisabled(), true)
    else await submitForm(page, form)
    await pageAlert(page).waitFor()
    assert.equal(writes, count)
    assert.equal((await read(id)).revision, saved.revision)
    journeys.push(phase)
    if (software) {
      // The rejected preview leaves the draft on the review step. Return through
      // the actual controls; do not depend on the department fallback reloading.
      for (let step = 0; step < 3; step++)
        await page.getByRole('button', { name: '上一步', exact: true }).click()
      await page.locator('[data-field="access"]').waitFor({ state: 'visible' })
      assert.equal(
        await page.locator('[data-field="access"] input[role=combobox]').isEnabled(),
        true,
      )
    }
    phase = `${software ? 'software' : 'script'}-users`
    // Seed fixed department references via the real API when this local login has no IdP directory.
    // The UI must preserve and identify them; a federated fixture can instead select them live.
    const departments = fixture.selectors.filter((s) => s.kind === 'department')
    if (departments.length && !fixture.departmentDirectory) {
      const response = await put(saved, {
        ...saved.definition,
        selfService: {
          ...saved.definition.selfService,
          access: { kind: 'users', selectors: departments },
        },
      })
      assert.equal(response.status(), 200)
      await refresh('users')
    }
    const selectors = page
      .locator('fieldset')
      .filter({ has: page.locator('input[role="combobox"][id$="-kind"]') })
      .last()
    await chooseOption(
      page,
      selectors.getByRole('combobox', { name: '用户', exact: true }),
      await principalName(fixture.principal),
      { loadMore: selectors.getByRole('button', { name: '加载更多用户', exact: true }) },
    )
    await selectors.getByRole('button', { name: '添加', exact: true }).click()
    for (const selection of fixture.selectors.filter(
      (s) => fixture.departmentDirectory || s.kind !== 'department',
    )) {
      await chooseOption(
        page,
        selectors.locator('input[id$="-kind"]'),
        selectorLabels[selection.kind],
      )
      if (selection.kind === 'idp_group') {
        for (const [suffix, value] of Object.entries({
          'group-id': selection.id,
          provider: selection.source.providerId,
          issuer: selection.source.issuer,
          'configuration-version': selection.source.configurationVersion,
        }))
          await selectors.locator(`input[id$="-${suffix}"]`).fill(String(value))
      } else if (selection.kind === 'user_group') {
        await chooseOption(
          page,
          selectors.locator('input[id$="-group"]'),
          await userGroupName(selection.id),
          {
            loadMore: selectors.getByRole('button', { name: '下一页', exact: true }),
          },
        )
      } else {
        await chooseOption(
          page,
          selectors.locator('input[id$="-department"]'),
          await departmentName(selection),
        )
        await chooseOption(
          page,
          selectors.locator('input[id$="-matching"]'),
          selection.matching === 'subtree' ? '此部门及子部门' : '仅此部门',
        )
      }
      await selectors.getByRole('button', { name: '添加', exact: true }).click()
    }
    saved = await save(id, form)
    const user = {
      kind: 'user',
      instanceId: fixture.instance,
      tenantId: fixture.tenant,
      principalId: fixture.principal,
    }
    const key = (s) =>
      [s.kind, s.id ?? s.principalId, s.matching ?? '', s.source?.providerId ?? s.instanceId].join(
        '/',
      )
    const sorted = (items) => items.toSorted((a, b) => key(a).localeCompare(key(b)))
    const expected = sorted([user, ...fixture.selectors])
    assert.deepEqual(sorted(saved.definition.selfService.access.selectors), expected)
    await refresh('users')
    assert.equal(
      (await page.locator('li').filter({ hasText: fixture.principal }).count()) > 0,
      true,
    )
    journeys.push(phase)
    phase = `${software ? 'software' : 'script'}-withdrawal`
    await published().uncheck()
    saved = await save(id, form)
    assert.equal(saved.definition.selfService.published, false)
    assert.equal(saved.enabled, before.enabled)
    assert.deepEqual(saved.definition.action.schedule, before.definition.action.schedule)
    assert.equal(saved.versionId, before.versionId)
    await refresh('users')
    journeys.push(phase)
    phase = `${software ? 'software' : 'script'}-conflict`
    const other = await put(saved)
    assert.equal(other.status(), 200)
    const conflict = page.waitForResponse(
      (r) => r.url() === `${origin}/api/v1/policies/${id}` && r.request().method() === 'POST',
    )
    const n = writes
    await prepareSave(form)
    await submitForm(page, form)
    assert.equal((await conflict).status(), 409)
    await pageAlert(page).waitFor()
    assert.equal(writes, n + 1)
    await refresh('users')
    journeys.push(phase)
  }
  phase = 'invalid-selector-coordinates'
  const policy = await read(fixture.script)
  for (const selector of [
    {
      kind: 'user',
      instanceId: fixture.instance,
      tenantId: randomUUID(),
      principalId: fixture.principal,
    },
    {
      kind: 'idp_group',
      id: 'employees',
      source: { ...fixture.selectors.find((s) => s.source).source, configurationVersion: 0 },
    },
  ]) {
    const invalid = await put(policy, {
      ...policy.definition,
      selfService: {
        ...policy.definition.selfService,
        access: { kind: 'users', selectors: [selector] },
      },
    })
    assert.equal(invalid.status(), 400)
  }
  journeys.push(phase)
  phase = 'explicit-intent-removal'
  await open(fixture.software, true)
  await chooseOption(page, page.locator('#deployment-intent'), '必须安装')
  assert.equal(await selectedValue(page.locator('#deployment-intent')), 'available_install')
  journeys.push(phase)
  phase = 'unknown-no-auto-replay'
  const beforeUnknown = await read(fixture.software)
  let committedRevision
  await page.route(`**/api/v1/policies/${fixture.software}`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    committedRevision = (await response.json()).revision
    await route.abort('connectionreset')
  })
  const count = writes
  await prepareSave('[data-form="deployment"]')
  await submitForm(page, '[data-form="deployment"]')
  await pageAlert(page).waitFor()
  await page.getByRole('status').filter({ hasText: '提交结果仍未知' }).waitFor()
  await page.locator('[data-action="read-policy"]').click()
  await page.waitForFunction(
    () => !document.querySelector('.console-page')?.getAttribute('aria-busy')?.includes('true'),
  )
  assert.equal(writes, count + 1)
  assert.equal(committedRevision, beforeUnknown.revision + 1)
  assert.equal((await read(fixture.software)).revision, committedRevision)
  assert.equal(
    await page.locator('[data-form="deployment"] > fieldset').evaluate((f) => f.disabled),
    true,
  )
  journeys.push(phase)
  await page.unrouteAll()
  phase = 'expired-session-no-replay'
  await open(fixture.script)
  const logout = await context.request.post(
    `${origin}/api/v1/identity/tenants/${fixture.tenant}/session/logout`,
    { headers: await headers() },
  )
  assert.equal(logout.ok(), true)
  const expired = page.waitForResponse(
    (r) =>
      r.url() === `${origin}/api/v1/policies/${fixture.script}` && r.request().method() === 'POST',
  )
  const n = writes
  await submitForm(page, '[data-form="policy"]')
  assert.equal((await expired).status(), 401)
  await page.waitForURL(/login/)
  assert.equal(writes, n + 1)
  journeys.push(phase)
  phase = 'read-only-account-denied'
  await login(fixture.reader)
  await open(fixture.script)
  const denied = page.waitForResponse(
    (r) =>
      r.url() === `${origin}/api/v1/policies/${fixture.script}` && r.request().method() === 'POST',
  )
  const m = writes
  await submitForm(page, '[data-form="policy"]')
  assert.equal((await denied).status(), 403)
  await pageAlert(page).waitFor()
  assert.equal(writes, m + 1)
  journeys.push(phase)
  result = 'passed'
} catch (error) {
  const line = error.stack?.match(/policy-browser\.mjs:(\d+)/)?.[1]
  diagnostic = {
    category:
      error instanceof assert.AssertionError
        ? 'assertion'
        : error.name === 'TimeoutError'
          ? 'timeout'
          : 'environment',
    ...(line ? { line: Number(line) } : {}),
    httpStatuses: failedStatuses.slice(-4),

    alerts: page
      ? (
          await page
            .locator('.console-page > .v-alert[role="alert"]')
            .allTextContents()
            .catch(() => [])
        ).map((s) => (s.includes('请求') ? 'request' : s.includes('资源') ? 'resource' : 'other'))
      : [],
  }
  result = 'failed'
} finally {
  clearTimeout(deadline)
  process.removeListener('SIGINT', stop)
  process.removeListener('SIGTERM', stop)
  for (const resource of [context, browser]) {
    try {
      await resource?.close()
    } catch {
      cleanup = 'failed'
    }
  }
}
if (interrupted || cleanup !== 'passed') result = 'failed'
console.log(
  JSON.stringify({
    result,
    ...(result === 'failed' ? { phase, interrupted, diagnostic } : {}),
    journeys,
    cleanup,
  }),
)
if (result !== 'passed') process.exitCode = 1
