import { expect, it } from 'vitest'
import { createAutomationDemo } from '../policies/state'
import { createDeviceDemo } from '../devices/state'
import { createScenario, TENANT } from '../scenario'
import { operation } from '../../src/services/useOperation'
import { ADMIN_RULE } from './authorization'
it('checks action and every device before preview, execution and exact replay after revocation', async () => {
  const devices = createDeviceDemo(),
    automation = createAutomationDemo(devices)
  const server = createScenario(
    [automation.handle, devices.handle],
    automation.reset,
    automation.tick,
  )
  async function login(role: 'admin' | 'reviewer') {
    const reply = await server.handle('POST', `/api/v1/identity/tenants/${TENANT}/login`, {
      login: role === 'admin' ? 'demo' : 'reviewer',
      password: 'demo',
    })
    return {
      'x-csrf-token': (reply.body as { csrfToken: string }).csrfToken,
      'x-identity-request': '1',
    }
  }
  const root = '/api/v1/mdm-candidate/devices/batch-previews',
    preview = operation({ action: 'wipe', devices: ['device-01'] })
  const reviewer = await login('reviewer')
  expect((await server.handle('POST', root, preview, reviewer)).status).toBe(403)
  let admin = await login('admin')
  await server.handle(
    'PUT',
    '/api/v1/authorization/rules/77777777-7777-4777-8777-777777777777',
    {
      operationId: crypto.randomUUID(),
      expectedRevision: 1,
      value: {
        subject: {
          kind: 'user',
          user: {
            instanceId: '44444444-4444-4444-8444-444444444444',
            tenantId: TENANT,
            principalId: '33333333-3333-4333-8333-333333333333',
          },
        },
        grants: [
          { operation: 'inventory_read', scope: { kind: 'all_devices' } },
          { operation: 'device_wipe', scope: { kind: 'device', id: 'device-01' } },
        ],
      },
    },
    admin,
  )
  const scoped = await login('reviewer')
  expect(
    (
      await server.handle(
        'POST',
        root,
        operation({ action: 'wipe', devices: ['device-01'] }),
        scoped,
      )
    ).status,
  ).toBe(200)
  expect(
    (
      await server.handle(
        'POST',
        root,
        operation({ action: 'wipe', devices: ['device-01', 'device-02'] }),
        scoped,
      )
    ).status,
  ).toBe(403)
  expect(
    (
      await server.handle(
        'POST',
        root,
        operation({ action: 'onboard', devices: ['device-01'] }),
        scoped,
      )
    ).status,
  ).toBe(403)
  admin = await login('admin')
  expect((await server.handle('POST', root, preview, admin)).status).toBe(200)
  const execute = operation({ confirmed: true }, 1),
    path = `${root}/${preview.operationId}/execute`
  expect((await server.handle('POST', path, execute, admin)).status).toBe(202)
  const pendingPreview = operation({ action: 'wipe', devices: ['device-01'] })
  expect((await server.handle('POST', root, pendingPreview, admin)).status).toBe(200)
  await server.handle(
    'PUT',
    `/api/v1/authorization/rules/${ADMIN_RULE}`,
    { operationId: crypto.randomUUID(), expectedRevision: 1, value: null },
    admin,
  )
  expect((await server.handle('POST', path, execute, admin)).status).toBe(403)
  expect(
    (
      await server.handle(
        'POST',
        `${root}/${pendingPreview.operationId}/execute`,
        operation({ confirmed: true }, 1),
        admin,
      )
    ).status,
  ).toBe(403)
  expect((await server.handle('GET', `${root}/${preview.operationId}`)).status).toBe(403)
})
