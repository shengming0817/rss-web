import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createAutomationDemo } from './state'
import { createDeviceDemo } from '../devices/state'
import { createScenario, TENANT } from '../scenario'
import { executionSummary } from '../../src/features/policies/clients/executions'
it('resolves device batch execution IDs through the same execution projection and resets every owner', async () => {
  const devices = createDeviceDemo(),
    automation = createAutomationDemo(devices),
    scenario = createScenario([automation.handle, devices.handle], () => {
      devices.reset()
      automation.reset()
    })
  const login = await scenario.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  const headers = {
    'x-csrf-token': (login.body as { csrfToken: string }).csrfToken,
    'x-identity-request': '1',
  }
  const id = randomUUID(),
    device = devices.facts()[0]!.summary.id
  expect(
    (
      await scenario.handle(
        'POST',
        '/api/mdm-candidate/v1/devices/batch-previews',
        { operationId: id, expectedRevision: 0, input: { action: 'lost', devices: [device] } },
        headers,
      )
    ).status,
  ).toBe(200)
  const reply = await scenario.handle(
    'POST',
    `/api/mdm-candidate/v1/devices/batch-previews/${id}/execute`,
    { operationId: randomUUID(), expectedRevision: 1, input: { confirmed: true } },
    headers,
  )
  expect(reply.status).toBe(202)
  const execution = (reply.body as { targets: { execution: string }[] }).targets[0]!.execution
  const detail = await scenario.handle('GET', `/api/mdm-candidate/v1/executions/${execution}`)
  expect(detail.status).toBe(200)
  expect(executionSummary((detail.body as { execution: unknown }).execution)).toMatchObject({
    id: execution,
    batch: id,
    origin: { kind: 'device_batch', batch: id },
    compliance: 'unknown',
  })
  automation.reset()
  // Resetting automation cannot remove a device-owned batch execution.
  expect(
    (await scenario.handle('GET', `/api/mdm-candidate/v1/executions/${execution}`)).status,
  ).toBe(200)
  devices.reset()
  expect(
    (await scenario.handle('GET', `/api/mdm-candidate/v1/executions/${execution}`)).status,
  ).toBe(404)
})
