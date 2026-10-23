// Production UI against the actual product, Identity, PostgreSQL and HTTPS gateway.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { randomUUID, createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import assert from 'node:assert/strict'
import process from 'node:process'
let browser,
  phase = 'setup',
  result = 'failed'
const coverage = [],
  errors = []
const stop = () => {
  void browser?.close()
}
process.once('SIGTERM', stop)
process.once('SIGINT', stop)
const timer = setTimeout(stop, 600000)
try {
  const f = JSON.parse(readFileSync(process.env.MDM_DEVICE_BROWSER_FIXTURE, 'utf8')),
    origin = new URL(f.origin).origin
  assert.equal(new URL(origin).protocol, 'https:')
  browser = await chromium.launch()
  const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN' }),
    page = await context.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(e.name))
  let next = 0,
    csrf,
    tenant = f.tenant
  const pace = async () => {
    const at = Math.max(Date.now(), next)
    next = at + 200
    if (at > Date.now()) await new Promise((r) => setTimeout(r, at - Date.now()))
  }
  await context.route('**/api/v1/**', async (r) => {
    await pace()
    await r.continue()
  })
  async function api(path, method = 'GET', data, expected = 200) {
    await pace()
    const response = await context.request.fetch(origin + path, {
      method,
      headers:
        method === 'GET' ? {} : { Origin: origin, 'X-Identity-Request': '1', 'X-CSRF-Token': csrf },
      ...(data === undefined ? {} : { data }),
    })
    assert.equal(response.status(), expected, `${phase}: ${method} ${path.split('?')[0]}`)
    const text = await response.text()
    return text ? JSON.parse(text) : null
  }
  const at = (path, target = tenant) => `${origin}/tenants/${target}/${path}`
  async function login(target) {
    tenant = target
    await page.goto(origin + (target === f.console.managementTenant ? '/platform/login' : '/login'))
    await page.locator('#login-name').fill(f.login)
    await page.locator('#login-password').fill(readFileSync(f.passwordFile, 'utf8').trim())
    const response = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        new URL(r.url()).pathname === `/api/v1/identity/tenants/${target}/login`,
    )
    await page.locator('form').evaluate((form) => form.requestSubmit())
    assert.equal((await response).status(), 200)
    csrf = (await api(`/api/v1/identity/tenants/${target}/session`)).csrfToken
  }
  const ready = () => page.locator('section.console-page:not([aria-busy="true"])').waitFor()
  const mutation = (path, input, revision = 0, expected = 200) =>
    api(path, 'POST', { operationId: randomUUID(), expectedRevision: revision, input }, expected)
  async function until(read, valid) {
    const end = Date.now() + 90000
    while (Date.now() < end) {
      const value = await read()
      if (valid(value)) return value
      await new Promise((r) => setTimeout(r, 500))
    }
    assert.fail(`${phase}: bounded readiness`)
  }
  phase = 'login'
  await login(f.tenant)
  phase = 'credential-materials'
  const mac = await api('/api/v1/devices/fixture-mac'),
    registration = mac.primaryMdmRegistration
  assert.equal(registration.source, 'mdm.apple')
  await page.goto(at('devices/fixture-mac/management'))
  await ready()
  const materials = page.locator('[data-panel="recovery-credentials"]')
  await materials.getByLabel('操作类型', { exact: true }).selectOption('set_recovery_lock')
  await materials.getByLabel('确认对当前目标执行此操作', { exact: true }).check()
  const accepted = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/recovery-credentials/operations'),
  )
  await materials.getByRole('button', { name: '保存', exact: true }).click()
  assert.equal((await accepted).status(), 202)
  await materials.getByRole('button', { name: '读取', exact: true }).click()
  await materials.getByRole('button', { name: '查阅明文', exact: true }).first().waitFor()
  await materials.getByRole('button', { name: '查阅明文', exact: true }).first().click()
  await materials.locator('output').waitFor()
  assert.ok((await materials.locator('output').textContent()).length > 0)
  const displayedSecret = await materials.locator('output').textContent()
  assert.ok(
    !(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).includes(
      displayedSecret,
    ),
  )
  await materials.getByRole('button', { name: '清除明文', exact: true }).click()
  assert.equal(await materials.locator('output').count(), 0)
  coverage.push('direct-disclosure-and-local-secret-clear')
  phase = 'group-and-scope-prerequisites'
  const group = randomUUID()
  await mutation(`/api/v1/groups/${group}`, {
    action: 'create',
    presentation: { name: 'Console membership', description: '' },
    assetContext: 'endpoint',
    criteria: null,
  })
  const membership = await mutation(
    `/api/v1/groups/${group}`,
    { action: 'members', add: [{ kind: 'endpoint', id: f.mdm }], remove: [] },
    1,
    202,
  )
  await until(
    () => api(`/api/v1/groups/${group}/tasks/${membership.task}`),
    (v) => v.status === 'succeeded',
  )
  const scope = randomUUID()
  await mutation(`/api/v1/scopes/${scope}`, {
    action: 'put',
    definition: { targets: [{ kind: 'device', id: f.alone }], limitations: null, exclusions: [] },
  })
  await until(
    () => api(`/api/v1/scopes/${scope}`),
    (v) => v.resolution !== null,
  )
  phase = 'device-read-queries'
  await page.goto(at(`devices/${f.mdm}/management`))
  await ready()
  const queries = page.locator('[data-panel="device-management-queries"]')
  await queries.getByRole('button', { name: '读取', exact: true }).first().click()
  await queries.getByRole('heading', { name: 'Console membership', exact: true }).waitFor()
  await queries.getByRole('button', { name: '读取', exact: true }).nth(1).click()
  await queries.getByText('no_current_registration', { exact: false }).waitFor()
  coverage.push('nonempty-membership-and-no-current-ddm')
  phase = 'retirement-policy'
  await page.goto(at('policies/assignments/lifecycle'))
  await ready()
  const policy = randomUUID()
  await page.getByLabel('策略 ID', { exact: true }).fill(policy)
  await page.getByLabel('设备范围 ID', { exact: true }).fill(scope)
  await page.getByLabel('确认对当前目标执行此操作', { exact: true }).check()
  const saved = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/v1/policies/${policy}`,
  )
  await page.getByRole('button', { name: '保存', exact: true }).click()
  assert.equal((await saved).status(), 200)
  // A genuine concurrent revision makes the current edit stale.
  await mutation(`/api/v1/policies/${policy}`, { action: 'enable' }, 1)
  await page.getByLabel('确认对当前目标执行此操作', { exact: true }).check()
  const conflict = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/v1/policies/${policy}`,
  )
  await page.getByRole('button', { name: '启用', exact: true }).click()
  assert.equal((await conflict).status(), 409)
  await page.getByRole('button', { name: '冲突：重新读取并比较后编辑', exact: true }).click()
  await ready()
  await page.getByLabel('确认对当前目标执行此操作', { exact: true }).check()
  const triggered = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith(`/policies/${policy}/reruns`),
  )
  await page.getByRole('button', { name: '显式触发', exact: true }).click()
  assert.equal((await triggered).status(), 200)
  const assignments = await until(
    () => api(`/api/v1/policies/${policy}/assignments`),
    (v) => v.items.some((i) => i.operationIds.length > 0),
  )
  const retirement = assignments.items.flatMap((i) => i.operationIds)[0]
  await page.getByRole('button', { name: '刷新执行进度', exact: true }).click()
  await page.getByRole('button', { name: retirement, exact: true }).click()
  await page.locator('[data-panel="retirement"]').waitFor()
  assert.ok((await page.locator('[data-panel="retirement"]').textContent()).includes(f.alone))
  coverage.push('policy-retirement-cas-trigger-and-channel-facts')
  phase = 'policy-directory-pagination'
  for (let i = 0; i < 21; i++)
    await mutation(`/api/v1/policies/${randomUUID()}`, {
      action: 'put',
      enabled: false,
      definition: {
        scope,
        action: {
          kind: 'unmanage_device',
          schedule: {
            trigger: { kind: 'manual' },
            misfire: { kind: 'coalesce_one' },
            notBefore: 0,
            until: null,
            jitterSeconds: 0,
            window: null,
          },
          runLifetimeSeconds: 3600,
        },
      },
    })
  await page.goto(at('policies/assignments/lifecycle'))
  await ready()
  await page.getByRole('button', { name: '下一页', exact: true }).first().waitFor()
  const firstIds = await page.locator('ul').first().textContent()
  await page.getByRole('button', { name: '下一页', exact: true }).first().click()
  await ready()
  assert.notEqual(await page.locator('ul').first().textContent(), firstIds)
  coverage.push('opaque-policy-directory-pagination')
  phase = 'exact-script-download'
  const resource = randomUUID(),
    upload = randomUUID(),
    bytes = Buffer.from('#!/bin/sh\necho console-fixture\n'),
    digest = [...createHash('sha256').update(bytes).digest()]
  await mutation(`/api/v1/resources/${resource}`, { action: 'create', kind: 'script' })
  await mutation(
    `/api/v1/resources/${resource}`,
    {
      action: 'version',
      kind: 'script',
      version: '1',
      variants: [
        {
          platform: 'macos',
          architecture: 'aarch64',
          key: 'default',
          declaration: {
            kind: 'script',
            artifact: { reference: 'console.sh', length: bytes.length, sha256: digest },
            definition: {
              profile: 'posix_sh',
              sql: null,
              runAs: 'system',
              encoding: 'utf8',
              parameters: { type: 'object', properties: {}, additionalProperties: false },
              bindings: {},
              output: { type: 'object' },
              purpose: { kind: 'action' },
              timeoutSeconds: 30,
              outputBytes: 1024,
              maxRows: 1,
            },
          },
        },
      ],
    },
    1,
  )
  await api(
    `/api/v1/resources/${resource}/uploads/${upload}?version=1&platform=macos&architecture=aarch64&variant=default`,
    'POST',
  )
  await pace()
  const appended = await context.request.patch(
    origin + `/api/v1/resources/${resource}/uploads/${upload}?offset=0`,
    {
      headers: {
        Origin: origin,
        'X-Identity-Request': '1',
        'X-CSRF-Token': csrf,
        'Content-Type': 'application/octet-stream',
      },
      data: bytes,
    },
  )
  assert.equal(appended.status(), 200)
  await api(`/api/v1/resources/${resource}/uploads/${upload}/complete`, 'POST', undefined, 201)
  await mutation(`/api/v1/resources/${resource}`, { action: 'activate', version: '1' }, 2)
  await page.goto(at('policies/resources') + '?resource=' + resource)
  await ready()
  const request = page.waitForRequest(
    (r) => new URL(r.url()).pathname === `/api/v1/resources/${resource}/versions/1/script`,
  )
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /^下载此版本脚本/ }).click()
  const savedDownload = await download
  const requested = new URL((await request).url())
  assert.deepEqual(Object.fromEntries(requested.searchParams), {
    platform: 'macos',
    architecture: 'aarch64',
    variant: 'default',
  })
  assert.equal(savedDownload.suggestedFilename(), 'script.txt')
  assert.deepEqual(readFileSync(await savedDownload.path()), bytes)
  await savedDownload.delete()
  coverage.push('exact-script-version-download')
  phase = 'software-channel-default'
  const capabilities = await api('/api/v1/policies/capabilities')
  assert.deepEqual(capabilities, {
    defaultSoftwareChannel: 'agent',
    mdmSoftwareDistributionEnabled: false,
  })
  await page.goto(at('software/deployments'))
  await ready()
  await page.getByRole('button', { name: '新建', exact: true }).first().click()
  await page.locator('#deployment-channel').waitFor()
  assert.equal(await page.locator('#deployment-channel').inputValue(), 'agent')
  assert.equal(await page.locator('#deployment-channel option[value="mdm"]').isDisabled(), true)
  coverage.push('server-owned-disabled-mdm-and-agent-default')
  phase = 'webhook-original-operation'
  await page.goto(at('settings/integrations'))
  await ready()
  const hooks = page.locator('[data-panel="webhooks"]'),
    sub = randomUUID()
  await hooks.getByRole('button', { name: '读取', exact: true }).first().click()
  await hooks.getByLabel('订阅', { exact: true }).fill(sub)
  await hooks.getByLabel('名称', { exact: true }).fill('Console receiver')
  await hooks.getByLabel('HTTPS 目标', { exact: true }).fill(f.console.webhookOrigin + '/events')
  await hooks.getByLabel('device.retired', { exact: true }).check()
  await hooks.getByLabel('目标 ID（每行一个）', { exact: true }).fill(f.mdm)
  await hooks.getByLabel('签名密钥引用', { exact: true }).fill('console')
  await hooks.getByLabel('网络限制引用', { exact: true }).fill('console')
  let original, resent
  const pattern = `**/api/v1/webhooks/subscriptions/${sub}`
  const lose = async (route) => {
    if (route.request().method() !== 'PUT') return route.continue()
    original = route.request().postDataJSON()
    const response = await route.fetch({ maxRetries: 0 })
    assert.equal(response.status(), 200)
    await context.unroute(pattern, lose)
    await route.abort('failed')
  }
  await context.route(pattern, lose)
  await hooks.getByLabel('确认对当前目标执行此操作', { exact: true }).first().check()
  await hooks.getByRole('button', { name: '保存', exact: true }).click()
  await hooks.getByRole('button', { name: '重送原请求', exact: true }).waitFor()
  await page.goto(at('settings/access'))
  await ready()
  await page.goto(at('settings/integrations'))
  await ready()
  await hooks.getByRole('button', { name: '重送原请求', exact: true }).waitFor()
  const capture = (r) => {
    if (r.method() === 'PUT' && new URL(r.url()).pathname.endsWith(sub)) resent = r.postDataJSON()
  }
  page.on('request', capture)
  await hooks.getByLabel('确认对当前目标执行此操作', { exact: true }).last().check()
  await hooks.getByRole('button', { name: '重送原请求', exact: true }).click()
  await hooks.getByRole('button', { name: '启用', exact: true }).waitFor()
  page.off('request', capture)
  assert.deepEqual(resent, original)
  await hooks.getByLabel('确认对当前目标执行此操作', { exact: true }).first().check()
  const enabled = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && r.url().endsWith(sub),
  )
  await hooks.getByRole('button', { name: '启用', exact: true }).click()
  assert.equal((await enabled).status(), 200)
  await hooks.getByLabel('设备', { exact: true }).fill(f.mdm)
  await hooks.getByLabel('确认对当前目标执行此操作', { exact: true }).first().check()
  const tested = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith(`/subscriptions/${sub}/test`),
  )
  await hooks.getByRole('button', { name: '测试投递', exact: true }).click()
  const testResponse = await tested
  assert.equal(testResponse.status(), 200)
  const delivery = (await testResponse.json()).id
  await until(
    () => api(`/api/v1/webhooks/deliveries/${delivery}`),
    (v) => v.items[0].status === 'dead_letter',
  )
  await hooks.getByRole('button', { name: '读取', exact: true }).last().click()
  await hooks.getByRole('button', { name: new RegExp('^' + delivery) }).click()
  await hooks.getByLabel('确认对当前目标执行此操作', { exact: true }).last().check()
  const replayed = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith(`/deliveries/${delivery}/replay`),
  )
  await hooks.getByRole('button', { name: '创建重放投递', exact: true }).click()
  assert.equal((await replayed).status(), 200)
  await hooks.getByLabel('确认对当前目标执行此操作', { exact: true }).last().check()
  const redriven = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith(`/deliveries/${delivery}/redrive`),
  )
  await hooks.getByRole('button', { name: '恢复原投递', exact: true }).click()
  assert.equal((await redriven).status(), 200)
  coverage.push('webhook-committed-response-loss-spa-replay-and-redrive')
  phase = 'api-key-issuance'
  await page.goto(at('settings/access'))
  await ready()
  const keys = page.locator('[data-panel="api-access"]')
  await keys.getByLabel('名称', { exact: true }).fill('Console inventory')
  await keys.getByRole('button', { name: '添加授权', exact: true }).click()
  await keys.getByLabel('启用', { exact: true }).check()
  await keys.getByLabel('确认对当前目标执行此操作', { exact: true }).check()
  const issued = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/api-keys',
  )
  await keys.getByRole('button', { name: '保存', exact: true }).click()
  assert.equal((await issued).status(), 200)
  await keys.locator('output').waitFor()
  const keySecret = await keys.locator('output').textContent()
  assert.ok(keySecret.length > 32)
  await keys.getByRole('button', { name: '清除明文', exact: true }).click()
  assert.equal(await keys.locator('output').count(), 0)
  coverage.push('key-management-first-response-secret')
  phase = 'current-permission-denial'
  const authority = await api(`/api/v1/authorization/rules/${f.ruleId}`)
  await api(`/api/v1/authorization/rules/${f.ruleId}`, 'PUT', {
    operationId: randomUUID(),
    expectedRevision: authority.revision,
    value: {
      ...authority.value,
      grants: authority.value.grants.filter((g) => g.operation !== 'webhook_read'),
    },
  })
  await api('/api/v1/webhooks/subscriptions', 'GET', undefined, 403)
  await page.goto(at('settings/integrations'))
  await ready()
  assert.equal(
    await hooks.getByRole('button', { name: '读取', exact: true }).first().isDisabled(),
    true,
  )
  coverage.push('current-authorization-403')
  phase = 'platform-network-policy'
  await login(f.console.managementTenant)
  await page.goto(at('settings/access'))
  await ready()
  await keys.getByRole('button', { name: '读取', exact: true }).click()
  await keys.getByLabel('程序化 API 来源白名单', { exact: true }).fill('127.0.0.1/32\n::1/128')
  await keys.getByLabel('确认对当前目标执行此操作', { exact: true }).check()
  const network = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && r.url().endsWith('/api-access/network-policy'),
  )
  await keys.getByRole('button', { name: '保存', exact: true }).click()
  assert.equal((await network).status(), 200)
  const programmatic = await browser.newContext({ ignoreHTTPSErrors: true })
  assert.equal(
    (
      await programmatic.request.get(origin + '/api/v1/devices', {
        headers: { 'X-API-Key': keySecret },
      })
    ).status(),
    200,
  )
  await keys.getByLabel('程序化 API 来源白名单', { exact: true }).fill('')
  await keys.getByLabel('确认对当前目标执行此操作', { exact: true }).check()
  const deniedNetwork = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && r.url().endsWith('/api-access/network-policy'),
  )
  await keys.getByRole('button', { name: '保存', exact: true }).click()
  assert.equal((await deniedNetwork).status(), 200)
  assert.equal(
    (
      await programmatic.request.get(origin + '/api/v1/devices', {
        headers: { 'X-API-Key': keySecret },
      })
    ).status(),
    403,
  )
  assert.equal(
    (await api('/api/v1/tenant-administration/api-access/network-policy')).networks.length,
    0,
  )
  await programmatic.close()
  coverage.push('management-cookie-network-policy-and-direct-key-admission')
  phase = 'anonymous-boundary'
  const anonymous = await browser.newContext({ ignoreHTTPSErrors: true })
  assert.equal((await anonymous.request.get(origin + '/api/v1/api-keys')).status(), 401)
  assert.equal(
    (
      await anonymous.request.get(origin + '/api/v1/devices/fixture-mac/recovery-credentials')
    ).status(),
    401,
  )
  await anonymous.close()
  assert.deepEqual(errors, [])
  result = 'passed'
} catch (error) {
  // Do not print bodies, secrets, traces, screenshots or credentials.
  console.error(JSON.stringify({ phase, result: 'failed', classification: error.name }))
  process.exitCode = 1
} finally {
  clearTimeout(timer)
  process.off('SIGTERM', stop)
  process.off('SIGINT', stop)
  await browser?.close()
  console.log(JSON.stringify({ phase: 'console-browser', result, coverage }))
}
