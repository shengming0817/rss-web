// Production React against disposable real HTTPS/PG/Identity. No mock completion facts.
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { realBrowser } from './react-mdm-browser.mjs'
const run = await realBrowser('MDM_DEVICE_BROWSER_FIXTURE', 'react-setup'),
  shots = mkdtempSync(join(tmpdir(), 'rss-react-setup-'))
let failure
try {
  const page = await run.page(),
    { origin, fixture, checks } = run
  await run.login(page)
  await page.waitForURL((url) => url.pathname === '/setup')
  await page.getByRole('button', { name: '保存意图', exact: true }).waitFor({ state: 'visible' })
  await page.getByRole('checkbox', { name: 'Agent 通道', exact: true }).check()
  await page.getByRole('checkbox', { name: 'Windows MDM', exact: true }).uncheck()
  await run.choose(page, page.getByRole('combobox', { name: '邮件', exact: true }), '显式跳过')
  await page
    .getByRole('textbox', { name: '邮件 跳过原因', exact: true })
    .fill('This installation does not need mail')
  run.step('lost-original-receipt')
  let operation,
    writes = 0,
    discarded = false
  const lose = async (route) => {
    if (route.request().method() !== 'PUT') return route.continue()
    writes++
    operation = route.request().headers()['idempotency-key']
    const response = await route.fetch({ maxRetries: 0 })
    assert.equal(response.status(), 200)
    assert.equal((await response.json()).operationId, operation)
    discarded = true
    await route.abort('failed')
  }
  await page.route('**/api/v1/settings/first-use', lose)
  await page.getByRole('button', { name: '保存意图', exact: true }).click()
  await page.getByRole('button', { name: '查询原操作', exact: true }).waitFor()
  assert.ok(discarded && operation)
  assert.equal(writes, 1)
  await page.unroute('**/api/v1/settings/first-use', lose)
  await page.getByRole('button', { name: '查询原操作', exact: true }).click()
  await page
    .getByText('原请求回执已核对；完成与健康以重新读取的进度为准。', { exact: true })
    .waitFor()
  assert.equal(writes, 1)
  await page.reload()
  assert.equal(
    await page.getByRole('checkbox', { name: 'Agent 通道', exact: true }).isChecked(),
    true,
  )
  await page.getByRole('textbox', { name: '邮件 跳过原因', exact: true }).waitFor()
  assert.equal(
    await page.getByRole('textbox', { name: '邮件 跳过原因', exact: true }).inputValue(),
    'This installation does not need mail',
  )
  checks.push(
    'first-login-authoritative-intent',
    'explicit-skip-reason',
    'unknown-write-no-replay',
    'original-receipt-and-refresh',
  )
  const session = await (
    await page.request.get(origin + `/api/v1/identity/tenants/${fixture.tenant}/session`)
  ).json()
  const writeHeaders = {
    Origin: origin,
    'X-Identity-Request': '1',
    'X-CSRF-Token': session.csrfToken,
  }
  const progress = async () => {
    const r = await page.request.get(origin + '/api/v1/settings/first-use')
    assert.equal(r.status(), 200)
    return r.json()
  }
  const observed = await progress()
  assert.equal(observed.saved.intent.completionRequested, false)
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.locator('[data-setup-step=agent]').waitFor()
  await page.getByRole('link', { name: '打开所属配置', exact: true }).first().click()
  await page.getByRole('tab', { name: 'Agent 连接', exact: true }).waitFor()
  await run.nav(page, '/setup', '租户初始化')
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  const current = await progress()
  if (!current.canComplete)
    throw new Error(
      'Real fixture channel is not ready: ' +
        current.steps.map((s) => s.id + ':' + s.status).join(','),
    )
  await page.getByRole('button', { name: '确认完成初始化', exact: true }).click()
  await page.locator('.ant-modal-footer .ant-btn-primary').click()
  await page.getByText('初始化已确认，后续健康仍按当前观察更新。', { exact: true }).waitFor()
  assert.equal((await progress()).complete, true)
  checks.push('actual-owner-navigation', 'server-confirmed-completion')
  await page.getByRole('textbox', { name: '原操作标识', exact: true }).fill(operation)
  await page.getByRole('button', { name: '查询回执', exact: true }).click()
  await page
    .getByText('原请求回执已核对；完成与健康以重新读取的进度为准。', { exact: true })
    .waitFor()
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await run.login(page)
  await page.waitForURL((url) => url.pathname === '/')
  checks.push('relogin-does-not-force-setup-after-confirmation')
  await run.nav(page, '/settings', '设置')
  await page.locator('.settings-page .group-grid .panel').first().waitFor()
  for (const [name, width, height] of [
    ['desktop', 1440, 960],
    ['tablet', 1024, 900],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height })
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'settings fits viewport',
    )
    await page.screenshot({
      path: join(shots, `settings-${name}.png`),
      fullPage: true,
      animations: 'disabled',
    })
  }
  await page.setViewportSize({ width: 1440, height: 960 })
  await run.nav(page, '/setup', '租户初始化')
  await page.screenshot({
    path: join(shots, 'setup-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: '切换亮暗主题' }).click()
  await page.screenshot({
    path: join(shots, 'setup-dark.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    'setup fits viewport',
  )
  await page.screenshot({
    path: join(shots, 'setup-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await page.setViewportSize({ width: 1440, height: 960 })
  await run.nav(page, '/diagnostics', '运行诊断')
  await page.getByText('按组件所属模块拆分的诊断尚未就绪', { exact: true }).waitFor()
  assert.equal(run.count(page, 'GET', '/api/v1/runtime/diagnostics'), 0)
  checks.push('production-explicit-contract-gap-no-retired-dto', 'responsive-public-layouts')
  // Revoke configuration permissions through the existing formal rule owner.
  const rule = {
    ...fixture.rule,
    grants: fixture.rule.grants.filter(
      (g) => !g.operation.startsWith('registration_configuration_'),
    ),
  }
  const renewedSession = await (
    await page.request.get(origin + `/api/v1/identity/tenants/${fixture.tenant}/session`)
  ).json()
  writeHeaders['X-CSRF-Token'] = renewedSession.csrfToken
  const response = await page.request.put(
    origin + `/api/v1/authorization/rules/${fixture.ruleId}`,
    {
      headers: writeHeaders,
      data: { operationId: randomUUID(), expectedRevision: 1, value: rule },
    },
  )
  assert.equal(response.status(), 200)
  await run.nav(page, '/setup', '租户初始化')
  await page.getByText('当前账户没有初始化读取权限。', { exact: true }).waitFor()
  assert.equal(await page.locator('[data-setup-step]').count(), 0)
  checks.push('formal-permission-revocation-clears-setup')
  console.log(JSON.stringify({ screenshots: shots, coverage: checks }))
} catch (error) {
  failure = error
  console.error(JSON.stringify({ journey: 'react-setup', failure: error.message }))
} finally {
  await run.finish(failure)
  if (failure) process.exitCode = 1
}
