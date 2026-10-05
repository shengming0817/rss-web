// Runs the production app against a disposable, real HTTPS MDM fixture.
// Fixture credentials remain in memory; no traces, screenshots or response bodies are persisted.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import process from 'node:process'
const fixture = JSON.parse(readFileSync(process.env.MDM_POLICY_BROWSER_FIXTURE, 'utf8'))
const origin = new URL(fixture.origin)
assert.equal(origin.protocol, 'https:')
assert.equal(origin.hostname, 'localhost')
assert.equal(origin.origin, fixture.origin)
const browser = await chromium.launch()
const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN' })
const page = await context.newPage()
page.setDefaultTimeout(10000)
let phase = 'login'
const results = []
let writes = 0
page.on('request', (request) => {
  if (request.method() === 'POST' && /\/api\/v1\/policies\//.test(request.url())) writes++
})
async function read(id) {
  const response = await context.request.get(`${origin}/api/v1/policies/${id}`)
  assert.equal(response.status(), 200)
  return response.json()
}
async function save(id, form) {
  const response = page.waitForResponse((r) => r.url() === `${origin}/api/v1/policies/${id}` && r.request().method() === 'POST')
  await page.locator(form).evaluate((f) => f.requestSubmit())
  assert.equal((await response).status(), 200)
  await page.waitForFunction((selector) => !document.querySelector(`${selector} > fieldset`)?.disabled, form)
  return read(id)
}
async function open(id, software = false) {
  await page.goto(`${origin}/tenants/${fixture.tenant}/${software ? 'software/deployments' : 'policies/assignments'}?id=${id}`)
  await page.locator('[data-field="access"]').waitFor()
}
try {
  await page.goto(`${origin}/tenants/${fixture.tenant}/login`)
  await page.locator('#login-name').fill(fixture.login)
  await page.locator('#login-password').fill(readFileSync(fixture.passwordFile, 'utf8').trim())
  await page.locator('form').evaluate((f) => f.requestSubmit())
  await page.waitForURL(/workspace/)
  phase = 'migrated-device'
  await open(fixture.script)
  const before = await read(fixture.script)
  assert.equal(before.definition.selfService.access, null)
  assert.equal(before.definition.selfService.published, false)
  assert.equal(await page.locator('[data-field="access-required"]').count(), 1)
  await page.locator('[data-field="access"]').selectOption('device')
  await page.locator('[data-field="published"]').check()
  let saved = await save(fixture.script, '[data-form="policy"]')
  assert.deepEqual(saved.definition.selfService.access, { kind: 'device' })
  assert.equal(saved.definition.selfService.allowAi, false)
  assert.equal(saved.definition.selfService.riskLevel, 1)
  assert.equal(saved.versionId, before.versionId)
  assert.deepEqual(saved.definition.action, before.definition.action)
  assert.equal(saved.definition.scope, before.definition.scope)
  results.push(phase)
  phase = 'authenticated-user'
  await page.locator('[data-field="access"]').selectOption('authenticated_user')
  saved = await save(fixture.script, '[data-form="policy"]')
  assert.deepEqual(saved.definition.selfService.access, { kind: 'authenticated_user' })
  results.push(phase)
  phase = 'users'
  await page.locator('[data-field="access"]').selectOption('users')
  const selectors = page.locator('fieldset').filter({ has: page.locator('select[id$="-kind"]') }).last()
  await selectors.locator('select[id$="-kind"]').selectOption('user')
  await selectors.locator('select').nth(1).selectOption(fixture.principal)
  await selectors.getByRole('button', { name: '添加', exact: true }).click()
  for (const selection of fixture.selectors) {
    await selectors.locator('select[id$="-kind"]').selectOption(selection.kind)
    if (selection.kind === 'idp_group') {
      for (const [suffix, value] of Object.entries({ 'group-id': selection.id, provider: selection.source.providerId, issuer: selection.source.issuer, 'configuration-version': selection.source.configurationVersion }))
        await selectors.locator(`input[id$="-${suffix}"]`).fill(String(value))
    } else if (selection.kind === 'user_group') await selectors.locator('select[id$="-group"]').selectOption(selection.id)
    else {
      await selectors.locator('select[id$="-department"]').selectOption(selection.id)
      await selectors.locator('select[id$="-matching"]').selectOption(selection.matching)
    }
    await selectors.getByRole('button', { name: '添加', exact: true }).click()
  }
  saved = await save(fixture.script, '[data-form="policy"]')
  assert.deepEqual(saved.definition.selfService.access, { kind: 'users', selectors: [{ kind: 'user', instanceId: fixture.instance, tenantId: fixture.tenant, principalId: fixture.principal }, ...fixture.selectors] })
  results.push(phase)
  phase = 'software-available-install'
  await open(fixture.software, true)
  assert.equal(await page.locator('[data-field="riskLevel"]').count(), 0)
  await page.locator('[data-field="access"]').selectOption('device')
  saved = await save(fixture.software, '[data-form="deployment"]')
  assert.equal(saved.definition.action.intent, 'available_install')
  assert.equal(saved.definition.selfService.riskLevel, 2)
  await page.locator('#deployment-intent').selectOption('required_install')
  assert.equal(await page.locator('#deployment-intent').inputValue(), 'available_install')
  results.push(phase)
  phase = 'unknown-no-auto-replay'
  await page.route(`**/api/v1/policies/${fixture.software}`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    // The real server commits; only the response is lost.
    await route.fetch()
    await route.abort('connectionreset')
  })
  const count = writes
  await page.locator('[data-form="deployment"]').evaluate((f) => f.requestSubmit())
  await page.waitForFunction(() => document.querySelector('[data-form="deployment"] > fieldset')?.disabled)
  await page.locator('[data-action="read-policy"]').click()
  await page.locator('#deployment-resource').waitFor()
  assert.equal(writes, count + 1)
  assert.equal(await page.locator('[data-form="deployment"] > fieldset').isDisabled(), true)
  results.push(phase)
  console.log(JSON.stringify({ result: 'passed', journeys: results }))
} catch {
  console.error(JSON.stringify({ result: 'failed', phase, journeys: results }))
  process.exitCode = 1
} finally {
  await context.close()
  await browser.close()
}
