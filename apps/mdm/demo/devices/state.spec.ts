import { randomUUID } from 'node:crypto'
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
  const headers = {
    'x-csrf-token': (login.body as { csrfToken: string }).csrfToken,
    'x-identity-request': '1',
  }
  const created = await scenario.handle(
    'POST',
    '/api/v1/self-enrollments/agent',
    { wireVersion: 1, operationId: randomUUID(), secret: 'A'.repeat(43), platform: 'windows' },
    headers,
  )
  expect(created.status).toBe(200)
  const grantId = (created.body as { grantId: string }).grantId
  expect((await scenario.handle('GET', `/api/v1/agent-grants/${grantId}`)).status).toBe(200)
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
    '/api/v1/registration-quotas/me',
    `/api/v1/agent-grants/${grantId}`,
    '/api/v1/mdm-candidate/devices',
  ]) {
    expect((await scenario.handle('GET', path)).status).toBe(503)
  }
  scenario.reset()
  expect((await scenario.handle('GET', '/api/v1/asset-fields')).status).toBe(401)
})
