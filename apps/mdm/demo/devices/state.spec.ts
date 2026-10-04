import { expect, it } from 'vitest'
import { createDeviceDemo } from './state'
import { createScenario, TENANT } from '../scenario'
it('resets domain changes and blocks published device endpoints when real is selected', async () => {
  const domain = createDeviceDemo()
  const scenario = createScenario([domain.handle], domain.reset)
  const login = await scenario.handle('POST', `/api/v1/identity/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  expect(login.status).toBe(200)
  expect((await scenario.handle('GET', '/api/v1/asset-fields')).status).toBe(200)
  await scenario.handle(
    'POST',
    '/api/v1/mdm-candidate/workspace/scenario',
    {
      scenario: 'normal',
      module: 'devices',
      source: 'real',
    },
    { 'x-csrf-token': (login.body as { csrfToken: string }).csrfToken, 'x-identity-request': '1' },
  )
  for (const path of [
    '/api/v1/asset-fields',
    '/api/v1/device-queries',
    '/api/v1/groups/x',
    '/api/v1/enrollments/x',
    '/api/v1/mdm-candidate/devices',
  ]) {
    expect((await scenario.handle('GET', path)).status).toBe(503)
  }
  scenario.reset()
  expect((await scenario.handle('GET', '/api/v1/asset-fields')).status).toBe(401)
})
