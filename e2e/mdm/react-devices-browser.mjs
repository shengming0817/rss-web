import { realBrowser } from './react-mdm-browser.mjs'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const run = await realBrowser('MDM_DEVICE_BROWSER_FIXTURE', 'react-devices')
let failure, diagnosticPage
try {
  const { fixture: f, origin, checks } = run,
    p = await run.page()
  diagnosticPage = p
  async function openDevice(kind, id, navigate) {
    const path = `/api/v1/device-views/${kind}/${id}`,
      matches = (response) =>
        response.request().method() === 'GET' && new URL(response.url()).pathname === path
    let waiting = p.waitForResponse(matches)
    await navigate()
    let result = await waiting
    // A concurrent fixture observation can invalidate a read snapshot. Exercise the visible
    // explicit reread, while leaving product read/write retry behavior unchanged.
    for (let attempt = 0; result.status() === 409 && attempt < 2; attempt++) {
      waiting = p.waitForResponse(matches)
      await p.getByRole('button', { name: '读取最新设备事实', exact: true }).click()
      result = await waiting
    }
    assert.equal(result.status(), 200)
  }
  await run.login(p)
  await run.nav(p, '/devices', '设备')
  run.step('endpoint-directory')
  const endpointResponse = p.waitForResponse(
    (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/v1/devices',
  )
  await p.getByRole('tab', { name: '终端目录', exact: true }).click()
  const endpointRead = await endpointResponse
  assert.equal(endpointRead.status(), 200, 'formal endpoint directory')
  const endpointPage = await endpointRead.json()
  assert.equal(endpointPage.items.length, 20)
  const next = p
    .getByRole('tabpanel', { name: '终端目录', exact: true })
    .getByRole('button', { name: '下一页', exact: true })
  await run.response(p, 'GET', '/api/v1/devices', () => next.click())
  await p.getByRole('link', { name: f.mdm, exact: true }).waitFor()
  assert.ok((await p.locator('.data-table tbody tr').count()) >= 3)
  checks.push('real-endpoint-directory-retains-distinct-identities')
  run.step('responsive-shell')
  const screenshots = mkdtempSync(join(tmpdir(), 'rss-react-devices-'))
  await p.screenshot({
    path: join(screenshots, 'devices-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await p.setViewportSize({ width: 390, height: 844 })
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await p.screenshot({
    path: join(screenshots, 'devices-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await p.getByRole('button', { name: '打开导航', exact: true }).click()
  await p.getByRole('dialog').getByRole('link', { name: '设备', exact: true }).waitFor()
  await p.keyboard.press('Escape')
  await p.getByRole('dialog').waitFor({ state: 'hidden' })
  await p.setViewportSize({ width: 1440, height: 960 })
  await p.getByRole('button', { name: '切换亮暗主题', exact: true }).click()
  await p.screenshot({
    path: join(screenshots, 'devices-dark.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await p.getByRole('button', { name: '切换亮暗主题', exact: true }).click()
  checks.push('desktop-mobile-drawer-and-dark-design')
  console.log(JSON.stringify({ journey: 'react-devices', screenshots }))
  run.step('association-verification')
  await openDevice('endpoint', f.mdm, () =>
    p.getByRole('link', { name: f.mdm, exact: true }).click(),
  )
  await p.getByRole('button', { name: '读取最新设备事实', exact: true }).waitFor()
  await p.getByRole('tab', { name: '终端关联', exact: true }).click()
  const candidatesPath = `/api/v1/devices/${f.mdm}/association-candidates`
  let candidates = await (
    await run.response(p, 'GET', candidatesPath, () =>
      p.getByRole('button', { name: '关联另一通道终端', exact: true }).click(),
    )
  ).json()
  const d = p.getByRole('dialog', { name: '核验终端关联', exact: true })
  for (
    let page = 0;
    !candidates.items.some((item) => item.device === f.agent) && page < 4;
    page++
  ) {
    assert.ok(candidates.nextCursor, 'target remains discoverable through server candidate pages')
    candidates = await (
      await run.response(p, 'GET', candidatesPath, () =>
        d.getByRole('button', { name: '继续查找候选', exact: true }).click(),
      )
    ).json()
  }
  assert.ok(candidates.items.some((item) => item.device === f.agent))
  const candidateSelect = d.getByLabel('对侧通道候选终端', { exact: true })
  await candidateSelect.click()
  await p.locator('.ant-select-dropdown:visible .ant-select-item-option-content').first().waitFor()
  // Exercise keyboard navigation within the bounded current candidate window.
  for (
    let index = 0;
    index < candidates.items.findIndex((item) => item.device === f.agent);
    index++
  )
    await candidateSelect.press('ArrowDown')
  await p
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .getByText(`${f.agent} · agent`, { exact: true })
    .click()
  await d
    .getByLabel('核验证据或撤销理由', { exact: true })
    .fill('Disposable fixture association, independently identified endpoints')
  await d.getByRole('button', { name: '读取并核对当前终端', exact: true }).click()
  await d.getByRole('checkbox', { name: '已核实两端属于同一实际设备', exact: true }).check()
  // Lose an actually committed response. Subsequent explicit replay must keep the whole original tuple.
  let first,
    replay,
    commits = 0
  const confirmPath = '/api/v1/device-associations',
    pattern = origin + confirmPath
  await p.route(pattern, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    const body = route.request().postDataJSON()
    if (!first) {
      first = body
      const actual = await route.fetch()
      assert.equal(actual.status(), 200)
      commits++
      await route.abort('failed')
    } else {
      replay = body
      await route.continue()
    }
  })
  await d.getByRole('button', { name: '确认关联', exact: true }).click()
  await d.getByRole('button', { name: '显式重提原关系请求', exact: true }).waitFor()
  assert.equal(commits, 1)
  assert.equal(run.count(p, 'POST', confirmPath), 1)
  assert.equal(await p.getByLabel('当前操作终端', { exact: true }).isDisabled(), true)
  const comparing = p.waitForEvent('popup')
  await d.getByRole('link', { name: '在新窗口比较当前关系', exact: true }).click()
  const comparison = await comparing
  await comparison.getByRole('heading', { name: '设备', exact: true }).waitFor()
  await comparison.close()
  await d.getByRole('button', { name: '显式重提原关系请求', exact: true }).waitFor()
  assert.equal(run.count(p, 'POST', confirmPath), 1)
  const receipt = await (
    await run.response(p, 'POST', confirmPath, () =>
      d.getByRole('button', { name: '显式重提原关系请求', exact: true }).click(),
    )
  ).json()
  assert.deepEqual(replay, first)
  assert.equal(receipt.version, 1)
  assert.equal(receipt.members.find((m) => m.channel === 'mdm').device, f.mdm)
  assert.equal(receipt.members.find((m) => m.channel === 'agent').device, f.agent)
  assert.deepEqual(first.mdm, { device: f.mdm, channel: 'mdm' })
  assert.deepEqual(first.agent, { device: f.agent, channel: 'agent' })
  await d.getByText('原关系操作已确认。', { exact: true }).waitFor()
  await p.unroute(pattern)
  await d.locator('.ant-modal-close').click()
  checks.push('association-committed-loss-frozen-registration-replay-no-comparison-write')
  await run.nav(p, '/devices?tab=associations', '设备')
  await p.getByRole('button', { name: receipt.id, exact: true }).waitFor()
  await p.getByRole('button', { name: receipt.id, exact: true }).click()
  await p.getByRole('dialog').getByText(f.mdm, { exact: false }).waitFor()
  checks.push('formal-association-directory-and-full-detail')
  await p.getByRole('dialog').locator('.ant-modal-close').click()
  await openDevice('association', receipt.id, () =>
    p.goto(origin + `/devices/association/${receipt.id}`),
  )
  await p.getByRole('button', { name: '读取最新设备事实', exact: true }).waitFor()
  await run.choose(p, p.getByLabel('当前操作终端', { exact: true }), `${f.mdm} · ${f.mdm}`)
  await p.getByRole('tab', { name: '人员', exact: true }).click()
  await p.getByText('Device Browser Person', { exact: false }).first().waitFor()
  checks.push('associated-view-personnel-preserves-source-endpoint')
  await p.getByRole('button', { name: '更改注册归属', exact: true }).click()
  const candidatePath = `/api/v1/identity/tenants/${f.tenant}/accounts/${f.personB.principalId}`
  let releaseCandidate, candidateObserved
  const held = new Promise((resolve) => {
      releaseCandidate = resolve
    }),
    observed = new Promise((resolve) => {
      candidateObserved = resolve
    })
  await p.route(origin + candidatePath, async (route) => {
    const actual = await route.fetch()
    assert.equal(actual.status(), 200)
    candidateObserved()
    await held
    await route.fulfill({ response: actual })
  })
  run.step('personnel-candidate-selection')
  await run.choose(
    p,
    p.getByRole('combobox', { name: '选择租户人员', exact: true }),
    f.personB.login,
  )
  run.step('personnel-verification-in-flight')
  await observed
  assert.equal(
    await p.getByRole('button', { name: '保存人员归属', exact: true }).isDisabled(),
    true,
  )
  releaseCandidate()
  run.step('personnel-verification-confirmed')
  await p.locator('.user-picker > p.subtitle').filter({ hasText: f.personB.principalId }).waitFor()
  const assigned = await (
    await run.response(p, 'PUT', `/api/v1/devices/${f.mdm}/registration-user`, () =>
      p.getByRole('button', { name: '保存人员归属', exact: true }).click(),
    )
  ).json()
  assert.equal(assigned.user.principalId, f.personB.principalId)
  await p.unroute(origin + candidatePath)
  checks.push('personnel-verification-blocks-save-until-the-displayed-account-is-confirmed')
  await p.getByRole('tab', { name: '终端关联', exact: true }).click()
  await p.getByRole('button', { name: '核验或撤销关系', exact: true }).click()
  await d
    .getByLabel('核验证据或撤销理由', { exact: true })
    .fill('End disposable relation without changing registrations')
  await d.getByRole('button', { name: '读取撤销版本', exact: true }).click()
  const revoked = await (
    await run.response(p, 'POST', `${confirmPath}/${receipt.id}/revoke`, () =>
      d.getByRole('button', { name: '确认撤销关系', exact: true }).click(),
    )
  ).json()
  assert.equal(revoked.state, 'revoked')
  assert.equal(revoked.version, 2)
  checks.push('versioned-association-revocation-keeps-endpoints')
} catch (error) {
  failure = error
  const directory = mkdtempSync(join(tmpdir(), 'rss-react-devices-failure-'))
  await diagnosticPage
    ?.screenshot({ path: join(directory, 'failure.png'), fullPage: true })
    .catch(() => {})
  console.error(JSON.stringify({ journey: 'react-devices', diagnosticDirectory: directory }))
}
await run.finish(failure)
