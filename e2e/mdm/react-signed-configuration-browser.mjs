import assert from 'node:assert/strict'
import { realBrowser } from './react-mdm-browser.mjs'
import { signedConfigurationJourney } from './signed-configuration-journey.mjs'
const run = await realBrowser('MDM_ENROLLMENT_BROWSER_FIXTURE', 'react-signed-configuration')
let failure
try {
  const page = await run.page()
  await run.login(page)
  await run.nav(page, '/connections', '连接配置')
  await page.getByRole('tab', { name: 'Agent 连接', exact: true }).click()
  const published = await run.response(page, 'POST', '/api/v1/agent-connections/publish', () =>
    page.getByRole('button', { name: /^明确发布已保存草稿/ }).click(),
  )
  const value = await published.json()
  assert.equal(value.configuration.serviceId, run.fixture.serviceId)
  assert.equal(value.configuration.tenantId, run.fixture.tenant)
  assert.ok(value.configuration.origins.includes(run.origin))
  run.checks.push('formal-installer-observation-and-real-connection-publication')
  await signedConfigurationJourney(run, page, run.fixture.verificationKeys, value.configuration)
} catch (error) {
  failure = error
}
await run.finish(failure)
