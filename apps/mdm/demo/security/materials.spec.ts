import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createScenario, TENANT } from '../scenario'
import { createDeviceDemo } from '../devices/state'
import { createAutomationDemo } from '../policies/state'
import { operation } from '../../src/services/useOperation'
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-30T00:00:00Z'))
})
afterEach(() => vi.useRealTimers())
const root = '/api/mdm-candidate/v1/security'
async function setup() {
  const devices = createDeviceDemo(),
    automation = createAutomationDemo(devices),
    server = createScenario(
      [automation.handle, devices.handle],
      () => {},
      (event, scenario) => automation.tick(event, scenario),
      automation.observe,
    )
  let headers: Record<string, string> = {}
  async function login(login: 'demo' | 'reviewer') {
    const reply = await server.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
      login,
      password: 'demo',
    })
    const body = reply.body as {
      csrfToken: string
      session: { id: string }
      identity: { principalId: string }
    }
    headers = { 'x-csrf-token': body.csrfToken, 'x-identity-request': '1' }
    return body
  }
  const session = await login('demo'),
    write = (path: string, body: unknown) => server.handle('POST', path, body, headers)
  const material = await server.handle('GET', `${root}/materials/device-01/bitlocker`)
  expect(material.status).toBe(200)
  const now = (material.body as { asOf: number }).asOf
  const request = () =>
    operation({
      target: {
        kind: 'material_access',
        device: 'device-01',
        material: 'bitlocker',
        materialRevision: 1,
        volume: 'os',
        action: 'reveal',
      },
      reason: 'Synthetic recovery exercise',
      validFrom: now,
      validUntil: now + 120,
    })
  return { server, write, login, request, now, session }
}
it('binds one-time disclosure to the approved requester and fresh session without caching the secret', async () => {
  const f = await setup(),
    request = f.request(),
    path = `${root}/requests/${request.operationId}`
  expect((await f.write(`${root}/requests`, request)).status).toBe(200)
  expect((await f.write(`${path}/approve`, operation({}, 1))).status).toBe(403)
  await f.login('reviewer')
  await f.write(`${path}/approve`, operation({}, 1))
  const disclosure = {
    disclosureId: crypto.randomUUID(),
    request: request.operationId,
    expectedRevision: 2,
  }
  expect((await f.write(`${root}/materials/device-01/bitlocker/reveal`, disclosure)).status).toBe(
    403,
  )
  const fresh = await f.login('demo')
  expect(fresh.session.id).not.toBe(f.session.session.id)
  const revealed = await f.write(`${root}/materials/device-01/bitlocker/reveal`, disclosure)
  expect(revealed.status).toBe(200)
  expect(revealed.body).toMatchObject({
    disclosureId: disclosure.disclosureId,
    request: request.operationId,
    device: 'device-01',
    material: 'bitlocker',
    materialRevision: 1,
    principal: fresh.identity.principalId,
    sessionId: fresh.session.id,
    secret: expect.stringContaining('SYNTHETIC'),
  })
  expect((await f.write(`${root}/materials/device-01/bitlocker/reveal`, disclosure)).status).toBe(
    409,
  )
  expect(
    (
      await f.write(`${root}/materials/device-01/bitlocker/reveal`, {
        ...disclosure,
        disclosureId: crypto.randomUUID(),
      })
    ).status,
  ).toBe(409)
  expect((await f.server.handle('GET', path)).body).toMatchObject({
    request: { state: 'consumed', consumption: { disclosure: disclosure.disclosureId } },
  })
  for (const path of [
    `${root}/materials/device-01/bitlocker`,
    `${root}/requests`,
    `${root}/actions`,
    '/api/mdm-candidate/v1/operations/audit',
    '/api/mdm-candidate/v1/operations/alerts',
    '/api/mdm-candidate/v1/executions',
  ]) {
    const read = await f.server.handle('GET', path)
    expect(JSON.stringify(read.body)).not.toContain((revealed.body as { secret: string }).secret)
  }
})
it('consumes a lost disclosure reply and excludes Bootstrap Token from administrator secret access', async () => {
  const f = await setup(),
    request = f.request()
  await f.write(`${root}/requests`, request)
  await f.login('reviewer')
  await f.write(`${root}/requests/${request.operationId}/approve`, operation({}, 1))
  await f.login('demo')
  const body = {
    disclosureId: crypto.randomUUID(),
    request: request.operationId,
    expectedRevision: 2,
  }
  f.server.set('unknown')
  expect((await f.write(`${root}/materials/device-01/bitlocker/reveal`, body)).status).toBe(503)
  f.server.set('normal')
  expect((await f.write(`${root}/materials/device-01/bitlocker/reveal`, body)).status).toBe(409)
  expect(
    (await f.server.handle('GET', `${root}/requests/${request.operationId}`)).body,
  ).toMatchObject({ request: { state: 'consumed' } })
  expect(
    (await f.server.handle('GET', `${root}/materials/device-02/bootstrap_token`)).body,
  ).toMatchObject({ material: { kind: 'bootstrap_token', actions: ['reescrow'] } })
  expect(
    (
      await f.write(
        `${root}/requests`,
        operation({
          ...request.input,
          target: { ...request.input.target, device: 'device-02', material: 'bootstrap_token' },
        }),
      )
    ).status,
  ).toBe(400)
  expect(
    (await f.server.handle('GET', `${root}/materials/device-01/filevault`)).body,
  ).toMatchObject({ material: { state: 'not_applicable', actions: [] } })
})
it('keeps rotation acceptance and command success separate from new escrow observations', async () => {
  const f = await setup(),
    path = `${root}/materials/device-01/bitlocker`,
    initial = (await f.server.handle('GET', path)).body,
    request = operation({
      ...f.request().input,
      target: {
        kind: 'material_operation',
        device: 'device-01',
        material: 'bitlocker',
        materialRevision: 1,
        volume: 'os',
        action: 'rotate',
      },
    })
  await f.write(`${root}/requests`, request)
  await f.login('reviewer')
  await f.write(`${root}/requests/${request.operationId}/approve`, operation({}, 1))
  await f.login('demo')
  const dispatch = operation({}, 2)
  expect((await f.write(`${root}/requests/${request.operationId}/dispatch`, dispatch)).status).toBe(
    200,
  )
  expect((await f.server.handle('GET', path)).body).toMatchObject({
    material: { ...(initial as { material: object }).material, actions: ['rotate'] },
  })
  await f.write('/api/mdm-candidate/v1/workspace/scenario', {
    event: {
      kind: 'security_result',
      at: f.now + 1,
      task: dispatch.operationId,
      device: 'device-01',
    },
  })
  expect((await f.server.handle('GET', path)).body).toMatchObject({ material: { revision: 1 } })
  expect(
    (
      await f.write('/api/mdm-candidate/v1/workspace/scenario', {
        event: {
          kind: 'material_detect',
          at: f.now + 2,
          task: dispatch.operationId,
          device: 'device-01',
        },
      })
    ).status,
  ).toBe(204)
  expect((await f.server.handle('GET', path)).body).toMatchObject({
    material: { revision: 2, details: { volumes: [{ escrow: 'available' }] } },
  })
  const stale = f.request()
  expect((await f.write(`${root}/requests`, stale)).status).toBe(409)
  expect(
    (await f.server.handle('GET', `/api/mdm-candidate/v1/executions/${dispatch.operationId}`)).body,
  ).toMatchObject({ execution: { effect: 'verified_present', compliance: 'unknown' } })
})
it('refuses revoked and expired authorizations and binds access to an existing volume', async () => {
  const f = await setup(),
    revoked = f.request(),
    expired = f.request()
  await f.write(`${root}/requests`, revoked)
  await f.write(`${root}/requests`, expired)
  expect(
    (
      await f.write(
        `${root}/requests`,
        operation({
          ...revoked.input,
          target: { ...revoked.input.target, volume: 'missing-volume' },
        }),
      )
    ).status,
  ).toBe(409)
  await f.login('reviewer')
  await f.write(`${root}/requests/${revoked.operationId}/approve`, operation({}, 1))
  await f.write(`${root}/requests/${expired.operationId}/approve`, operation({}, 1))
  await f.login('demo')
  await f.write(`${root}/requests/${revoked.operationId}/revoke`, operation({}, 2))
  expect(
    (
      await f.write(`${root}/materials/device-01/bitlocker/reveal`, {
        disclosureId: crypto.randomUUID(),
        request: revoked.operationId,
        expectedRevision: 2,
      })
    ).status,
  ).toBe(409)
  await f.write('/api/mdm-candidate/v1/workspace/scenario', {
    event: { kind: 'clock', at: f.now + 121 },
  })
  expect(
    (
      await f.write(`${root}/materials/device-01/bitlocker/reveal`, {
        disclosureId: crypto.randomUUID(),
        request: expired.operationId,
        expectedRevision: 2,
      })
    ).status,
  ).toBe(409)
  expect(
    (await f.server.handle('GET', `${root}/requests/${expired.operationId}`)).body,
  ).toMatchObject({ request: { state: 'expired' } })
})
it.each(['filevault', 'laps', 'bootstrap_token', 'recovery_lock'] as const)(
  'retains independent %s observations through the shared execution owner',
  async (kind) => {
    const f = await setup(),
      device = kind === 'laps' ? 'device-01' : 'device-02',
      path = `${root}/materials/${device}/${kind}`,
      before = (await f.server.handle('GET', path)).body as {
        material: { revision: number; details: object }
        asOf: number
      },
      request = operation({
        target: {
          kind: 'material_operation',
          device,
          material: kind,
          materialRevision: before.material.revision,
          volume: null,
          action: kind === 'bootstrap_token' ? 'reescrow' : 'rotate',
        },
        reason: 'Synthetic material maintenance',
        validFrom: before.asOf,
        validUntil: before.asOf + 300,
      })
    expect((await f.write(`${root}/requests`, request)).status).toBe(200)
    await f.login('reviewer')
    await f.write(`${root}/requests/${request.operationId}/approve`, operation({}, 1))
    await f.login('demo')
    const op = operation({}, 2)
    expect((await f.write(`${root}/requests/${request.operationId}/dispatch`, op)).status).toBe(200)
    await f.write('/api/mdm-candidate/v1/workspace/scenario', {
      event: { kind: 'security_result', at: before.asOf + 1, task: op.operationId, device },
    })
    expect((await f.server.handle('GET', path)).body).toMatchObject({
      material: { revision: 1, details: before.material.details },
    })
    await f.write('/api/mdm-candidate/v1/workspace/scenario', {
      event: { kind: 'material_detect', at: before.asOf + 2, task: op.operationId, device },
    })
    const details =
      kind === 'bootstrap_token'
        ? { escrow: 'present' }
        : kind === 'recovery_lock'
          ? { escrow: 'available', verification: 'verified' }
          : kind === 'laps'
            ? { escrow: 'available', lastRotatedAt: before.asOf + 2 }
            : { escrow: 'available', encryption: 'on' }
    expect((await f.server.handle('GET', path)).body).toMatchObject({
      material: { revision: 2, details },
    })
  },
)

