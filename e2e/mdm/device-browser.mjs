// Production Vue + real MDM/Identity HTTPS/PG. Only a committed response is deliberately lost.
import { acceptExperience } from './experience-browser.mjs'
import { Buffer } from 'node:buffer'
import { chromium } from 'playwright'
import { readFileSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID, createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import process from 'node:process'
let browser,
  context,
  page,
  phase = 'environment',
  result = 'failed',
  closing,
  cleanupFailed = false,
  interrupted = false,
  associatedDiagnostics
const coverage = [],
  responses = [],
  pageErrors = []
const close = () =>
  (closing ??= Promise.resolve().then(async () => {
    try {
      await context?.close()
    } catch {
      cleanupFailed = true
    }
    try {
      await browser?.close()
    } catch {
      cleanupFailed = true
    }
  }))
const stop = () => {
  interrupted = true
  void close()
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
const timer = setTimeout(stop, 890000)
try {
  const fixture = JSON.parse(readFileSync(process.env.MDM_DEVICE_BROWSER_FIXTURE, 'utf8')),
    origin = new URL(fixture.origin).origin
  assert.equal(new URL(origin).protocol, 'https:')
  assert.equal(new URL(origin).hostname, 'localhost')
  assert.equal(statSync(fixture.passwordFile).mode & 0o077, 0)
  browser = await chromium.launch()
  context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN' })
  page = await context.newPage()
  page.setDefaultTimeout(10000)
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname
    if (path.startsWith('/api/v1/')) {
      responses.push({ resource: path.split('/')[3], status: response.status() })
      if (responses.length > 20) responses.shift()
    }
  })
  page.on('pageerror', (error) => pageErrors.push(error.name))
  // Pace both UI and fixture HTTP below the unchanged production gateway's 10 r/s limit.
  let nextRequestAt = 0
  const pace = async () => {
    const now = Date.now(),
      dispatchAt = Math.max(now, nextRequestAt)
    nextRequestAt = dispatchAt + 200
    if (dispatchAt > now) await new Promise((resolve) => setTimeout(resolve, dispatchAt - now))
  }
  await context.route('**/api/v1/**', async (route) => {
    await pace()
    await route.continue()
  })
  const request = async (method, url, options) => {
    await pace()
    const response = await context.request[method](url, options)
    if (response.status() >= 400) {
      const error = await response.json().catch(() => ({}))
      responses.push({
        resource: new URL(url).pathname.split('/')[3],
        status: response.status(),
        code: /^[a-z_]{1,128}$/.test(error.code) ? error.code : undefined,
      })
      if (responses.length > 20) responses.shift()
    }
    return response
  }
  const path = (route) => `${origin}/tenants/${fixture.tenant}/${route}`
  const api = async (url) => {
    const response = await request('get', origin + url)
    assert.equal(response.status(), 200)
    return response.json()
  }
  let csrfToken
  const headers = async () => {
    csrfToken ??= (await api(`/api/v1/identity/tenants/${fixture.tenant}/session`)).csrfToken
    return { Origin: origin, 'X-Identity-Request': '1', 'X-CSRF-Token': csrfToken }
  }
  const confirm = async (body) =>
    request('post', origin + '/api/v1/device-associations', {
      headers: await headers(),
      data: body,
    })
  const body = (a, evidence = 'Verified same fixture instance') => ({
    operationId: randomUUID(),
    associationId: a.id,
    expectedVersion: a.version,
    mdm: a.members.find((m) => m.channel === 'mdm'),
    agent: a.members.find((m) => m.channel === 'agent'),
    evidence,
  })
  const writeRule = async (grants) => {
    const rule = (await api('/api/v1/authorization/rules')).items.find(
      (r) => r.id === fixture.ruleId,
    )
    assert.ok(rule)
    const response = await request(
      'put',
      origin + `/api/v1/authorization/rules/${fixture.ruleId}`,
      {
        headers: await headers(),
        data: {
          operationId: randomUUID(),
          expectedRevision: rule.revision,
          value: { ...fixture.rule, grants },
        },
      },
    )
    assert.equal(response.status(), 200)
  }
  const panel = () => page.locator('[data-testid=association-panel]')
  const loaded = () => page.locator('section.console-page:not([aria-busy="true"])').waitFor()
  const restartDirectory = async () => {
    const restart = page
      .locator('form.console-toolbar + p')
      .getByRole('button', { name: '重新读取', exact: true })
    for (let attempt = 0; attempt < 3 && (await restart.count()); attempt++) {
      await restart.click()
      await loaded()
    }
    assert.equal(await restart.count(), 0)
  }
  const advanceGeneration = (channel) => {
    const fds = JSON.parse(process.env._MDM_BUILD_LEASE).fds
    assert.ok(fds.length === 2 && fds.every((fd) => Number.isInteger(fd) && fd >= 3 && fd < 1024))
    const stdio = Array(Math.max(...fds) + 1).fill('ignore')
    stdio[1] = 'pipe'
    stdio[2] = 'pipe'
    fds.forEach((fd) => {
      stdio[fd] = fd
    })
    const control = spawnSync(
      'python3',
      [
        resolve(dirname(fileURLToPath(import.meta.url)), 'device-fixture-control.py'),
        process.env.MDM_DEVICE_BROWSER_FIXTURE,
        channel,
      ],
      { cwd: process.env.MDM_DEVICE_BACKEND, stdio, timeout: 30000 },
    )
    if (control.status !== 0) {
      const diagnostic =
        [
          'deadlock detected',
          'lock timeout',
          'statement timeout',
          'permission denied',
          'does not exist',
          'lease',
          'No such file',
        ].find((text) => String(control.stderr).includes(text)) ?? 'unclassified'
      console.log(
        JSON.stringify({
          phase: 'fixture-control',
          status: control.status,
          signal: control.signal,
          code: control.error?.code,
          diagnostic,
        }),
      )
    }
    assert.equal(control.status, 0)
  }
  phase = 'login'
  await page.goto(origin + '/login')
  await page.locator('#login-name').fill(fixture.login)
  await page.locator('#login-password').fill(readFileSync(fixture.passwordFile, 'utf8').trim())
  await page.locator('form button[type=submit]').click()
  await page.waitForURL((url) => /\/(?:workspace|settings\/guide)$/.test(url.pathname))
  phase = 'directory-http'
  await api('/api/v1/devices?limit=20')
  await api('/api/v1/device-views?limit=20')
  phase = 'directory'
  await page.goto(path('devices'))
  await loaded()
  await restartDirectory()
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByRole('button', { name: '下一页', exact: true }).click()
    await loaded()
    if (await page.locator('tbody').count()) break
    await restartDirectory()
  }
  assert.ok((await page.locator('tbody').textContent()).includes(fixture.mdm))
  const staleDirectory = page.url()
  await writeRule(fixture.rule.grants)
  const directoryInvalidated = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/v1/device-views' && r.status() === 409,
  )
  await page.reload()
  await directoryInvalidated
  await loaded()
  assert.equal(await page.locator('tbody').count(), 0)
  assert.ok(new URL(staleDirectory).searchParams.has('cursor'))
  let restartedReads = 0
  const countRestart = (r) => {
    if (new URL(r.url()).pathname === '/api/v1/device-views') restartedReads++
  }
  page.on('request', countRestart)
  await page
    .locator('form.console-toolbar + p')
    .getByRole('button', { name: '重新读取', exact: true })
    .click()
  await page.waitForURL((url) => !url.searchParams.has('cursor') && !url.searchParams.has('trail'))
  await loaded()
  page.off('request', countRestart)
  assert.equal(restartedReads, 1)
  assert.ok(await page.locator('tbody').count())
  coverage.push('real-directory-counters-pagination-and-explicit-invalidated-window-restart')
  phase = 'personnel-display-search'
  let directoryLookups = 0
  const observePersonnel = (request) => {
    const pathname = new URL(request.url()).pathname
    if (/\/accounts$/.test(pathname) || /\/user-profiles\/(?!me$)/.test(pathname))
      directoryLookups++
  }
  page.on('request', observePersonnel)
  await page.goto(path('devices'))
  await loaded()
  await restartDirectory()
  for (const search of ['Device Browser Person', 'admin']) {
    await page.locator('input[type=search]').fill(search)
    await page.locator('form.console-toolbar').evaluate((form) => form.requestSubmit())
    await page.waitForURL((url) => url.searchParams.get('search') === search)
    await loaded()
    await restartDirectory()
    assert.equal(new URL(page.url()).searchParams.get('search'), search)
    assert.ok((await page.locator('tbody').textContent()).includes(fixture.mdm))
    assert.ok((await page.locator('tbody').textContent()).includes('Device Browser Person'))
  }
  await page.goto(path(`devices/${fixture.mdm}`))
  await loaded()
  assert.equal(await page.locator('#vuetify-theme-stylesheet').count(), 0)
  const ownerDisplay = page.locator(`[data-personnel-device="${fixture.mdm}"]`)
  assert.ok((await ownerDisplay.textContent()).includes('Device Browser Person'))
  assert.ok((await ownerDisplay.textContent()).includes('person-source-alias'))
  assert.ok((await ownerDisplay.textContent()).includes('登录名: admin'))
  await writeRule(fixture.rule.grants.filter((g) => g.operation !== 'inventory_sensitive_read'))
  await page.reload()
  await loaded()
  assert.ok(!(await ownerDisplay.textContent()).includes('Device Browser Person'))
  assert.ok((await ownerDisplay.textContent()).includes('未提供人员展示资料'))
  await page.goto(path('devices') + '?search=Device%20Browser%20Person')
  await loaded()
  assert.equal(await page.getByText('当前没有结果', { exact: true }).count(), 1)
  await writeRule(fixture.rule.grants)
  page.off('request', observePersonnel)
  assert.equal(directoryLookups, 0)
  coverage.push('real-personnel-name-login-full-directory-search-and-sensitive-revocation')
  phase = 'unknown-create'
  await page.goto(path(`devices/${fixture.mdm}`))
  await page.getByRole('tab', { name: '管理', exact: true }).click()
  await panel().waitFor()
  const oldMdm = await api(`/api/v1/devices/${fixture.mdm}`)
  advanceGeneration('mdm')
  const refreshedMdm = await api(`/api/v1/devices/${fixture.mdm}`),
    oldRegistration = oldMdm.channels.find((c) => c.channel === 'mdm'),
    currentRegistration = refreshedMdm.channels.find((c) => c.channel === 'mdm')
  assert.equal(currentRegistration.generation, 2)
  assert.notEqual(currentRegistration.registrationId, oldRegistration.registrationId)
  await page.getByRole('button', { name: '查找另一通道候选', exact: true }).click()
  const candidateRead = () =>
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/v1/device-views/endpoint/${fixture.agent}`,
    )
  let inspected = candidateRead()
  await panel().locator(`input[type=radio][value="${fixture.agent}"]`).check()
  if ((await inspected).status() === 409) {
    // Registration advancement may invalidate the candidate snapshot; explicitly discover it again.
    await page.getByRole('button', { name: '查找另一通道候选', exact: true }).click()
    inspected = candidateRead()
    await panel().locator(`input[type=radio][value="${fixture.agent}"]`).check()
    assert.equal((await inspected).status(), 200)
  }
  const coordinates = panel().locator('[data-testid=confirmation-coordinates]')
  await coordinates.getByText(currentRegistration.registrationId, { exact: false }).waitFor()
  assert.ok(
    (await coordinates.textContent()).includes(
      currentRegistration.registrationId + ' / ' + currentRegistration.generation,
    ),
  )
  assert.ok(!(await coordinates.textContent()).includes(oldRegistration.registrationId))
  await page.getByLabel('核实说明与依据', { exact: true }).fill('Verified physical fixture input')
  await page.getByLabel('我已核实双方属于同一管理实例，确认双方注册坐标', { exact: true }).check()
  let original,
    requests = []
  await page.route('**/api/v1/device-associations', async (route) => {
    await pace()
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    requests.push(route.request().postData())
    if (!original) {
      original = JSON.parse(route.request().postData())
      assert.equal(original.mdm.registrationId, currentRegistration.registrationId)
      assert.equal(original.mdm.generation, currentRegistration.generation)
      const response = await route.fetch()
      assert.equal(response.status(), 200)
      await route.abort('failed')
    } else await route.continue()
  })
  await page.getByRole('button', { name: '确认关联', exact: true }).click()
  await page.getByText('操作结果未知', { exact: false }).waitFor()
  assert.equal(await page.getByRole('button', { name: '确认关联', exact: true }).isDisabled(), true)
  // Vue navigation retains operation memory; a full browser restart deliberately does not persist it.
  await page.getByRole('link', { name: '设备目录', exact: true }).click()
  await loaded()
  await page.getByRole('link', { name: fixture.mdm, exact: true }).first().click()
  await page.getByRole('tab', { name: '管理', exact: true }).click()
  await panel().waitFor()
  await page.getByLabel('我确认使用相同操作标识、身份及完整原正文幂等重放', { exact: true }).check()
  await page.getByRole('button', { name: '幂等重放原关联操作', exact: true }).click()
  await page.waitForURL(/device-views\/association\//)
  await loaded()
  assert.equal(requests.length, 2)
  assert.equal(requests[0], requests[1])
  await page.unroute('**/api/v1/device-associations')
  const id = new URL(page.url()).pathname.split('/').at(-1)
  let association = await api(`/api/v1/device-associations/${id}`)
  assert.equal(association.version, 1)
  coverage.push('real-create-displayed-current-generation-without-refresh')
  coverage.push('committed-unknown-explicit-exact-replay')
  phase = 'sources'
  const view = await api(`/api/v1/device-views/association/${id}`)
  assert.equal(view.fields['custom.asset_tag'].state.kind, 'conflict')
  assert.equal(view.fields['custom.asset_tag'].sources.length, 2)
  await page.getByRole('tab', { name: '管理', exact: true }).click()
  await page.locator('[data-device-channels] > summary').click()
  assert.equal(await page.locator('[data-endpoint]').count(), 2)
  await page.getByRole('tab', { name: '资产信息', exact: true }).click()
  await page.getByRole('button', { name: '未分组扩展字段', exact: true }).click()
  await page.locator('[data-asset-field="custom.browser_list"]').getByRole('button').click()
  const mdmList = page
    .getByRole('dialog', { name: '字段详情', exact: true })
    .locator(`[data-list-endpoint="${fixture.mdm}"]`)
  await mdmList.getByRole('button', { name: '展开此来源', exact: true }).click()
  await mdmList.getByRole('button', { name: '下一页', exact: true }).waitFor()
  await page.waitForFunction(
    (id) => document.querySelector(`[data-list-endpoint="${id}"] ol`)?.children.length === 20,
    fixture.mdm,
  )
  await mdmList.getByRole('button', { name: '下一页', exact: true }).click()
  await page.waitForFunction(
    (id) => document.querySelector(`[data-list-endpoint="${id}"] ol`)?.children.length === 5,
    fixture.mdm,
  )
  coverage.push('manual-conflict-two-endpoints-source-pagination')
  await page
    .getByRole('dialog', { name: '字段详情', exact: true })
    .getByRole('button', { name: '关闭', exact: true })
    .click()
  phase = 'cas'
  await page.getByRole('tab', { name: '管理', exact: true }).click()
  await page.getByRole('button', { name: '读取当前关系与主注册', exact: true }).click()
  await panel().locator('[aria-busy=false]').count()
  await panel().getByLabel('核实说明与依据', { exact: true }).fill('UI verification')
  await panel()
    .getByLabel('我已核实双方属于同一管理实例，确认双方注册坐标', { exact: true })
    .check()
  assert.equal((await confirm(body(association, 'Concurrent verification'))).status(), 200)
  await page.getByRole('button', { name: '重新核实关联', exact: true }).click()
  await page.getByText('版本或注册依据已变化', { exact: false }).waitFor()
  assert.equal(
    await page.getByRole('button', { name: '重新核实关联', exact: true }).isDisabled(),
    true,
  )
  await page.getByRole('button', { name: '读取当前关系与主注册', exact: true }).click()
  const basis = panel().locator('[data-testid=association-basis]')
  await basis.getByText('Concurrent verification', { exact: false }).waitFor()
  assert.ok((await basis.textContent()).includes(id + ' / 2'))
  await panel()
    .getByLabel('我已核实双方属于同一管理实例，确认双方注册坐标', { exact: true })
    .check()
  const nextConfirmation = page.waitForRequest(
    (r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/v1/device-associations',
  )
  await page.getByRole('button', { name: '重新核实关联', exact: true }).click()
  assert.equal((await nextConfirmation).postDataJSON().expectedVersion, 2)
  await loaded()
  association = await api(`/api/v1/device-associations/${id}`)
  assert.equal(association.version, 3)
  coverage.push('real-cas-conflict-explicit-basis-refresh')
  phase = 'generation'
  advanceGeneration('agent')
  await page.reload()
  await loaded()
  association = await api(`/api/v1/device-associations/${id}`)
  assert.equal(association.state, 'needs_verification')
  assert.ok(
    (await api(`/api/v1/device-views/association/${id}`)).endpoints
      .find((e) => e.id === fixture.agent)
      .channels.some((c) => c.generation === 2),
  )
  await page.getByRole('tab', { name: '管理', exact: true }).click()
  await page.getByRole('button', { name: '读取当前关系与主注册', exact: true }).click()
  await panel().getByLabel('核实说明与依据', { exact: true }).fill('Verified current generation')
  await panel()
    .getByLabel('我已核实双方属于同一管理实例，确认双方注册坐标', { exact: true })
    .check()
  await page.getByRole('button', { name: '重新核实关联', exact: true }).click()
  await loaded()
  association = await api(`/api/v1/device-associations/${id}`)
  assert.ok(association.members.some((m) => m.device === fixture.agent && m.generation === 2))
  coverage.push('real-new-generation-pending-and-reverification')
  phase = 'cursor-invalidated'
  const current = await api(`/api/v1/device-views/association/${id}`),
    source = current.lists['custom.browser_list'].sources.find((s) => s.endpoint === fixture.mdm)
  const change = await request(
    'put',
    origin + `/api/v1/devices/${fixture.mdm}/manual-fields/custom.asset_tag`,
    {
      headers: await headers(),
      data: {
        operationId: randomUUID(),
        expectedRevision: 1,
        input: { action: 'set', value: { kind: 'string', value: 'changed fixture' } },
      },
    },
  )
  assert.equal(change.status(), 200)
  const invalidated = await request(
    'get',
    origin +
      `/api/v1/device-views/association/${id}/inventory-lists/custom.browser_list?cursor=${encodeURIComponent(source.cursor)}&limit=20`,
  )
  assert.equal(invalidated.status(), 409)
  assert.equal((await invalidated.json()).code, 'device_view_cursor_invalidated')
  coverage.push('real-authority-bound-list-cursor-invalidation')
  phase = 'group-scope-assignments'
  const mutate = async (url, input, expectedRevision = 0, expectedStatus = 200) => {
    const response = await request('post', origin + url, {
      headers: await headers(),
      data: { operationId: randomUUID(), expectedRevision, input },
    })
    assert.equal(response.status(), expectedStatus)
    return response.json()
  }
  phase = 'query-resource-contract'
  const queryResources = Array.from({ length: 3 }, () => `query-${randomUUID()}`)
  for (let i = 0; i < queryResources.length; i++) {
    await mutate(`/api/v1/resources/${queryResources[i]}`, { action: 'create', kind: 'script' })
    for (let revision = 1; revision <= i; revision++)
      await mutate(
        `/api/v1/resources/${queryResources[i]}`,
        {
          action: 'present',
          presentation: {
            name: `Query resource ${i} revision ${revision}`,
            extra: { retained: false },
          },
        },
        revision,
      )
  }
  const resourceQuery = new URLSearchParams({
    filter: `id=in=(${queryResources.join(',')})`,
    sort: '-revision,id',
    fields: 'id,revision',
    limit: '1',
  })
  const resourcePages = []
  let resourceCursor
  do {
    if (resourceCursor) resourceQuery.set('cursor', resourceCursor)
    const value = await api('/api/v1/resources?' + resourceQuery)
    assert.equal(value.items.length, 1)
    assert.deepEqual(Object.keys(value.items[0]).sort(), ['id', 'revision'])
    resourcePages.push(value.items[0])
    resourceCursor = value.nextCursor
  } while (resourceCursor)
  assert.deepEqual(
    resourcePages.map((row) => row.id),
    [...queryResources].reverse(),
  )
  assert.deepEqual(
    resourcePages.map((row) => row.revision),
    [3, 2, 1],
  )
  assert.equal(
    (await api(`/api/v1/resources/${queryResources[2]}`)).presentation.extra.retained,
    false,
  )
  coverage.push('resource-global-filter-sort-projection-and-contiguous-opaque-pages')

  phase = 'query-ordinary-directory-consumers'
  const attributeId = randomUUID()
  const attribute = await request(
    'put',
    origin + `/api/v1/user-attribute-definitions/${attributeId}`,
    {
      headers: await headers(),
      data: {
        operationId: randomUUID(),
        expectedRevision: 0,
        value: {
          key: 'query_contract_label',
          displayName: 'Query contract label',
          source: { kind: 'identity_local' },
          pointer: '/extensions/query_contract_label',
          valueType: 'string',
          maxLength: 256,
          maxItems: null,
          minimum: null,
          maximum: null,
          enabled: true,
          sensitive: false,
          visibility: 'both',
          displayUse: 'profile',
          required: false,
          useExistingObservation: false,
        },
      },
    },
  )
  assert.equal(attribute.status(), 200)
  const attributes = await api(
    '/api/v1/user-attribute-definitions?' +
      new URLSearchParams({
        filter: `fieldId==${attributeId}`,
        fields: 'fieldId,revision,value,collectedAfterMicros',
        limit: '1',
      }),
  )
  assert.equal(attributes.items[0].fieldId, attributeId)
  assert.ok(Array.isArray(attributes.sources))
  await page.goto(path('settings/user-attributes'))
  await loaded()
  await page.getByText('Query contract label', { exact: true }).waitFor()
  const complianceId = randomUUID()
  const compliance = await request('put', origin + `/api/v1/compliance-rules/${complianceId}`, {
    headers: await headers(),
    data: {
      operationId: randomUUID(),
      expectedRevision: 0,
      input: {
        presentation: { name: 'Query contract rule' },
        severity: 'low',
        enabled: false,
        platform: 'all',
        target: { kind: 'all' },
        criteria: {
          selector: { kind: 'device' },
          quantifier: 'one',
          criteria: {
            kind: 'predicate',
            field: 'custom.asset_tag',
            op: 'eq',
            value: { kind: 'string', value: 'changed fixture' },
          },
        },
      },
    },
  })
  assert.equal(compliance.status(), 200)
  const compliancePage = await api(
    '/api/v1/compliance-rules?' +
      new URLSearchParams({
        filter: `id==${complianceId}`,
        fields: 'id,revision,definition',
        limit: '1',
      }),
  )
  assert.equal(compliancePage.items[0].id, complianceId)
  await page.goto(path('security'))
  await loaded()
  await page.getByText('Query contract rule', { exact: false }).first().waitFor()
  coverage.push('nonempty-user-attribute-and-compliance-client-pages')

  phase = 'asset-rsql-fixed-results'
  const inventoryBefore = await api(`/api/v1/devices/${fixture.mdm}/inventory`)
  const tagBefore = inventoryBefore.asset.device.fields['custom.asset_tag'].state
  assert.equal(tagBefore.kind, 'known')
  const tagRevision = inventoryBefore.asset.device.revisions['custom.asset_tag']
  const assignedNull = await request(
    'put',
    origin + `/api/v1/devices/${fixture.mdm}/manual-fields/custom.asset_tag`,
    {
      headers: await headers(),
      data: { operationId: randomUUID(), expectedRevision: tagRevision, input: { action: 'null' } },
    },
  )
  assert.equal(assignedNull.status(), 200)
  const assetQuery = {
    filter: 'custom.asset_tag=isnull=true',
    scope: { selector: { kind: 'device' }, quantifier: 'one' },
    fields: ['custom.asset_tag'],
    sort: [],
  }
  const acceptedQuery = (await mutate('/api/v1/device-queries', assetQuery, 0, 202)).asset
  let queryState
  const queryDeadline = Date.now() + 90000
  do {
    queryState = (await api(`/api/v1/device-queries/${acceptedQuery.task}`)).asset
    if (queryState.status === 'completed') break
    assert.ok(['pending', 'running'].includes(queryState.status))
    await new Promise((resolve) => setTimeout(resolve, 250))
  } while (Date.now() < queryDeadline)
  assert.equal(queryState.status, 'completed')
  assert.ok(queryState.summary.matched >= 1)
  assert.ok(queryState.summary.unknown >= 1)
  const fixedResults = await api(`/api/v1/device-queries/${acceptedQuery.task}/items?limit=1`)
  assert.equal(fixedResults.asset.items[0].fields['custom.asset_tag'].state.kind, 'null')
  const restoredTag = await request(
    'put',
    origin + `/api/v1/devices/${fixture.mdm}/manual-fields/custom.asset_tag`,
    {
      headers: await headers(),
      data: {
        operationId: randomUUID(),
        expectedRevision: tagRevision + 1,
        input: { action: 'set', value: tagBefore.value },
      },
    },
  )
  assert.equal(restoredTag.status(), 200)
  assert.deepEqual(
    (await api(`/api/v1/device-queries/${acceptedQuery.task}/items?limit=1`)).asset,
    fixedResults.asset,
  )
  const savedQueryId = randomUUID()
  const savedQuery = await request('put', origin + `/api/v1/saved-queries/${savedQueryId}`, {
    headers: await headers(),
    data: {
      operationId: randomUUID(),
      expectedRevision: 0,
      input: { action: 'put', definition: { name: 'Query contract saved', query: assetQuery } },
    },
  })
  assert.equal(savedQuery.status(), 200)
  const savedPage = await api(
    '/api/v1/saved-queries?' + new URLSearchParams({ filter: `id==${savedQueryId}`, limit: '1' }),
  )
  assert.equal(savedPage.asset.items[0].definition.query.filter, assetQuery.filter)
  await page.goto(path('devices/search'))
  await loaded()
  await page
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: '个人保存查询' }) })
    .locator('summary')
    .click()
  await page.getByRole('button', { name: /Query contract saved/ }).click()
  await loaded()
  await page
    .locator('[data-testid=server-definition]')
    .getByText('Query contract saved', { exact: true })
    .waitFor()
  coverage.push('asset-rsql-null-missing-unknown-and-immutable-result-with-saved-query-consumer')

  const settled = async (url) => {
    const deadline = Date.now() + 90000
    while (Date.now() < deadline) {
      const value = await api(url)
      if (value.status === 'completed') return value
      if (!['pending', 'running'].includes(value.status))
        console.log(
          JSON.stringify({
            phase: 'calculation-status',
            status: value.status,
            failure: value.failure,
            replacement: !!value.replacementTask,
          }),
        )
      assert.ok(['pending', 'running'].includes(value.status))
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    assert.fail('bounded calculation deadline')
  }
  const group = randomUUID()
  await mutate(`/api/v1/groups/${group}`, {
    action: 'create',
    presentation: { name: 'Browser endpoint group', description: '' },
    assetContext: 'endpoint',
    criteria: null,
  })
  const membership = await mutate(
    `/api/v1/groups/${group}`,
    { action: 'members', add: [{ kind: 'endpoint', id: fixture.agent }], remove: [] },
    1,
    202,
  )
  await settled(`/api/v1/groups/${group}/tasks/${membership.task}`)
  const groupResult = await api(`/api/v1/groups/${group}/results/${membership.task}/members`)
  assert.deepEqual(groupResult.page.items, [{ kind: 'endpoint', id: fixture.agent }])
  await page.goto(path('devices/groups'))
  await loaded()
  await page.getByRole('button', { name: /Browser endpoint group/ }).click()
  await loaded()
  const scopeLink = page.locator('[data-testid=server-definition] a')
  await scopeLink.waitFor()
  assert.equal(
    new URL(await scopeLink.getAttribute('href'), origin).searchParams.get('group'),
    group,
  )
  // Follow the selected Group's production link into the Scope editor.
  await scopeLink.click()
  await loaded()
  const scopeWrite = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      /\/api\/v1\/scopes\/[^/]+$/.test(new URL(r.url()).pathname),
  )
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const scopeResponse = await scopeWrite
  assert.equal(scopeResponse.status(), 200)
  const scope = await scopeResponse.json()
  await settled(`/api/v1/scopes/${scope.id}/tasks/${scope.task}`)
  await page.getByRole('button', { name: '读取任务状态', exact: true }).click()
  await loaded()
  await page.getByRole('tab', { name: '判定说明', exact: true }).click()
  const channelSelect = page
    .locator('select')
    .filter({ has: page.locator('option[value="agent"]') })
  await channelSelect.selectOption('agent')
  await page.getByRole('button', { name: '打开', exact: true }).last().click()
  await loaded()
  assert.ok((await page.locator('main').textContent()).includes(fixture.agent))
  const decision = await api(
    `/api/v1/scopes/${scope.id}/results/${scope.task}/decisions?channel=agent`,
  )
  assert.equal(decision.channel, 'agent')
  assert.equal(decision.page.items[0].object.kind, 'endpoint')
  assert.equal(decision.page.items[0].qualification.state, 'eligible')
  assert.ok(decision.page.items[0].targets.some((s) => s.reference.id === group))
  phase = 'formal-planning-directory'
  const selectedScope = randomUUID()
  for (const scopeId of [selectedScope, ...Array.from({ length: 20 }, () => randomUUID())])
    await mutate(`/api/v1/scopes/${scopeId}`, {
      action: 'put',
      definition: { targets: [], limitations: null, exclusions: [] },
    })
  const firstScopes = await api('/api/v1/scopes?limit=1')
  assert.equal(firstScopes.items.length, 1)
  assert.ok(firstScopes.nextCursor)
  const secondScopes = await api(
    `/api/v1/scopes?limit=1&cursor=${encodeURIComponent(firstScopes.nextCursor)}`,
  )
  assert.ok(secondScopes.items[0].id > firstScopes.items[0].id)
  await page.goto(path('policies'))
  await loaded()
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await loaded()
  assert.ok(await page.locator('main').textContent())
  // Selector denial must not suppress the independently authorized Scope directory.
  await writeRule(fixture.rule.grants.filter((g) => g.operation !== 'group_read'))
  await page.reload()
  await loaded()
  assert.ok((await page.locator('main').textContent()).includes('目标范围'))
  assert.equal((await request('get', origin + '/api/v1/groups')).status(), 403)
  await writeRule(fixture.rule.grants)
  await page.getByRole('button', { name: '新建', exact: true }).click()
  const planningScopeDialog = page.getByRole('dialog')
  await planningScopeDialog.locator('details:has(#scope-id) > summary').click()
  await planningScopeDialog.locator('#scope-id').fill(selectedScope)
  await planningScopeDialog.getByRole('button', { name: '打开', exact: true }).click()
  await loaded()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  const editDialog = page.getByRole('dialog')
  let committedScope
  await context.route(`**/api/v1/scopes/${selectedScope}`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    committedScope = route.request().postDataJSON()
    await route.abort('failed')
  })
  await editDialog.getByRole('button', { name: '保存', exact: true }).click()
  await editDialog.getByRole('alert').filter({ hasText: '提交结果未知' }).waitFor()
  assert.equal(
    await editDialog.getByRole('button', { name: '重放同一操作', exact: true }).isEnabled(),
    false,
  )
  assert.equal((await api(`/api/v1/scopes/${selectedScope}`)).revision, 2)
  await context.unroute(`**/api/v1/scopes/${selectedScope}`)
  await editDialog.getByRole('button', { name: '重读服务器值并比较', exact: true }).click()
  await loaded()
  const replay = page.waitForRequest(
    (r) => r.method() === 'POST' && new URL(r.url()).pathname === `/api/v1/scopes/${selectedScope}`,
  )
  await editDialog.getByRole('button', { name: '重放同一操作', exact: true }).click()
  assert.deepEqual((await replay).postDataJSON(), committedScope)
  await loaded()
  assert.equal((await api(`/api/v1/scopes/${selectedScope}`)).revision, 2)
  const conflict = await request('post', origin + `/api/v1/scopes/${selectedScope}`, {
    headers: await headers(),
    data: { ...committedScope, operationId: randomUUID() },
  })
  assert.equal(conflict.status(), 409)
  coverage.push('formal-planning-pagination-selector-denial-cas-and-unknown-write-reconciliation')
  phase = 'group-scope-assignments'
  const policy = randomUUID()
  await mutate(`/api/v1/policies/${policy}`, {
    action: 'put',
    enabled: false,
    definition: {
      scope: scope.id,
      action: {
        kind: 'request_mdm_enrollment',
        organization: fixture.tenant,
        runLifetimeSeconds: 300,
        schedule: {
          trigger: { kind: 'manual' },
          misfire: { kind: 'coalesce_one' },
          notBefore: 0,
          until: null,
          jitterSeconds: 0,
          window: null,
        },
      },
    },
  })
  const assignment = (await api(`/api/v1/policies/${policy}/assignments`)).items.find(
    (a) => a.object.id === fixture.agent,
  )
  assert.ok(assignment)
  assert.equal(assignment.channel, 'agent')
  assert.equal(
    assignment.target.registrationId,
    association.members.find((m) => m.channel === 'agent').registrationId,
  )
  assert.equal(assignment.target.generation, 2)
  // Endpoint Groups retain endpoint provenance; association evidence belongs to associated-device Groups.
  assert.deepEqual(assignment.object, { kind: 'endpoint', id: fixture.agent })
  assert.deepEqual(
    assignment.sources.map((s) => s.object),
    [{ kind: 'endpoint', id: fixture.agent }],
  )
  assert.equal(assignment.sources[0].associationVersion, null)
  assert.equal(assignment.sources[0].verified, true)
  assert.deepEqual(assignment.sources[0].members, [assignment.target])
  assert.ok(Array.isArray(assignment.operationIds))
  await page.goto(path(`software/bootstrap?id=${policy}`))
  await loaded()
  await page.getByRole('button', { name: '刷新进度（保留编辑）', exact: true }).click()
  await loaded()
  await page.getByRole('button', { name: '来源与历史证据', exact: true }).first().click()
  assert.ok(
    (await page.getByRole('dialog').textContent()).includes(assignment.target.registrationId),
  )
  await page.keyboard.press('Escape')
  coverage.push('real-endpoint-group-scope-channel-and-canonical-assignments')
  phase = 'experience-completion'
  await acceptExperience({
    page,
    context,
    fixture,
    origin,
    api,
    request,
    path,
    settled,
    group,
    coverage,
  })
  await page.goto(path(`device-views/association/${id}`))
  await loaded()
  phase = 'associated-group-scope-assignments'
  // Associated evaluation requires collected evidence bound to original registrations.
  advanceGeneration('seed-associated-inventory')
  await page.goto(path('devices/groups'))
  await loaded()
  await page.getByRole('button', { name: '创建', exact: true }).click()
  const editor = page.getByRole('dialog')
  await editor.getByTestId('group-name').fill('Browser associated group')
  await editor.getByTestId('group-kind').selectOption('dynamic')
  await editor.getByTestId('group-context').selectOption('associated_device')
  await editor
    .locator('.group-criteria > .console-toolbar select')
    .first()
    .selectOption('predicate')
  await editor
    .locator('.condition-editor')
    .getByRole('combobox', { name: '类型', exact: true })
    .selectOption('predicate')
  await editor.getByRole('combobox', { name: '字段', exact: true }).selectOption('device.model')
  await editor.locator('.condition-editor input').last().fill('browser-associated-model')
  const groupCreated = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      /\/api\/v1\/groups\/[^/]+$/.test(new URL(r.url()).pathname),
  )
  await editor.getByRole('button', { name: '保存并查看成员', exact: true }).click()
  const groupReceipt = await groupCreated
  assert.equal(groupReceipt.status(), 200)
  const associated = await groupReceipt.json()
  assert.equal(associated.group.assetContext, 'associated_device')
  await settled(`/api/v1/groups/${associated.group.id}/tasks/${associated.task}`)
  const associatedRead = await api(`/api/v1/groups/${associated.group.id}`)
  assert.deepEqual(associatedRead.criteria.selector, { kind: 'device' })
  assert.equal(associatedRead.criteria.quantifier, 'one')
  const associatedMembers = await api(
    `/api/v1/groups/${associated.group.id}/results/${associated.task}/members`,
  )
  const associatedDecisions = await api(
    `/api/v1/groups/${associated.group.id}/results/${associated.task}/decisions`,
  )
  associatedDiagnostics = {
    conditionKind: associatedRead.criteria.criteria.kind,
    field: associatedRead.criteria.criteria.field,
    members: associatedMembers.page.items.map((o) => ({
      kind: o.kind,
      pair: o.id === id,
      alone: o.id === fixture.alone,
    })),
    decisions: associatedDecisions.page.items
      .filter((d) => d.object.id === id || d.object.id === fixture.alone)
      .map((d) => ({
        kind: d.object.kind,
        pair: d.object.id === id,
        alone: d.object.id === fixture.alone,
        decision: d.decision,
        verified: d.sourceObjects.map((s) => s.verified),
      })),
  }
  assert.deepEqual(
    new Set(associatedMembers.page.items.map((o) => `${o.kind}:${o.id}`)),
    new Set([`association:${id}`, `endpoint:${fixture.alone}`]),
  )
  const pairDecision = associatedDecisions.page.items.find(
    (d) => d.object.kind === 'association' && d.object.id === id,
  )
  assert.ok(
    pairDecision.sourceObjects[0].members.some(
      (m) => m.device === fixture.agent && m.generation === 2,
    ),
  )
  await page.locator('[data-testid=server-definition] a').click()
  const scopeSaved = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      /\/api\/v1\/scopes\/[^/]+$/.test(new URL(r.url()).pathname),
  )
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
  const scopeSavedResponse = await scopeSaved
  assert.equal(scopeSavedResponse.status(), 200)
  const associatedScope = await scopeSavedResponse.json()
  await settled(`/api/v1/scopes/${associatedScope.id}/tasks/${associatedScope.task}`)
  for (const channel of ['mdm', 'agent']) {
    const values = await api(
      `/api/v1/scopes/${associatedScope.id}/results/${associatedScope.task}/members?channel=${channel}`,
    )
    assert.ok(values.page.items.every((o) => o.kind === 'endpoint'))
    assert.ok(values.page.items.some((o) => o.id === fixture[channel]))
  }
  const scriptResource = randomUUID(),
    scriptPolicy = randomUUID(),
    script = Buffer.from('Write-Output "Browser contract acceptance"'),
    digest = [...createHash('sha256').update(script).digest()]
  await mutate(`/api/v1/resources/${scriptResource}`, { action: 'create', kind: 'script' })
  await mutate(
    `/api/v1/resources/${scriptResource}`,
    {
      action: 'version',
      kind: 'script',
      version: '1',
      variants: [
        {
          platform: 'windows',
          architecture: 'x86_64',
          key: 'default',
          declaration: {
            kind: 'script',
            artifact: { reference: 'browser.ps1', length: script.length, sha256: digest },
            definition: {
              profile: 'power_shell7',
              sql: null,
              runAs: 'system',
              encoding: 'utf8',
              parameters: {
                type: 'object',
                properties: {},
                required: [],
                additionalProperties: false,
              },
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
  const content = await request(
    'post',
    origin +
      `/api/v1/resources/${scriptResource}/content?version=1&variant=default&platform=windows&architecture=x86_64&operation=${randomUUID()}`,
    { headers: { ...(await headers()), 'Content-Type': 'application/octet-stream' }, data: script },
  )
  assert.equal(content.status(), 201)
  await mutate(`/api/v1/resources/${scriptResource}`, { action: 'activate', version: '1' }, 2)
  await mutate(`/api/v1/policies/${scriptPolicy}`, {
    action: 'put',
    enabled: true,
    definition: {
      scope: associatedScope.id,
      action: {
        kind: 'execution',
        resource: {
          id: scriptResource,
          version: '1',
          platform: 'windows',
          architecture: 'x86_64',
          variant: 'default',
        },
        parameters: {},
        schedule: {
          trigger: { kind: 'manual' },
          misfire: { kind: 'coalesce_one' },
          notBefore: 0,
          until: null,
          jitterSeconds: 0,
          window: null,
        },
        frequency: 'once_per_version',
        runLifetimeSeconds: 300,
      },
    },
  })
  const assignments = () => api(`/api/v1/policies/${scriptPolicy}/assignments`)
  const before = await assignments(),
    pair = before.items.find((a) => a.object.kind === 'association' && a.object.id === id),
    missing = before.items.find((a) => a.object.id === fixture.alone)
  assert.equal(pair.availability, 'ready')
  assert.equal(pair.target.device, fixture.agent)
  assert.equal(pair.sources[0].associationVersion, association.version)
  assert.deepEqual(
    new Set(pair.sources[0].members.map((m) => m.device)),
    new Set([fixture.mdm, fixture.agent]),
  )
  assert.equal(missing.availability, 'unavailable')
  assert.equal(missing.reason, 'channel_unavailable')
  assert.equal(missing.target, null)
  await page.goto(path(`policies/assignments?id=${scriptPolicy}`))
  await loaded()
  await page.getByRole('button', { name: '刷新进度（保留编辑）', exact: true }).click()
  await loaded()
  assert.ok((await page.locator('main').textContent()).includes(fixture.alone))
  advanceGeneration('add-agent-to-alone')
  // Registration changes invalidate the shared asset snapshot. Allow bounded asynchronous
  // group/Scope catch-up after the preceding publication journey; this is not a latency SLO.
  const recoveryDeadline = Date.now() + 90000
  let restored
  while (Date.now() < recoveryDeadline) {
    restored = (await assignments()).items.find((a) => a.object.id === fixture.alone)
    if (restored?.availability === 'ready') break
    await new Promise((r) => setTimeout(r, 500))
  }
  assert.equal(
    restored?.availability,
    'ready',
    JSON.stringify({
      reason: restored?.reason ?? null,
      targetPresent: !!restored?.target,
      scopeResult: restored?.scopeResult ?? null,
    }),
  )
  assert.deepEqual(restored.object, { kind: 'endpoint', id: fixture.alone })
  assert.equal(restored.target.channel, 'agent')
  assert.equal(restored.target.generation, 1)
  await page.getByRole('button', { name: '刷新进度（保留编辑）', exact: true }).click()
  await loaded()
  const restoredRow = page.locator('tr').filter({ hasText: fixture.alone })
  await restoredRow.getByRole('button', { name: '来源与历史证据', exact: true }).click()
  assert.ok((await page.getByRole('dialog').textContent()).includes(restored.target.registrationId))
  await page.keyboard.press('Escape')
  coverage.push('real-associated-dynamic-group-canonical-assignments-and-channel-recovery')
  await page.goto(path(`device-views/association/${id}`))
  await loaded()
  phase = 'periodic-collection'
  const collectorDevice = fixture.collector.runtime.deviceId
  const controlCollection = (action, resource, cycle) => {
    const fds = JSON.parse(process.env._MDM_BUILD_LEASE).fds
    const stdio = Array(Math.max(...fds) + 1).fill('ignore')
    stdio[1] = 'pipe'
    stdio[2] = 'pipe'
    fds.forEach((fd) => {
      stdio[fd] = fd
    })
    const result = spawnSync(
      'python3',
      [
        resolve(dirname(fileURLToPath(import.meta.url)), 'device-agent.py'),
        process.env.MDM_DEVICE_BROWSER_FIXTURE,
        action,
        resource,
        String(cycle),
      ],
      { cwd: process.env.MDM_DEVICE_BACKEND, stdio, timeout: 150000 },
    )
    if (result.status !== 0) {
      let classification = 'collector-process'
      try {
        classification = JSON.parse(result.stdout.toString()).classification ?? classification
      } catch {
        // Preserve the closed fallback classification; raw child output may contain secrets.
      }
      console.log(JSON.stringify({ phase: 'collector-report', result: 'failed', classification }))
    }
    assert.equal(result.status, 0, 'controlled Agent report failed')
    return JSON.parse(result.stdout.toString())
  }
  // Scope publication and every package operation use the production UI.
  await page.goto(path('policies?device=' + encodeURIComponent(collectorDevice)))
  const scopeDialog = page.getByRole('dialog')
  await scopeDialog.waitFor()
  const collectorScope = await page.locator('#scope-id').inputValue()
  await scopeDialog.getByRole('button', { name: '保存', exact: true }).click()
  for (let i = 0; i < 40; i++) {
    const value = await api(`/api/v1/scopes/${collectorScope}`)
    if (value.resolution) {
      const task = await api(`/api/v1/scopes/${collectorScope}/tasks/${value.resolution}`)
      if (task.status === 'completed') break
    }
    assert.ok(i < 39, 'collector scope publication deadline')
    await new Promise((r) => setTimeout(r, 250))
  }
  async function configurePackage(blueprintId) {
    await page.goto(path('policies/resources'))
    await page.getByRole('button', { name: '新建', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: '选择标准包', exact: true }).click()
    const catalog = await api('/api/v1/collection-blueprints')
    assert.ok(
      catalog.items.some((item) => item.id === blueprintId),
      'required standard package is absent',
    )
    const select = page.getByTestId('collection-blueprints').locator('select').nth(1)
    await select
      .locator('option')
      .filter({ hasText: blueprintId + ' / ' })
      .first()
      .waitFor({ state: 'attached' })
    const choice = await select
      .locator('option')
      .filter({ hasText: blueprintId + ' / ' })
      .first()
      .getAttribute('value')
    await select.selectOption(choice)
    const instantiated = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        /\/api\/v1\/resources\/[^/]+$/.test(new URL(r.url()).pathname),
    )
    await page.locator('[data-action=instantiate-package]').click()
    const response = await instantiated
    assert.equal(response.status(), 200)
    const resource = new URL(response.url()).pathname.split('/').at(-1)
    const activate = page.getByRole('button', { name: '激活', exact: true })
    await activate.waitFor()
    await activate.click()
    const assign = page.getByRole('link', { name: '配置范围、周期与启停', exact: true })
    await assign.waitFor()
    await assign.click()
    await page
      .locator('#policy-variant option')
      .filter({ hasText: 'macos / aarch64' })
      .waitFor({ state: 'attached' })
    const variant = await page
      .locator('#policy-variant option')
      .filter({ hasText: 'macos / aarch64' })
      .getAttribute('value')
    await page.locator('#policy-variant').selectOption(variant)
    await page.locator('#policy-scope').fill(collectorScope)
    const period = page.locator('[data-field=collection-period]')
    assert.equal(await period.inputValue(), '3600')
    await period.fill('60')
    assert.equal(await page.locator('#policy-frequency').count(), 0)
    await page
      .locator('[data-form=policy]')
      .getByRole('checkbox', { name: '调度有效', exact: true })
      .check()
    const policy = await page.locator('#policy-id').inputValue()
    const written = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        new URL(r.url()).pathname === `/api/v1/policies/${policy}`,
    )
    await page
      .locator('[data-form=policy]')
      .getByRole('button', { name: '保存', exact: true })
      .click()
    assert.equal((await written).status(), 200)
    await loaded()
    const value = await api(`/api/v1/policies/${policy}`)
    assert.equal(value.definition.action.frequency, 'every_trigger')
    assert.equal(value.definition.action.schedule.trigger.seconds, 60)
    assert.equal(value.state, 'enabled')
    console.log(
      JSON.stringify({
        phase: 'periodic-policy',
        package: blueprintId,
        policy,
        version: value.versionId,
        seconds: 60,
      }),
    )
    return { resource, policy, version: value.versionId }
  }
  async function projected(run, scope = { kind: 'device' }) {
    for (let i = 0; i < 60; i++) {
      const value = await api(
        `/api/v1/devices/${collectorDevice}/collections/${run.attempt}?scope=${encodeURIComponent(JSON.stringify(scope))}`,
      )
      if (value.asset.run.delivery.projection === 'projected') return value.asset.run
      await new Promise((r) => setTimeout(r, 250))
    }
    assert.fail('collection projection deadline')
  }
  const memory = await configurePackage('macos.agent.memory')
  const firstCycle = controlCollection('memory', memory.resource, 1)
  await projected(firstCycle)
  console.log(
    JSON.stringify({
      phase: 'normal-collection-period',
      cycle: 1,
      policy: memory.policy,
      version: memory.version,
      run: firstCycle.attempt,
    }),
  )
  const secondCycle = controlCollection('memory', memory.resource, 2)
  await projected(secondCycle)
  console.log(
    JSON.stringify({
      phase: 'normal-collection-period',
      cycle: 2,
      policy: memory.policy,
      version: memory.version,
      run: secondCycle.attempt,
    }),
  )
  assert.notEqual(firstCycle.task, secondCycle.task)
  assert.equal((await api(`/api/v1/policies/${memory.policy}`)).versionId, memory.version)
  const incompleteCycle = controlCollection('memory_partial', memory.resource, 3)
  const incompleteRun = await api(
    `/api/v1/devices/${collectorDevice}/collections/${incompleteCycle.attempt}`,
  )
  assert.ok(['partial', 'failed'].includes(incompleteRun.asset.run.result))
  console.log(
    JSON.stringify({
      phase: 'partial-collection-period',
      result: incompleteRun.asset.run.result,
      run: incompleteCycle.attempt,
    }),
  )
  const retainedMemory = await api(`/api/v1/devices/${collectorDevice}/inventory`)
  assert.equal(retainedMemory.asset.device.fields['device.memory.bytes'].state.value.value, 8194)
  const isCollectorDetail = (response) =>
    new URL(response.url()).pathname === `/api/v1/device-views/endpoint/${collectorDevice}`
  const readingDetail = page.waitForResponse(isCollectorDetail)
  await page.goto(path(`devices/${collectorDevice}`))
  const detailReply = await readingDetail
  if (detailReply.status() === 409) {
    assert.equal((await detailReply.json()).code, 'device_view_cursor_invalidated')
    await loaded()
    const rereadingDetail = page.waitForResponse(isCollectorDetail)
    await page.getByRole('button', { name: '重新读取', exact: true }).click()
    assert.equal((await rereadingDetail).status(), 200)
  } else assert.equal(detailReply.status(), 200)
  await page.getByRole('button', { name: '硬件', exact: true }).click()
  assert.ok((await page.locator('.asset-detail-layout').textContent()).includes('8194'))
  const personnel = page.locator(`[data-personnel-device="${collectorDevice}"]`)
  assert.ok((await personnel.textContent()).includes('有效企业会话'))
  assert.equal(await personnel.locator('input').count(), 0)
  await personnel.locator('[data-action=edit-owner]').click()
  await page.getByRole('dialog').getByRole('button', { name: '未指定', exact: true }).click()
  const ownerWritten = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      new URL(response.url()).pathname === `/api/v1/devices/${collectorDevice}/registration-user`,
  )
  const ownerDialog = page.getByRole('dialog')
  await ownerDialog.getByRole('button', { name: '保存', exact: true }).click()
  assert.equal((await ownerWritten).status(), 200)
  await ownerDialog.waitFor({ state: 'hidden' })
  await loaded()
  assert.equal((await api(`/api/v1/devices/${collectorDevice}/registration-user`)).user, null)
  assert.ok(
    (await page.locator(`[data-personnel-device="${collectorDevice}"]`).textContent()).includes(
      '有效企业会话',
    ),
  )
  // Disable through the same Policy UI before starting the software package.
  await page.goto(path(`policies/assignments?id=${memory.policy}`))
  await loaded()
  await page.getByRole('button', { name: '禁用整个 Policy', exact: true }).click()
  await loaded()
  assert.equal((await api(`/api/v1/policies/${memory.policy}`)).state, 'disabled')
  const apps = await configurePackage('macos.agent.applications_user')
  const applications = controlCollection('applications', apps.resource, 1)
  const userScope = { kind: 'macos_applications', root: 'user', uid: 501 }
  await projected(applications, userScope)
  const directory = await api(`/api/v1/devices/${collectorDevice}/inventory-scopes?limit=1`)
  assert.ok(
    directory.asset.items.some((i) => i.scope.kind === 'macos_applications' && i.scope.uid === 501),
  )
  await page.goto(path(`devices/${collectorDevice}`))
  await page.getByRole('tab', { name: '资产信息', exact: true }).click()
  await page.getByRole('button', { name: '用户与安装范围资产', exact: true }).click()
  const scopedInventory = page.locator('[data-testid=scope-inventory]')
  await scopedInventory
    .locator('select')
    .nth(1)
    .locator('option')
    .filter({ hasText: '501' })
    .waitFor({ state: 'attached' })
  const namespace = await scopedInventory
    .locator('select')
    .nth(1)
    .locator('option')
    .filter({ hasText: '501' })
    .getAttribute('value')
  await scopedInventory.locator('select').nth(1).selectOption(namespace)
  const softwareList = scopedInventory
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: 'device.software.installations' }) })
  await softwareList.locator('summary').click()
  await softwareList.getByRole('button', { name: '展开此来源', exact: true }).click()
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid=scope-inventory] tbody tr').length === 20,
  )
  const firstItem = await scopedInventory.locator('tbody tr').first().textContent()
  await scopedInventory.getByRole('button', { name: '下一页', exact: true }).click()
  await page.waitForFunction((previous) => {
    const rows = document.querySelectorAll('[data-testid=scope-inventory] tbody tr')
    return rows.length === 20 && rows[0].textContent !== previous
  }, firstItem)
  assert.ok((await scopedInventory.locator('tbody').textContent()).includes('user'))
  await scopedInventory.getByRole('button', { name: '来源与历史证据', exact: true }).click()
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid=scope-inventory] [data-collection-run]')
      ?.textContent.includes('已投影'),
  )
  assert.ok(
    (await scopedInventory.locator('[data-collection-run]').textContent()).includes('已投影'),
  )
  coverage.push(
    'real-package-instantiation-activation-scope-interval-two-normal-periods-mtls-report-projection',
  )
  coverage.push('real-owner-clear-current-user-readonly-and-user-scope-software-pagination')

  await page.goto(path(`policies/assignments?id=${apps.policy}`))
  await loaded()
  await page.getByRole('button', { name: '禁用整个 Policy', exact: true }).click()
  await loaded()
  const localApps = await configurePackage('macos.agent.applications_local')
  const localApplications = controlCollection('applications', localApps.resource, 1)
  const localScope = { kind: 'macos_applications', root: 'local', uid: null }
  await projected(localApplications, localScope)
  const localInventory = await api(
    `/api/v1/devices/${collectorDevice}/inventory?scope=${encodeURIComponent(JSON.stringify(localScope))}`,
  )
  assert.equal(
    localInventory.asset.device.lists['device.software.installations'].state.kind,
    'known',
  )
  await page.goto(path(`policies/assignments?id=${localApps.policy}`))
  await loaded()
  await page.getByRole('button', { name: '禁用整个 Policy', exact: true }).click()
  await loaded()
  // Adjust a disabled package, then restore it through the existing lifecycle owner.
  await page.goto(path(`policies/assignments?id=${memory.policy}`))
  await loaded()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await page.getByRole('button', { name: '加载资源版本', exact: true }).click()
  await page.locator('[data-field=collection-period]').fill('120')
  await page
    .locator('[data-form=policy]')
    .getByRole('button', { name: '保存', exact: true })
    .click()
  await loaded()
  const adjusted = await api(`/api/v1/policies/${memory.policy}`)
  assert.equal(adjusted.definition.action.schedule.trigger.seconds, 120)
  assert.equal(adjusted.state, 'disabled')
  assert.notEqual(adjusted.versionId, memory.version)
  await page.getByRole('button', { name: '启用整个 Policy', exact: true }).click()
  await loaded()
  assert.equal((await api(`/api/v1/policies/${memory.policy}`)).versionId, adjusted.versionId)
  const restoredCollection = controlCollection('memory', memory.resource, 4)
  await projected(restoredCollection)
  coverage.push('real-device-user-installation-scopes-period-adjustment-disable-restore')

  await page.goto(path(`device-views/association/${id}`))
  await loaded()
  phase = 'authorization'
  await writeRule([{ operation: 'inventory_read', scope: { kind: 'all_devices' } }])
  await page.reload()
  await loaded()
  assert.equal(await panel().count(), 0)
  assert.equal((await confirm(body(association))).status(), 403)
  await writeRule([{ operation: 'inventory_read', scope: { kind: 'device', id: fixture.mdm } }])
  const scoped = await api('/api/v1/device-views')
  assert.deepEqual((await api('/api/v1/device-views/statistics')).statistics, {
    endpointCount: 1,
    deviceViewCount: 1,
  })
  assert.ok(!JSON.stringify(scoped).includes(fixture.agent))
  assert.ok(!JSON.stringify(scoped).includes(id))
  assert.equal(
    (await request('get', origin + `/api/v1/device-views/association/${id}`)).status(),
    404,
  )
  await page.reload()
  await page.getByRole('alert').waitFor()
  assert.equal(await page.locator('[data-endpoint]').count(), 0)
  coverage.push('real-readonly-403-scoped-counterpart-404')
  const anonymous = await browser.newContext({ ignoreHTTPSErrors: true })
  assert.equal((await anonymous.request.get(origin + '/api/v1/device-views')).status(), 401)
  await anonymous.close()
  coverage.push('real-anonymous-401')
  phase = 'revoke'
  await writeRule(fixture.rule.grants)
  await page.reload()
  await page.getByRole('tab', { name: '管理', exact: true }).click()
  await panel().waitFor()
  const registrations = await api(`/api/v1/devices/${fixture.agent}/registrations`)
  await panel()
    .getByLabel('解除原因', { exact: true })
    .fill('Separate fixture management identities')
  await panel()
    .getByLabel('我已核实双方属于同一管理实例，确认双方注册坐标', { exact: true })
    .check()
  await page.getByRole('button', { name: '解除关联', exact: true }).click()
  await page.waitForURL(/\/devices$/)
  assert.equal((await api(`/api/v1/device-associations/${id}`)).state, 'revoked')
  assert.deepEqual(await api(`/api/v1/devices/${fixture.agent}/registrations`), registrations)
  coverage.push('real-revoke-retains-credentials')
  result = 'passed'
} catch (error) {
  const line = error.stack?.match(/(?:device|experience)-browser\.mjs:(\d+)/)?.[1]
  const alerts =
    (await page
      ?.getByRole('alert')
      .allTextContents()
      .catch(() => [])) ?? []
  const ui = page
    ? {
        consoleCount: await page
          .locator('section.console-page')
          .count()
          .catch(() => 0),
        login: await page
          .locator('#login-name')
          .count()
          .catch(() => 0),
        inventoryLists: await page
          .locator('[data-testid=scope-inventory] details')
          .count()
          .catch(() => 0),
        scopeResults: await page
          .locator('.scope-results')
          .count()
          .catch(() => 0),
        dialogs: await page
          .getByRole('dialog')
          .count()
          .catch(() => 0),
        taskButtons: await page
          .getByRole('button', { name: '读取任务状态', exact: true })
          .count()
          .catch(() => 0),
        taskButtonEnabled: await page
          .getByRole('button', { name: '读取任务状态', exact: true })
          .isEnabled()
          .catch(() => false),
        failures: ['输入或响应无效', '请求被拒绝', '对象或操作不存在', '服务暂不可用'].filter(
          (text) => alerts.some((alert) => alert.includes(text)),
        ),
      }
    : undefined
  console.log(
    JSON.stringify({
      phase,
      result: 'failed',
      line,
      classification: error.name,
      ui,
      responses,
      pageErrors,
      associatedDiagnostics,
    }),
  )
} finally {
  clearTimeout(timer)
  await close()
  if (cleanupFailed || interrupted) result = 'failed'
  console.log(
    JSON.stringify({
      phase: 'device-browser',
      result,
      coverage,
      browserCleanup: cleanupFailed ? 'failed' : 'passed',
    }),
  )
  if (result !== 'passed') process.exitCode = 1
}
