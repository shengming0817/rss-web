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
      (e, s) => automation.tick(e, s),
      automation.observe,
      automation.now,
    )
  let headers: Record<string, string> = {}
  async function login(login: 'demo' | 'reviewer') {
    const result = await server.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
      login,
      password: 'demo',
    })
    headers = {
      'x-csrf-token': (result.body as { csrfToken: string }).csrfToken,
      'x-identity-request': '1',
    }
  }
  await login('demo')
  const write = (path: string, body: unknown, extra: Record<string, string> = {}) =>
    server.handle('POST', path, body, { ...headers, ...extra })
  const risks = await server.handle('GET', `${root}/risks`)
  expect(risks.status).toBe(200)
  const risk = (risks.body as { items: { id: string }[] }).items[0]!.id,
    path = `${root}/risks/${risk}/devices/device-01`,
    initial = (await server.handle('GET', path)).body as {
      assessment: { id: string; version: number }
      asOf: number
    }
  const request = operation({
    target: {
      kind: 'risk_remediation',
      risk,
      device: 'device-01',
      assessment: initial.assessment.id,
      assessmentVersion: initial.assessment.version,
    },
    reason: 'Patch synthetic browser',
    validFrom: initial.asOf,
    validUntil: initial.asOf + 600,
  })
  expect((await write(`${root}/requests`, request)).status).toBe(200)
  return { server, devices, automation, login, write, risk, path, initial, request }
}
it('separates remediation approval, device completion, detection and independently reassessed risk', async () => {
  const f = await setup(),
    requestPath = `${root}/requests/${f.request.operationId}`
  expect((await f.write(`${requestPath}/dispatch`, operation({}, 1))).status).toBe(409)
  await f.login('reviewer')
  expect((await f.write(`${requestPath}/approve`, operation({}, 1))).status).toBe(200)
  expect((await f.write(`${requestPath}/dispatch`, operation({}, 2))).status).toBe(403)
  await f.login('demo')
  const dispatch = operation({}, 2)
  f.server.set('unknown')
  expect((await f.write(`${requestPath}/dispatch`, dispatch)).status).toBe(503)
  f.server.set('normal')
  const accepted = await f.write(`${requestPath}/dispatch`, dispatch)
  expect(accepted.body).toMatchObject({
    action: {
      id: dispatch.operationId,
      source: { generation: 1 },
      summary: {
        execution: 'not_started',
        effect: 'unverified',
        origin: { kind: 'security', request: f.request.operationId },
      },
    },
  })
  expect((await f.write(`${requestPath}/dispatch`, operation({}, 2))).status).toBe(409)
  const event = (kind: string, at: number) =>
    f.write('/api/mdm-candidate/v1/workspace/scenario', {
      event: { kind, at, device: 'device-01', task: dispatch.operationId },
    })
  expect((await event('security_result', f.initial.asOf + 2)).status).toBe(204)
  expect(
    (await f.server.handle('GET', `/api/mdm-candidate/v1/executions/${dispatch.operationId}`)).body,
  ).toMatchObject({
    execution: { execution: 'succeeded', effect: 'unverified', compliance: 'unknown' },
  })
  expect((await f.server.handle('GET', f.path)).body).toMatchObject({
    assessment: { state: 'affected', software: { version: '128.0' } },
  })
  expect((await event('security_detect', f.initial.asOf + 1)).status).toBe(204)
  expect(
    (await f.server.handle('GET', `/api/mdm-candidate/v1/executions/${dispatch.operationId}`)).body,
  ).toMatchObject({ execution: { effect: 'unverified' } })
  expect((await event('security_detect', f.initial.asOf + 3)).status).toBe(204)
  expect((await f.server.handle('GET', f.path)).body).toMatchObject({
    assessment: { state: 'affected' },
  })
  const reassess = operation({}, f.initial.assessment.version)
  expect((await f.write(`${f.path}/reassess`, reassess)).body).toMatchObject({
    assessment: {
      version: 2,
      state: 'clear',
      software: { version: '129.0' },
      reason: 'fixed_version_observed',
    },
  })
  expect((await f.server.handle('GET', `${f.path}/history`)).body).toMatchObject({
    items: [{ state: 'clear' }, { state: 'affected' }],
  })
  expect(
    (await f.server.handle('GET', '/api/mdm-candidate/v1/operations/alerts?device=device-01')).body,
  ).toMatchObject({ items: [{ code: 'risk_affected', state: 'resolved' }] })
  expect(
    (await f.server.handle('GET', `/api/mdm-candidate/v1/executions/${dispatch.operationId}`)).body,
  ).toMatchObject({ execution: { effect: 'verified_present', compliance: 'unknown' } })
})
it('invalidates stale approvals and rejects old registration evidence without clearing risk', async () => {
  const f = await setup(),
    requestPath = `${root}/requests/${f.request.operationId}`
  await f.write(`${f.path}/reassess`, operation({}, 1))
  await f.login('reviewer')
  expect((await f.write(`${requestPath}/approve`, operation({}, 1))).status).toBe(409)
  await f.login('demo')
  const current = (await f.server.handle('GET', f.path)).body as {
    assessment: { id: string; version: number }
  }
  const next = operation({
    ...f.request.input,
    target: {
      ...f.request.input.target,
      assessment: current.assessment.id,
      assessmentVersion: current.assessment.version,
    },
  })
  await f.write(`${root}/requests`, next)
  await f.login('reviewer')
  await f.write(`${root}/requests/${next.operationId}/approve`, operation({}, 1))
  await f.login('demo')
  const dispatch = operation({}, 2)
  const accepted = (await f.write(`${root}/requests/${next.operationId}/dispatch`, dispatch))
    .body as { action: { source: { registrationId: string } } }
  await f.write('/api/mdm-candidate/v1/workspace/scenario', {
    event: {
      kind: 'security_result',
      at: f.initial.asOf + 1,
      task: dispatch.operationId,
      device: 'device-01',
    },
  })
  expect(
    (
      await f.write(
        `/api/v3/devices/device-01/registrations/${accepted.action.source.registrationId}/revoke`,
        {},
        { 'idempotency-key': crypto.randomUUID() },
      )
    ).status,
  ).toBe(200)
  await f.write('/api/mdm-candidate/v1/workspace/scenario', {
    event: {
      kind: 'security_detect',
      at: f.initial.asOf + 2,
      task: dispatch.operationId,
      device: 'device-01',
    },
  })
  expect(
    (await f.server.handle('GET', `/api/mdm-candidate/v1/executions/${dispatch.operationId}`)).body,
  ).toMatchObject({
    execution: {
      execution: 'unknown',
      effect: 'unknown',
      nativeCode: 'source_registration_changed',
    },
  })
  expect((await f.server.handle('GET', f.path)).body).toMatchObject({
    assessment: { state: 'unknown', reason: 'source_changed' },
  })
  expect(
    (await f.server.handle('GET', '/api/mdm-candidate/v1/operations/alerts?device=device-01')).body,
  ).toMatchObject({ items: [{ state: 'open', evidence: { state: 'unknown' } }] })
})
it('cancels queued work when approval is revoked and never lets a read-only inventory source authorize dispatch', async () => {
  const f = await setup()
  await f.login('reviewer')
  await f.write(`${root}/requests/${f.request.operationId}/approve`, operation({}, 1))
  await f.login('demo')
  const dispatch = operation({}, 2)
  await f.write(`${root}/requests/${f.request.operationId}/dispatch`, dispatch)
  await f.write(`${root}/requests/${f.request.operationId}/revoke`, operation({}, 2))
  await f.write('/api/mdm-candidate/v1/workspace/scenario', {
    event: {
      kind: 'security_result',
      at: f.initial.asOf + 1,
      task: dispatch.operationId,
      device: 'device-01',
    },
  })
  expect(
    (await f.server.handle('GET', `/api/mdm-candidate/v1/executions/${dispatch.operationId}`)).body,
  ).toMatchObject({
    execution: {
      execution: 'failed',
      dispatch: 'queued',
      receipt: 'not_received',
      effect: 'unverified',
      nativeCode: 'authorization_changed',
    },
  })
  const a = (
      (await f.server.handle('GET', `${root}/risks/${f.risk}/devices/device-02`)).body as {
        assessment: { id: string; version: number }
      }
    ).assessment,
    second = operation({
      ...f.request.input,
      target: {
        ...f.request.input.target,
        device: 'device-02',
        assessment: a.id,
        assessmentVersion: a.version,
      },
    })
  await f.write(`${root}/requests`, second)
  await f.login('reviewer')
  await f.write(`${root}/requests/${second.operationId}/approve`, operation({}, 1))
  await f.login('demo')
  expect(
    (await f.write(`${root}/requests/${second.operationId}/dispatch`, operation({}, 2))).status,
  ).toBe(501)
  expect(
    (await f.server.handle('GET', `${root}/risks/${f.risk}/devices/device-03`)).body,
  ).toMatchObject({ assessment: { state: 'unknown', reason: 'inventory_missing' } })
})
it('keeps unknown device execution occupied until independent evidence and requires a new approval after a known failure', async () => {
  const f = await setup()
  await f.login('reviewer')
  await f.write(`${root}/requests/${f.request.operationId}/approve`, operation({}, 1))
  await f.login('demo')
  const first = operation({}, 2)
  await f.write(`${root}/requests/${f.request.operationId}/dispatch`, first)
  f.server.set('unknown')
  await f.write('/api/mdm-candidate/v1/workspace/scenario', {
    event: {
      kind: 'security_result',
      at: f.initial.asOf + 1,
      task: first.operationId,
      device: 'device-01',
    },
  })
  f.server.set('normal')
  const next = operation(f.request.input)
  await f.write(`${root}/requests`, next)
  await f.login('reviewer')
  await f.write(`${root}/requests/${next.operationId}/approve`, operation({}, 1))
  await f.login('demo')
  expect(
    (await f.write(`${root}/requests/${next.operationId}/dispatch`, operation({}, 2))).status,
  ).toBe(409)
  expect(
    (await f.server.handle('GET', `/api/mdm-candidate/v1/executions/${first.operationId}`)).body,
  ).toMatchObject({ execution: { execution: 'unknown', effect: 'unknown' } })
  const g = await setup()
  await g.login('reviewer')
  await g.write(`${root}/requests/${g.request.operationId}/approve`, operation({}, 1))
  await g.login('demo')
  const failed = operation({}, 2)
  expect((await g.write(`${root}/requests/${g.request.operationId}/dispatch`, failed)).status).toBe(
    200,
  )
  g.server.set('partial')
  expect(
    (
      await g.write('/api/mdm-candidate/v1/workspace/scenario', {
        event: {
          kind: 'security_result',
          at: g.initial.asOf + 1,
          task: failed.operationId,
          device: 'device-01',
        },
      })
    ).status,
  ).toBe(204)
  expect(
    (await g.server.handle('GET', `/api/mdm-candidate/v1/executions/${failed.operationId}`)).body,
  ).toMatchObject({ execution: { execution: 'failed', effect: 'failed' } })
  g.server.set('normal')
  expect(
    (await g.write(`${root}/requests/${g.request.operationId}/dispatch`, operation({}, 2))).status,
  ).toBe(409)
  const retry = operation(g.request.input)
  expect((await g.write(`${root}/requests`, retry)).status).toBe(200)
  await g.login('reviewer')
  expect(
    (await g.write(`${root}/requests/${retry.operationId}/approve`, operation({}, 1))).status,
  ).toBe(200)
  await g.login('demo')
  expect(
    (await g.write(`${root}/requests/${retry.operationId}/dispatch`, operation({}, 2))).status,
  ).toBe(200)
})
