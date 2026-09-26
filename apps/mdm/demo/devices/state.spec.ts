import { expect, it } from 'vitest'
import { createDeviceDemo } from './state'
import { createScenario, TENANT } from '../scenario'
it('resets domain changes and blocks published device endpoints when real is selected', async () => {
  const domain = createDeviceDemo()
  const scenario = createScenario([domain.handle], domain.reset)
  const login = await scenario.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  expect(login.status).toBe(200)
  expect((await scenario.handle('GET', '/api/v2/asset-fields')).status).toBe(200)
  await scenario.handle(
    'POST',
    '/api/mdm-candidate/v1/workspace/scenario',
    {
      scenario: 'normal',
      module: 'devices',
      source: 'real',
    },
    { 'x-csrf-token': (login.body as { csrfToken: string }).csrfToken, 'x-identity-request': '1' },
  )
  for (const path of [
    '/api/v2/asset-fields',
    '/api/v2/device-queries',
    '/api/v2/groups/x',
    '/api/v3/enrollments/x',
    '/api/mdm-candidate/v1/devices',
  ]) {
    expect((await scenario.handle('GET', path)).status).toBe(503)
  }
  scenario.reset()
  expect((await scenario.handle('GET', '/api/v2/asset-fields')).status).toBe(401)
})