it('settles an expired queued rotation before a material-only read and publishes its failure audit once', async () => {
  const f = await setup(),
    path = `${root}/materials/device-01/bitlocker`,
    request = operation({
      ...f.request().input,
      target: {
        kind: 'material_operation',
        device: 'device-01',
        material: 'bitlocker',
        materialRevision: 1,
        volume: 'os',
        action: 'rotate',
      },
    })
  expect((await f.write(`${root}/requests`, request)).status).toBe(200)
  await f.login('reviewer')
  await f.write(`${root}/requests/${request.operationId}/approve`, operation({}, 1))
  await f.login('demo')
  const dispatch = operation({}, 2)
  expect((await f.write(`${root}/requests/${request.operationId}/dispatch`, dispatch)).status).toBe(
    200,
  )
  expect((await f.server.handle('GET', path)).body).toMatchObject({
    material: { actions: ['rotate'] },
  })
  // Natural server time advances without a demo event or execution-page read.
  vi.setSystemTime((f.now + 121) * 1000)
  expect((await f.server.handle('GET', path)).body).toMatchObject({
    material: { actions: ['reveal', 'rotate'] },
  })
  const audit = '/api/mdm-candidate/v1/operations/audit?device=device-01&action=security_result'
  const entries = (await f.server.handle('GET', audit)).body
  expect(entries).toMatchObject({
    items: [{ target: { id: dispatch.operationId }, outcome: 'failed' }],
  })
  await f.server.handle('GET', path)
  expect((await f.server.handle('GET', audit)).body).toMatchObject({
    items: [expect.objectContaining({ outcome: 'failed' })],
  })
})
