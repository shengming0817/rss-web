// Production UI + real disposable HTTPS MDM; no credential, body or browser trace output.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import process from 'node:process'
let browser, context, page, fixture, origin
let phase = 'environment',
  result = 'failed',
  cleanup = 'passed'
const journeys = []
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
  return response.json()
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
async function save(id, form) {
  const response = page.waitForResponse(
    (r) => r.url() === `${origin}/api/v1/policies/${id}` && r.request().method() === 'POST',
  )
  await page.locator(form).evaluate((f) => f.requestSubmit())
  assert.equal((await response).status(), 200)
  await page.waitForFunction(
    (selector) => !document.querySelector(`${selector} > fieldset`)?.disabled,
    form,
  )
  return read(id)
}
async function open(id, software = false) {
  await page.goto(
    `${origin}/tenants/${fixture.tenant}/${software ? 'software/deployments' : 'policies/assignments'}?id=${id}`,
  )
  await page.locator('[data-field="access"]').waitFor()
  await page
    .locator('[data-section="resource-identity"]')
    .getByText(/系统服务|本机登录用户/)
    .waitFor()
}
async function refresh(kind) {
  await page.reload()
  await page.locator('[data-field="access"]').waitFor()
  assert.equal(await page.locator('[data-field="access"]').inputValue(), kind)
}
async function login(account = fixture) {
  await page.goto(`${origin}/tenants/${fixture.tenant}/login`)
  await page.locator('#login-name').fill(account.login)
  await page.locator('#login-password').fill(readFileSync(account.passwordFile, 'utf8').trim())
  await page.locator('form').evaluate((f) => f.requestSubmit())
  await page.waitForURL(/workspace/)
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
    } else assert.equal(await page.locator('[data-field="riskLevel"]').count(), 0)
    await page.locator('[data-field="access"]').selectOption('device')
    await page.locator('[data-field="published"]').check()
    let saved = await save(id, form)
    assert.deepEqual(saved.definition.selfService.access, { kind: 'device' })
    assert.equal(saved.definition.selfService.allowAi, before.definition.selfService.allowAi)
    assert.equal(saved.definition.selfService.riskLevel, software ? 2 : 1)
    assert.equal(saved.versionId, before.versionId)
    assert.deepEqual(saved.definition.action, before.definition.action)
    assert.equal(saved.definition.scope, before.definition.scope)
    await refresh('device')
    journeys.push(phase)
    phase = `${software ? 'software' : 'script'}-authenticated-user`
    await page.locator('[data-field="access"]').selectOption('authenticated_user')
    saved = await save(id, form)
    assert.deepEqual(saved.definition.selfService.access, { kind: 'authenticated_user' })
    await refresh('authenticated_user')
    journeys.push(phase)
    phase = `${software ? 'software' : 'script'}-empty-users`
    await page.locator('[data-field="access"]').selectOption('users')
    const count = writes
    await page.locator(form).evaluate((f) => f.requestSubmit())
    await page.locator('.device-console > [role="alert"]').waitFor()
    assert.equal(writes, count)
    assert.equal((await read(id)).revision, saved.revision)
    journeys.push(phase)
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
      .filter({ has: page.locator('select[id$="-kind"]') })
      .last()
    await selectors.locator('select').nth(1).selectOption(fixture.principal)
    await selectors.getByRole('button', { name: '添加', exact: true }).click()
    for (const selection of fixture.selectors.filter(
      (s) => fixture.departmentDirectory || s.kind !== 'department',
    )) {
      await selectors.locator('select[id$="-kind"]').selectOption(selection.kind)
      if (selection.kind === 'idp_group') {
        for (const [suffix, value] of Object.entries({
          'group-id': selection.id,
          provider: selection.source.providerId,
          issuer: selection.source.issuer,
          'configuration-version': selection.source.configurationVersion,
        }))
          await selectors.locator(`input[id$="-${suffix}"]`).fill(String(value))
      } else if (selection.kind === 'user_group')
        await selectors.locator('select[id$="-group"]').selectOption(selection.id)
      else {
        await selectors.locator('select[id$="-department"]').selectOption(selection.id)
        await selectors.locator('select[id$="-matching"]').selectOption(selection.matching)
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
    const expected = [user, ...fixture.selectors].map((s) => JSON.stringify(s)).sort()
    assert.deepEqual(
      saved.definition.selfService.access.selectors.map((s) => JSON.stringify(s)).sort(),
      expected,
    )
    await refresh('users')
    assert.equal(
      (await page.locator('li').filter({ hasText: fixture.principal }).count()) > 0,
      true,
    )
    journeys.push(phase)
    phase = `${software ? 'software' : 'script'}-withdrawal`
    await page.locator('[data-field="published"]').uncheck()
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
    await page.locator(form).evaluate((f) => f.requestSubmit())
    assert.equal((await conflict).status(), 409)
    await page.locator('.device-console > [role="alert"]').waitFor()
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
  await page.locator('#deployment-intent').selectOption('required_install')
  assert.equal(await page.locator('#deployment-intent').inputValue(), 'available_install')
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
  await page.locator('[data-form="deployment"]').evaluate((f) => f.requestSubmit())
  await page.locator('.device-console > [role="alert"]').waitFor()
  await page.locator('[data-action="read-policy"]').click()
  await page.waitForFunction(
    () => !document.querySelector('.device-console')?.getAttribute('aria-busy')?.includes('true'),
  )
  assert.equal(writes, count + 1)
  assert.equal(committedRevision, beforeUnknown.revision + 1)
  assert.equal((await read(fixture.software)).revision, committedRevision)
  assert.equal(await page.locator('[data-form="deployment"] > fieldset').isDisabled(), true)
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
  await page.locator('[data-form="policy"]').evaluate((f) => f.requestSubmit())
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
  await page.locator('[data-form="policy"]').evaluate((f) => f.requestSubmit())
  assert.equal((await denied).status(), 403)
  await page.locator('.device-console > [role="alert"]').waitFor()
  assert.equal(writes, m + 1)
  journeys.push(phase)
  result = 'passed'
} catch {
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
    ...(result === 'failed' ? { phase, interrupted } : {}),
    journeys,
    cleanup,
  }),
)
if (result !== 'passed') process.exitCode = 1
