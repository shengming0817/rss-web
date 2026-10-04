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
const root = '/api/v1/mdm-candidate/security'
async function setup() {
  const devices = createDeviceDemo(),
    automation = createAutomationDemo(devices),
    server = createScenario(
      [automation.handle, devices.handle],
      () => {},
      (e, s) => automation.tick(e, s),
      automation.observe,
      automation.now,
    )
  let headers: Record<string, string> = {}
  async function login(login: 'demo' | 'reviewer') {
    const reply = await server.handle('POST', `/api/v1/identity/tenants/${TENANT}/login`, {
      login,
      password: 'demo',
    })
    const body = reply.body as { csrfToken: string; identity: { principalId: string } }
    headers = { 'x-csrf-token': body.csrfToken, 'x-identity-request': '1' }
    return body.identity.principalId
  }
  const principal = await login('demo'),
    write = (path: string, body: unknown) => server.handle('POST', path, body, headers),
    reply = await server.handle('GET', `${root}/support/devices/device-01`)
  expect(reply.status).toBe(200)
  const context = reply.body as {
      context: { device: string; revision: number; accounts: { id: string }[]; programs: object[] }
      asOf: number
    },
    now = context.asOf
  const event = (kind: string, task: string, at: number, active?: boolean) =>
    write('/api/v1/mdm-candidate/workspace/scenario', {
      event: { kind, task, at, device: 'device-01', ...(active === undefined ? {} : { active }) },
    })
  async function request(target: object, until = now + 300) {
    const body = operation({
      target: { device: 'device-01', contextRevision: context.context.revision, ...target },
      reason: 'Synthetic support exercise',
      validFrom: now,
      validUntil: until,
    })
    expect((await write(`${root}/requests`, body)).status).toBe(200)
    await login('reviewer')
    expect(
      (await write(`${root}/requests/${body.operationId}/approve`, operation({}, 1))).status,
    ).toBe(200)
    await login('demo')
    return body.operationId
  }
  const read = async (id: string) =>
    (await server.handle('GET', `${root}/support/requests/${id}`)).body
  return { server, write, login, principal, context: context.context, now, event, request, read }
}
it('rejects consent events for missing targets, stale timestamps and repeated transitions', async () => {
  const f = await setup(),
    id = await f.request({ kind: 'remote_support', mode: 'view' })
  expect((await f.event('remote_consent', crypto.randomUUID(), f.now + 1, true)).status).toBe(409)
  expect((await f.event('remote_consent', id, f.now, true)).status).toBe(409)
  expect((await f.event('remote_revoke', id, f.now + 1)).status).toBe(409)
  expect(await f.read(id)).toMatchObject({
    support: { details: { consent: { state: 'pending' } } },
  })
  expect((await f.event('remote_consent', id, f.now + 2, true)).status).toBe(204)
  expect(
    (await f.server.handle('GET', '/api/v1/mdm-candidate/workspace/scenario')).body,
  ).toMatchObject({ asOf: f.now + 2 })
  expect((await f.event('remote_consent', id, f.now + 3, true)).status).toBe(409)
  expect((await f.event('remote_revoke', id, f.now + 4)).status).toBe(204)
  expect((await f.event('remote_revoke', id, f.now + 5)).status).toBe(409)
  expect(await f.read(id)).toMatchObject({
    support: { details: { consent: { state: 'revoked', at: f.now + 4 } } },
  })
})
it('requires device consent for the exact approved remote attempt and keeps revocation separate from session end', async () => {
  const f = await setup(),
    id = await f.request({ kind: 'remote_support', mode: 'view' }),
    dispatch = operation({}, 2)
  expect((await f.write(`${root}/requests/${id}/dispatch`, dispatch)).status).toBe(409)
  expect(await f.read(id)).toMatchObject({
    support: {
      request: id,
      target: { mode: 'view' },
      details: { consent: { state: 'pending' }, session: { state: 'not_started' } },
    },
  })
  expect((await f.event('remote_consent', id, f.now + 1, true)).status).toBe(204)
  expect((await f.write(`${root}/requests/${id}/dispatch`, dispatch)).status).toBe(200)
  await f.event('security_result', dispatch.operationId, f.now + 2)
  expect(await f.read(id)).toMatchObject({
    support: { action: dispatch.operationId, details: { session: { state: 'not_started' } } },
  })
  await f.event('support_detect', dispatch.operationId, f.now + 3)
  expect(await f.read(id)).toMatchObject({
    support: {
      details: { helper: f.principal, attempt: id, mode: 'view', session: { state: 'active' } },
    },
  })
  await f.event('remote_revoke', id, f.now + 4)
  expect(await f.read(id)).toMatchObject({
    support: {
      details: { consent: { state: 'revoked' }, session: { state: 'unknown', endedAt: null } },
    },
  })
  expect(
    (await f.server.handle('GET', `/api/v1/mdm-candidate/executions/${dispatch.operationId}`)).body,
  ).toMatchObject({ execution: { effect: 'unknown' } })
  await f.event('remote_ended', dispatch.operationId, f.now + 5)
  expect(await f.read(id)).toMatchObject({
    support: { details: { session: { state: 'ended', endedAt: f.now + 5 } } },
  })
  const retry = await f.request({ kind: 'remote_support', mode: 'control' })
  expect((await f.write(`${root}/requests/${retry}/dispatch`, operation({}, 2))).status).toBe(409)
  await f.event('remote_consent', retry, f.now + 6, false)
  expect(await f.read(retry)).toMatchObject({
    support: { details: { consent: { state: 'denied' } } },
  })
  expect((await f.write(`${root}/requests/${retry}/dispatch`, operation({}, 2))).status).toBe(409)
})
it('expires elevation authorization without claiming the device grant or process has been revoked', async () => {
  const f = await setup(),
    id = await f.request(
      { kind: 'elevation', account: f.context.accounts[0]!.id, program: f.context.programs[0] },
      f.now + 30,
    ),
    dispatch = operation({}, 2)
  expect((await f.write(`${root}/requests/${id}/dispatch`, dispatch)).status).toBe(200)
  await f.event('security_result', dispatch.operationId, f.now + 1)
  await f.event('support_detect', dispatch.operationId, f.now + 2)
  expect(await f.read(id)).toMatchObject({
    support: { details: { grant: { state: 'available' }, usage: { state: 'not_observed' } } },
  })
  await f.event('elevation_used', dispatch.operationId, f.now + 3)
  await f.write('/api/v1/mdm-candidate/workspace/scenario', {
    event: { kind: 'clock', at: f.now + 31 },
  })
  expect(await f.read(id)).toMatchObject({
    support: {
      details: { grant: { state: 'unknown' }, usage: { state: 'unknown', endedAt: null } },
    },
  })
  expect((await f.server.handle('GET', `${root}/requests/${id}`)).body).toMatchObject({
    request: { state: 'expired' },
  })
  await f.event('elevation_revoked', dispatch.operationId, f.now + 32)
  expect(await f.read(id)).toMatchObject({
    support: { details: { grant: { state: 'revoked' }, usage: { state: 'unknown' } } },
  })
  await f.event('elevation_ended', dispatch.operationId, f.now + 33)
  expect(await f.read(id)).toMatchObject({ support: { details: { usage: { state: 'ended' } } } })
})
it('separates diagnostic collection, upload, scan and retention without raw outputs or downloads', async () => {
  const f = await setup(),
    id = await f.request({
      kind: 'diagnostics',
      artifacts: ['system_events', 'network_summary'],
      retentionSeconds: 60,
    }),
    dispatch = operation({}, 2)
  expect((await f.write(`${root}/requests/${id}/dispatch`, dispatch)).status).toBe(200)
  await f.event('security_result', dispatch.operationId, f.now + 1)
  expect(await f.read(id)).toMatchObject({
    support: { details: { state: 'not_collected', collection: null } },
  })
  await f.event('support_detect', dispatch.operationId, f.now + 2)
  expect(await f.read(id)).toMatchObject({ support: { details: { state: 'collected' } } })
  await f.event('diagnostic_scanned', dispatch.operationId, f.now + 3)
  expect(await f.read(id)).toMatchObject({ support: { details: { state: 'collected' } } })
  await f.event('diagnostic_uploaded', dispatch.operationId, f.now + 4)
  expect(await f.read(id)).toMatchObject({ support: { details: { state: 'uploaded' } } })
  await f.event('diagnostic_scanned', dispatch.operationId, f.now + 5)
  expect(await f.read(id)).toMatchObject({
    support: { details: { state: 'ready', scan: { state: 'clean' }, availableUntil: f.now + 62 } },
  })
  await f.write('/api/v1/mdm-candidate/workspace/scenario', {
    event: { kind: 'clock', at: f.now + 63 },
  })
  expect(await f.read(id)).toMatchObject({ support: { details: { state: 'expired' } } })
})
it('ignores late consent after authorization expiry and refuses arbitrary elevation identities', async () => {
  const f = await setup(),
    id = await f.request({ kind: 'remote_support', mode: 'view' }, f.now + 10)
  await f.event('remote_consent', id, f.now + 11, true)
  expect(await f.read(id)).toMatchObject({
    support: { action: null, details: { consent: { state: 'expired' } } },
  })
  expect((await f.write(`${root}/requests/${id}/dispatch`, operation({}, 2))).status).toBe(409)
  const wrong = operation({
    target: {
      kind: 'elevation',
      device: 'device-01',
      contextRevision: 1,
      account: f.context.accounts[0]!.id,
      program: { ...f.context.programs[0], sha256: 'b'.repeat(64) },
    },
    reason: 'Synthetic incorrect file',
    validFrom: f.now + 11,
    validUntil: f.now + 100,
  })
  expect((await f.write(`${root}/requests`, wrong)).status).toBe(409)
  expect((await f.server.handle('GET', '/api/v1/mdm-candidate/executions')).body).toMatchObject({
    items: [],
  })
})
it('reports synthetic experience samples, denominators and unknown coverage independently of inventory', async () => {
  const f = await setup(),
    reply = await f.server.handle('GET', `${root}/support/devices/device-01/experience`)
  expect(reply.status).toBe(200)
  expect(reply.body).toMatchObject({
    experience: {
      device: 'device-01',
      source: { provider: 'RSS synthetic telemetry v1' },
      metrics: [
        {
          metric: 'boot_seconds_p95',
          state: 'incomplete',
          sampleCount: 8,
          denominator: 10,
          unknownCount: 2,
          value: 42,
        },
        {
          metric: 'crashes_per_100_sessions',
          state: 'complete',
          sampleCount: 20,
          denominator: 20,
          unknownCount: 0,
          value: 5,
        },
        {
          metric: 'disk_free_percent',
          state: 'incomplete',
          sampleCount: 4,
          denominator: 5,
          unknownCount: 1,
          value: 32,
        },
      ],
    },
  })
  expect(
    (await f.server.handle('GET', `${root}/support/devices/device-02/experience`)).body,
  ).toMatchObject({
    experience: {
      source: null,
      metrics: [
        expect.objectContaining({
          state: 'unknown',
          sampleCount: 0,
          denominator: null,
          unknownCount: null,
          value: null,
        }),
        expect.objectContaining({
          state: 'unknown',
          sampleCount: 0,
          denominator: null,
          unknownCount: null,
          value: null,
        }),
        expect.objectContaining({
          state: 'unknown',
          sampleCount: 0,
          denominator: null,
          unknownCount: null,
          value: null,
        }),
      ],
    },
  })
})
it('does not reuse a consent observation predating the administrator decision', async () => {
  const f = await setup(),
    r = operation({
      target: { kind: 'remote_support', device: 'device-01', contextRevision: 1, mode: 'view' },
      reason: 'Synthetic attended support',
      validFrom: f.now,
      validUntil: f.now + 100,
    })
  await f.write(`${root}/requests`, r)
  await f.write('/api/v1/mdm-candidate/workspace/scenario', {
    event: { kind: 'clock', at: f.now + 5 },
  })
  await f.login('reviewer')
  await f.write(`${root}/requests/${r.operationId}/approve`, operation({}, 1))
  await f.login('demo')
  await f.event('remote_consent', r.operationId, f.now + 1, true)
  expect(await f.read(r.operationId)).toMatchObject({
    support: { details: { consent: { state: 'pending', at: null } } },
  })
  expect(
    (await f.write(`${root}/requests/${r.operationId}/dispatch`, operation({}, 2))).status,
  ).toBe(409)
})
