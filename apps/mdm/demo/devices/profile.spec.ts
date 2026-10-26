import { randomUUID } from 'node:crypto'
import { expect, it, vi, afterEach } from 'vitest'
import { createScenario, TENANT, MANAGEMENT_TENANT } from '../scenario'
import { createDeviceDemo } from './state'
import { createAutomationDemo } from '../policies/state'
import { REVIEWER } from '../operations/authorization'
const password = Buffer.alloc(32, 1).toString('base64url'),
  other = Buffer.alloc(32, 2).toString('base64url')
afterEach(() => vi.useRealTimers())
async function setup() {
  const devices = createDeviceDemo(),
    automation = createAutomationDemo(devices)
  devices.bindAuthorization(automation.authorization.can)
  const scenario = createScenario(
    [(request) => automation.authorization.guard(request), devices.handle],
    () => devices.reset(),
  )
  const login = await scenario.handle('POST', `/api/v1/identity/tenants/${TENANT}/login`, {
    login: 'reviewer',
    password: 'demo',
  })
  const token = (login.body as { csrfToken: string }).csrfToken
  const sessionId = (login.body as { session: { id: string } }).session.id
  const headers = {
    'x-csrf-token': token,
    'x-identity-request': '1',
    'idempotency-key': randomUUID(),
  }
  const created = await scenario.handle(
    'POST',
    '/api/v1/self-enrollments',
    { password, source: 'mdm.apple' },
    headers,
  )
  expect(created.status).toBe(200)
  const receipt = created.body as { deviceId: string; enrollmentId: string }
  return {
    devices,
    automation,
    scenario,
    headers,
    sessionId,
    receipt,
    path: `/api/v1/enrollments/${receipt.enrollmentId}/profile`,
  }
}
it('delivers an explicitly synthetic profile through the public password endpoint without granting reader enrollment authority', async () => {
  const { automation, scenario, receipt, path } = await setup()
  expect(automation.authorization.can(REVIEWER, 'enrollment', receipt.deviceId)).toBe(false)
  expect(
    (await scenario.handle('POST', '/api/v1/self-enrollments', { password, source: 'mdm.apple' }))
      .status,
  ).toBe(403)
  const file = await scenario.handle('POST', path, { password })
  expect(file.status).toBe(200)
  expect(file.headers).toMatchObject({
    'Content-Type': 'application/x-apple-aspen-config',
    'Content-Disposition': 'attachment; filename="RSS-MDM.mobileconfig"',
    'Cache-Control': 'no-store',
  })
  expect(Object.prototype.toString.call(file.body)).toBe('[object ArrayBuffer]')
  const text = Buffer.from(file.body as ArrayBuffer).toString('utf8')
  expect(text).toContain('Explicit Mock content. Not CMS signed.')
  expect(text).not.toContain(password)
  const read = await scenario.handle('GET', `/api/v1/enrollments/${receipt.enrollmentId}`)
  expect(read.body).toMatchObject({
    deviceId: receipt.deviceId,
    status: 'pending',
    progress: {
      profilePrepared: 'observed',
      certificateIssued: false,
      firstAuthenticatedCheckIn: false,
      systemConfirmation: 'unknown',
      managementReady: false,
    },
  })
  expect(JSON.stringify(read.body)).not.toContain('passwordDigest')
  expect(automation.authorization.can(REVIEWER, 'enrollment', receipt.deviceId)).toBe(false)
})
it('fences wrong secrets, original authority, rotation, cancellation and expiry', async () => {
  const { devices, scenario, headers, sessionId, receipt, path } = await setup()
  expect((await scenario.handle('POST', path, { password: other })).status).toBe(403)
  for (const actor of [
    { principalId: REVIEWER, sessionId, tenantId: MANAGEMENT_TENANT },
    { principalId: REVIEWER, sessionId: 'other-session', tenantId: TENANT },
    { principalId: 'another-person', sessionId, tenantId: TENANT },
  ]) {
    const foreign = devices.handle(
      {
        method: 'POST',
        path,
        body: { password },
        query: new URLSearchParams(),
        headers: {},
        actor,
      },
      'normal',
    )!
    expect(foreign.status).toBe(403)
  }
  const windows = await scenario.handle(
    'POST',
    '/api/v1/self-enrollments',
    { password: other, source: 'mdm.windows', windowsProfile: 'Full' },
    { ...headers, 'idempotency-key': randomUUID() },
  )
  expect(windows.status).toBe(200)
  expect(
    (
      await scenario.handle(
        'POST',
        `/api/v1/enrollments/${(windows.body as { enrollmentId: string }).enrollmentId}/profile`,
        { password: other },
      )
    ).status,
  ).toBe(403)

  expect(
    (
      await scenario.handle(
        'POST',
        `/api/v1/enrollments/${receipt.enrollmentId}/resume`,
        { password: other },
        { ...headers, 'idempotency-key': randomUUID() },
      )
    ).status,
  ).toBe(200)
  expect((await scenario.handle('POST', path, { password })).status).toBe(403)
  expect((await scenario.handle('POST', path, { password: other })).status).toBe(200)
  expect(
    (
      await scenario.handle(
        'POST',
        `/api/v1/enrollments/${receipt.enrollmentId}/cancel`,
        {},
        { ...headers, 'idempotency-key': randomUUID() },
      )
    ).status,
  ).toBe(200)
  expect((await scenario.handle('POST', path, { password: other })).status).toBe(403)
  const fresh = await setup()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.now() + 301_000)
  expect((await fresh.scenario.handle('POST', fresh.path, { password })).status).toBe(403)
})
