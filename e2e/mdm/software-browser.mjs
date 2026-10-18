// Real production Vue, HTTP/TLS, PG and publication worker. Synthetic fixture inputs only.
import { chromium } from 'playwright'
import { readFileSync, statSync } from 'node:fs'
import { randomUUID, createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import process from 'node:process'
let browser,
  backendRevision,
  phase = 'environment',
  result = 'failed'
const coverage = []
let closing,
  interrupted = false
const stop = () => (closing ??= Promise.resolve().then(() => browser?.close()))
const interrupt = () => {
  interrupted = true
  void stop().catch(() => {
    process.exitCode = 1
  })
}
process.once('SIGINT', interrupt)
process.once('SIGTERM', interrupt)
const timer = setTimeout(interrupt, 350000)
try {
  const f = JSON.parse(readFileSync(process.env.MDM_SOFTWARE_BROWSER_FIXTURE, 'utf8')),
    origin = new URL(f.origin).origin
  backendRevision = f.backendRevision
  assert.equal(new URL(origin).protocol, 'https:')
  assert.equal(new URL(origin).hostname, 'localhost')
  assert.equal(statSync(f.passwordFile).mode & 0o077, 0)
  browser = await chromium.launch()
  const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN' }),
    page = await context.newPage()
  page.setDefaultTimeout(20000)
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.name))
  let nextRequestAt = 0
  const pace = async () => {
    const now = Date.now(),
      at = Math.max(now, nextRequestAt)
    nextRequestAt = at + 200
    if (at > now) await new Promise((r) => setTimeout(r, at - now))
  }
  await context.route('**/api/v1/**', async (route) => {
    await pace()
    await route.continue()
  })
  const route = (name) => `${origin}/tenants/${f.tenant}/${name}`
  const api = async (path, method = 'GET', data, expected = 200) => {
    await pace()
    const response = await context.request.fetch(origin + path, {
      method,
      headers: method === 'GET' ? {} : await headers(),
      ...(data === undefined ? {} : { data }),
    })
    assert.equal(response.status(), expected, `${phase}: ${method} ${path.split('?')[0]} status`)
    return response.json()
  }
  let csrf
  const headers = async () => {
    csrf ??= (await api(`/api/v1/identity/tenants/${f.tenant}/session`)).csrfToken
    return { Origin: origin, 'X-Identity-Request': '1', 'X-CSRF-Token': csrf }
  }
  const write = (path, input, expectedRevision = 0) =>
    api(path, 'POST', { operationId: randomUUID(), expectedRevision, input })
  const poll = async (read, accept) => {
    const end = Date.now() + 45000
    let v
    do {
      v = await read()
      if (accept(v)) return v
      await new Promise((r) => setTimeout(r, 300))
    } while (Date.now() < end)
    throw new Error('poll deadline')
  }
  const idle = () => page.locator('section.console-page:not([aria-busy="true"])').waitFor()
  const click = async (name) => {
    await page.getByRole('button', { name, exact: true }).click()
    await idle()
  }
  phase = 'login'
  await page.goto(route('login'))
  await page.locator('#login-name').fill(f.login)
  await page.locator('#login-password').fill(readFileSync(f.passwordFile, 'utf8').trim())
  await page.locator('form').evaluate((form) => form.requestSubmit())
  await page.waitForURL(/workspace/)
  phase = 'seed-through-product-api'
  const source = await write('/api/v1/software/sources/browser-source/revisions/1', {
    action: 'register',
    definition: { id: 'browser-source', revision: '1', protocol: { kind: 'private' } },
  })
  const resource = randomUUID(),
    bytes = Buffer.from('browser exact software material'),
    digest = [...createHash('sha256').update(bytes).digest()]
  await write(`/api/v1/resources/${resource}`, { action: 'create', kind: 'software' })
  const invocation = {
    runAs: 'system',
    arguments: [],
    environment: {},
    timeoutSeconds: 60,
    outputBytes: 4096,
    exitCodes: { success: [0], reboot: [] },
  }
  for (const [label, version] of [
    ['v1', '1.0'],
    ['v2', '2.0'],
  ]) {
    const definition = {
      source: source.snapshot,
      package: 'Browser.App',
      version,
      provenance: { kind: 'private' },
      artifacts: {
        package: { reference: 'installer', origin: null, length: bytes.length, sha256: digest },
      },
      behavior: {
        kind: 'winget',
        installer: 'package',
        scope: 'system',
        install: invocation,
        upgradeInvocation: invocation,
        upgrade: 'in_place',
        uninstall: null,
        detect: {
          kind: 'msi_product',
          productCode: '{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}',
          version,
        },
      },
      signatures: [],
      reboot: 'report',
      downgrade: 'deny',
      dependencies: [],
      export: {
        kind: 'winget',
        locale: 'en-US',
        name: 'Browser App',
        publisher: 'Fixture',
        description: 'Disposable browser acceptance',
        license: 'Proprietary',
      },
    }
    const current = await api(`/api/v1/resources/${resource}`)
    await write(
      `/api/v1/resources/${resource}`,
      {
        action: 'version',
        version: label,
        kind: 'software',
        variants: [
          {
            platform: 'windows',
            architecture: 'x86_64',
            key: 'default',
            declaration: { kind: 'software', definition },
          },
        ],
      },
      current.revision,
    )
    await pace()
    const upload = await context.request.post(
      `${origin}/api/v1/resources/${resource}/content?version=${label}&variant=default&platform=windows&architecture=x86_64&operation=${randomUUID()}`,
      {
        headers: { ...(await headers()), 'Content-Type': 'application/octet-stream' },
        data: bytes,
      },
    )
    assert.equal(upload.status(), 201)
  }
  const scopes = []
  for (const devices of [f.devices, [f.devices[0]]]) {
    const id = randomUUID(),
      receipt = await write(`/api/v1/scopes/${id}`, {
        action: 'put',
        definition: {
          targets: devices.map((id) => ({ kind: 'device', id })),
          limitations: null,
          exclusions: [],
        },
      })
    if (receipt.task)
      await poll(
        () => api(`/api/v1/scopes/${id}/tasks/${receipt.task}`),
        (v) => v.status === 'completed',
      )
    scopes.push(id)
  }
  const pickVersion = async (version) => {
    const picker = page.locator('.console-software-picker')
    await picker.getByRole('button', { name: '企业软件目录', exact: true }).click()
    await picker.locator('select').first().selectOption(resource)
    await picker.locator('select').nth(1).waitFor()
    await picker.locator('select').nth(1).selectOption(version)
  }
  const published = []
  const publish = async (version, lose = false) => {
    await page.goto(route('software/publications'))
    await idle()
    await pickVersion(version)
    await click('读取实际目标')
    await page.locator('#publication-target').selectOption(f.target)
    let id,
      originals = []
    const intercept = async (r) => {
      if (r.request().method() !== 'POST') {
        await r.continue()
        return
      }
      originals.push(r.request().postDataJSON())
      const response = await r.fetch()
      assert.equal(response.status(), 202)
      id = (await response.json()).id
      if (lose && originals.length === 1) await r.abort('failed')
      else await r.fulfill({ response })
    }
    await page.route('**/api/v1/software/publications', intercept)
    await page.locator('[data-testid=publication-create]').evaluate((form) => form.requestSubmit())
    if (lose) {
      await page.locator('[data-testid=publication-unknown]').waitFor()
      await click('查询原操作')
      assert.equal(await page.locator('[data-testid=publication-unknown]').count(), 1)
      assert.equal(originals.length, 1)
      await page.locator('[data-testid=publication-unknown] input[type=checkbox]').check()
      await click('重放同一操作')
      assert.deepEqual(originals[0], originals[1])
      coverage.push('committed-response-loss-original-operation-lookup-and-explicit-replay')
    } else await page.locator('[data-testid=publication-detail]').waitFor()
    await page.unroute('**/api/v1/software/publications', intercept)
    assert.ok(id)
    const value = await poll(
      () => api(`/api/v1/software/publications/${id}`),
      (v) => v.outcome === 'published',
    )
    assert.equal(value.target, f.target)
    published.push(value)
    return value
  }
  phase = 'direct-publication'
  await publish('v1', true)
  coverage.push('one-target-publication-without-candidate-or-promotion')
  await page.goto(route('software'))
  await idle()
  assert.ok((await page.textContent('body')).includes('browser-source'))
  coverage.push('formal-source-revision-and-publication-directories')
  phase = 'full-deployment'
  await page.goto(route('software/deployments'))
  await idle()
  await click('新建')
  await page.locator('#deployment-resource').fill(resource)
  await page.locator('#deployment-version').fill('v1')
  await click('读取已准入版本与平台变体')
  await page.locator('#deployment-intent').selectOption('available_install')
  await click('下一步')
  await page.locator('#deployment-scope').fill(scopes[0])
  await click('下一步')
  assert.equal(await page.locator('#deployment-rollout-mode').inputValue(), 'full')
  assert.equal(await page.locator('[data-field=stage-scope]').count(), 0)
  await click('下一步')
  const save = async () => {
    await click('预览目标准入')
    const response = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        /\/api\/v1\/policies\/[0-9a-f-]{36}$/.test(new URL(r.url()).pathname),
    )
    await page.locator('[data-form=deployment] button[type=submit]').click()
    const r = await response
    assert.equal(r.status(), 200)
    const result = await r.json()
    await idle()
    return result
  }
  const initial = await save(),
    policy = initial.id
  let current = await api(`/api/v1/policies/${policy}`)
  assert.equal(current.definition.action.delivery.kind, 'direct')
  assert.equal(current.definition.action.rollout.stages.length, 1)
  assert.equal(current.definition.action.rollout.stages[0].scope, scopes[0])
  assert.equal(current.definition.action.intent, 'available_install')
  coverage.push('default-full-deployment-selects-scope-once')
  phase = 'version-isolation'
  await publish('v2')
  current = await api(`/api/v1/policies/${policy}`)
  assert.equal(current.definition.action.resource.version, 'v1')
  coverage.push('publishing-v2-does-not-change-v1-policy')
  phase = 'update-and-batches'
  await page.goto(route(`software/deployments?id=${policy}`))
  await idle()
  await click('编辑')
  await page.locator('#deployment-version').fill('v2')
  await click('读取已准入版本与平台变体')
  assert.equal(await page.locator('#deployment-intent').inputValue(), 'available_install')
  await page.locator('#deployment-delivery').selectOption('native')
  await click('读取此版本的发布记录')
  await page.locator('input[name=native-publication]').check()
  await click('下一步')
  await click('下一步')
  await page.locator('#deployment-rollout-mode').selectOption('staged')
  await page.locator('#stage-0-scope').fill(scopes[1])
  const at = (offset) => new Date(Date.now() + offset).toISOString().slice(0, 19)
  await page.locator('#stage-0-at').fill(at(-3600000))
  await click('增加阶段')
  await page.locator('#stage-1-scope').fill(scopes[0])
  await page.locator('#stage-1-at').fill(at(3600000))
  assert.equal(await page.locator('#stage-1-gate').inputValue(), '')
  await page.locator('#stage-1-gate').fill('80')
  await click('下一步')
  await save()
  current = await api(`/api/v1/policies/${policy}`)
  assert.equal(current.definition.action.resource.version, 'v2')
  assert.equal(current.definition.action.intent, 'available_install')
  assert.deepEqual(current.definition.action.delivery, { kind: 'native', target: f.target })
  assert.notEqual(current.versionId, initial.versionId)
  assert.equal(current.definition.action.rollout.stages.length, 2)
  coverage.push(
    'explicit-version-update-preview-and-submit-preserves-self-service',
    'native-target-shared-by-arbitrary-device-scopes-and-optional-gate',
  )
  phase = 'rollout-state-and-pause'
  await click('分批进度')
  assert.ok((await page.textContent('body')).includes('等待开放时间'))
  let rollout = await api(`/api/v1/policies/${policy}/software/rollout`)
  assert.equal(rollout.stages[1].open, false)
  assert.ok(rollout.stages.every((s) => s.verifiedSuccess === 0))
  await page.locator('[data-action=toggle-policy]').click()
  await idle()
  await click('分批进度')
  rollout = await api(`/api/v1/policies/${policy}/software/rollout`)
  assert.equal(rollout.paused, true)
  assert.ok(rollout.stages.every((s) => !s.open))
  coverage.push('real-rollout-time-gate-counters-and-policy-pause')
  phase = 'withdrawal'
  await page.goto(route('software/publications'))
  await idle()
  await page
    .locator('article')
    .filter({ hasText: `${resource} / v2` })
    .getByRole('button', { name: '打开', exact: true })
    .click()
  await page.locator('[data-testid=publication-detail]').waitFor()
  await click('撤回')
  const withdrawn = await api(`/api/v1/software/publications/${published[1].id}`),
    prior = await api(`/api/v1/software/publications/${published[0].id}`)
  assert.equal(withdrawn.withdrawn, true)
  assert.equal(prior.withdrawn, false)
  assert.equal(
    (await api(`/api/v1/policies/${policy}`)).definition.action.intent,
    'available_install',
  )
  coverage.push('withdrawal-does-not-uninstall-or-rewrite-policy-or-prior-version')
  assert.deepEqual(pageErrors, [])
  result = 'passed'
} catch (error) {
  console.error(
    JSON.stringify({
      phase,
      result: 'failed',
      classification: error.name,
      message: error instanceof assert.AssertionError ? error.message : 'browser operation failed',
    }),
  )
  process.exitCode = 1
} finally {
  clearTimeout(timer)
  try {
    await stop()
  } catch {
    result = 'failed'
    process.exitCode = 1
    console.error(JSON.stringify({ phase: 'browser-cleanup', result: 'failed' }))
  }
  if (interrupted) {
    result = 'failed'
    process.exitCode = 1
  }
  console.log(
    JSON.stringify({
      phase: 'software-browser',
      result,
      coverage,
      backendRevision,
      deviceInstallation: 'not-covered',
    }),
  )
}
