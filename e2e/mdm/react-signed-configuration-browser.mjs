import assert from 'node:assert/strict'
import { realBrowser } from './react-mdm-browser.mjs'
import { signedConfigurationJourney } from './signed-configuration-journey.mjs'
const run = await realBrowser('MDM_ENROLLMENT_BROWSER_FIXTURE', 'react-signed-configuration')
let failure
try {
  const page = await run.page()
  await run.login(page)
  await run.nav(page, '/connections', '连接配置')
  const connections = `/api/v1/tenants/${run.fixture.tenant}/agent-connections`
  const openConnections = () => page.getByRole('tab', { name: 'Agent 连接', exact: true }).click()
  const status = await run.response(page, 'GET', connections, openConnections)
  assert.equal((await status.json()).serviceId, run.fixture.serviceId)
  await page.getByText('当前签名连接配置', { exact: true }).waitFor()
  run.checks.push('formal-installation-agent-connection-status')

  const signed = await signedConfigurationJourney(run, page)
  await run.nav(page, '/connections', '连接配置')
  await run.response(page, 'GET', connections, openConnections)
  await page.getByText(signed.configuration.preferredOrigin, { exact: true }).waitFor()
  const receipt = await run.response(page, 'GET', connections + '/configuration', () =>
    page.getByRole('button', { name: '准备下载连接恢复文件', exact: true }).click(),
  )
  assert.deepEqual(await receipt.json(), signed)
  const save = page.getByRole('link', { name: /^保存连接恢复文件/ })
  const pending = page.waitForEvent('download')
  await save.click()
  const file = await pending
  assert.equal(file.suggestedFilename(), 'rss-agent-connections.json')
  assert.equal(await file.failure(), null)
  await file.delete()
  await page.getByRole('button', { name: '清除下载', exact: true }).click()
  await save.waitFor({ state: 'hidden' })
  run.checks.push('signed-recovery-file-through-real-browser-download')
} catch (error) {
  failure = error
}
await run.finish(failure)
