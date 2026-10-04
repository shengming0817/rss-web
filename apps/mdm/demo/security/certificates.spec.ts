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
      (event, scenario) => automation.tick(event, scenario),
      automation.observe,
    )
  let headers: Record<string, string> = {}
  async function login(login: 'demo' | 'reviewer') {
    const reply = await server.handle('POST', `/api/v1/identity/tenants/${TENANT}/login`, {
      login,
      password: 'demo',
    })
    headers = {
      'x-csrf-token': (reply.body as { csrfToken: string }).csrfToken,
      'x-identity-request': '1',
    }
  }
  await login('demo')
  const write = (path: string, body: unknown, extra: Record<string, string> = {}) =>
    server.handle('POST', path, body, { ...headers, ...extra })
  const list = await server.handle('GET', `${root}/certificates?device=device-01`)
  expect(list.status).toBe(200)
  const body = list.body as { items: { id: string }[]; asOf: number },
    id = body.items[0]!.id,
    path = `${root}/certificates/${id}`
  const read = async () => (await server.handle('GET', path)).body
  const event = (kind: string, task: string, at: number) =>
    write('/api/v1/mdm-candidate/workspace/scenario', {
      event: { kind, task, at, device: 'device-01' },
    })
  return { server, write, login, id, path, read, event, now: body.asOf }
}
it('retains installed expiry through issuance and command success until independent device observation', async () => {
  const f = await setup(),
    issue = operation({}, 1),
    before = await f.read()
  expect(before).toMatchObject({ certificate: { validity: 'expiring', issuance: null } })
  expect((await f.write(`${f.path}/issue`, issue)).status).toBe(200)
  expect(await f.read()).toMatchObject({
    certificate: { validity: 'expiring', issuance: { state: 'requested' } },
  })
  expect((await f.event('certificate_issued', issue.operationId, f.now + 1)).status).toBe(204)
  const issued = (await f.read()) as {
    certificate: { revision: number; issuance: { credential: { fingerprint: string } } }
  }
  expect(issued).toMatchObject({
    certificate: { validity: 'expiring', issuance: { state: 'issued' } },
  })
  const request = operation({
    target: {
      kind: 'certificate_deploy',
      device: 'device-01',
      certificate: f.id,
      certificateRevision: issued.certificate.revision,
      fingerprint: issued.certificate.issuance.credential.fingerprint,
    },
    reason: 'Synthetic certificate renewal',
    validFrom: f.now + 1,
    validUntil: f.now + 600,
  })
  expect((await f.write(`${root}/requests`, request)).status).toBe(200)
  await f.login('reviewer')
  expect(
    (await f.write(`${root}/requests/${request.operationId}/approve`, operation({}, 1))).status,
  ).toBe(200)
  await f.login('demo')
  const dispatch = operation({}, 2)
  expect((await f.write(`${root}/requests/${request.operationId}/dispatch`, dispatch)).status).toBe(
    200,
  )
  await f.event('security_result', dispatch.operationId, f.now + 2)
  expect(await f.read()).toMatchObject({ certificate: { validity: 'expiring' } })
  const alerts = '/api/v1/mdm-candidate/operations/alerts?device=device-01'
  expect((await f.server.handle('GET', alerts)).body).toMatchObject({
    items: [expect.objectContaining({ code: 'certificate_expiry', state: 'open' })],
  })
  await f.event('certificate_detect', dispatch.operationId, f.now + 3)
  expect(await f.read()).toMatchObject({
    certificate: {
      validity: 'valid',
      installed: { credential: { fingerprint: request.input.target.fingerprint } },
    },
  })
  expect((await f.server.handle('GET', alerts)).body).toMatchObject({
    items: [expect.objectContaining({ code: 'certificate_expiry', state: 'resolved' })],
  })
  expect(
    (await f.server.handle('GET', `/api/v1/mdm-candidate/executions/${dispatch.operationId}`)).body,
  ).toMatchObject({ execution: { effect: 'verified_present', compliance: 'unknown' } })
  // Advance the wall clock without reading certificates or injecting a certificate event.
  const expiringAt = f.now + 1 + 84 * 86400
  vi.setSystemTime(expiringAt * 1000)
  expect((await f.server.handle('GET', alerts)).body).toMatchObject({
    items: [
      expect.objectContaining({
        state: 'open',
        acknowledgment: null,
        evidence: expect.objectContaining({ at: expiringAt, state: 'active' }),
      }),
    ],
  })
  const audit = '/api/v1/mdm-candidate/operations/audit?action=alert_opened&from=' + expiringAt
  expect((await f.server.handle('GET', audit)).body).toMatchObject({
    items: [expect.objectContaining({ at: expiringAt })],
  })
  // Unchanged evidence must not publish another transition on a repeated projection read.
  await f.server.handle('GET', alerts)
  expect((await f.server.handle('GET', audit)).body).toMatchObject({
    items: [expect.objectContaining({ at: expiringAt })],
  })
  expect(((await f.server.handle('GET', audit)).body as { items: unknown[] }).items).toHaveLength(1)
})
it('replays the original issuance receipt without a second attempt and preserves unknown until that issuer result resolves', async () => {
  const f = await setup(),
    issue = operation({}, 1)
  f.server.set('unknown')
  expect((await f.write(`${f.path}/issue`, issue)).status).toBe(503)
  f.server.set('normal')
  const receipt = await f.write(`${f.path}/issue`, issue)
  expect(receipt.status).toBe(200)
  f.server.set('unknown')
  await f.event('certificate_issued', issue.operationId, f.now + 1)
  f.server.set('normal')
  expect(await f.read()).toMatchObject({
    certificate: { revision: 3, issuance: { state: 'unknown', credential: null } },
  })
  expect((await f.write(`${f.path}/issue`, operation({}, 3))).status).toBe(409)
  await f.event('certificate_issued', issue.operationId, f.now + 2)
  expect(await f.read()).toMatchObject({
    certificate: { revision: 4, issuance: { state: 'issued' } },
  })
  expect((await f.write(`${f.path}/issue`, issue)).body).toEqual(receipt.body)
})
it('expires installed certificates with server time and does not clear their alert on failed renewal', async () => {
  const f = await setup(),
    issue = operation({}, 1)
  await f.write(`${f.path}/issue`, issue)
  f.server.set('partial')
  await f.event('certificate_issued', issue.operationId, f.now + 1)
  f.server.set('normal')
  await f.write('/api/v1/mdm-candidate/workspace/scenario', {
    event: { kind: 'clock', at: f.now + 4000 },
  })
  expect(await f.read()).toMatchObject({
    certificate: { validity: 'expired', issuance: { state: 'failed', credential: null } },
  })
  expect(
    (await f.server.handle('GET', '/api/v1/mdm-candidate/operations/alerts?device=device-01')).body,
  ).toMatchObject({
    items: [expect.objectContaining({ code: 'certificate_expiry', state: 'open' })],
  })
})
it('rejects mismatched fingerprints, out-of-order evidence and revoked registration evidence', async () => {
  const f = await setup(),
    issue = operation({}, 1)
  await f.write(`${f.path}/issue`, issue)
  await f.event('certificate_issued', issue.operationId, f.now + 1)
  const c = (
      (await f.read()) as {
        certificate: {
          revision: number
          source: { registrationId: string }
          issuance: { credential: { fingerprint: string } }
        }
      }
    ).certificate,
    body = {
      target: {
        kind: 'certificate_deploy',
        device: 'device-01',
        certificate: f.id,
        certificateRevision: c.revision,
        fingerprint: c.issuance.credential.fingerprint,
      },
      reason: 'Synthetic renewal',
      validFrom: f.now + 1,
      validUntil: f.now + 600,
    }
  expect(
    (
      await f.write(
        `${root}/requests`,
        operation({ ...body, target: { ...body.target, fingerprint: 'wrong-certificate' } }),
      )
    ).status,
  ).toBe(409)
  const request = operation(body)
  await f.write(`${root}/requests`, request)
  await f.login('reviewer')
  await f.write(`${root}/requests/${request.operationId}/approve`, operation({}, 1))
  await f.login('demo')
  const dispatch = operation({}, 2)
  await f.write(`${root}/requests/${request.operationId}/dispatch`, dispatch)
  await f.event('certificate_detect', dispatch.operationId, f.now + 2)
  expect(await f.read()).toMatchObject({ certificate: { validity: 'expiring' } })
  await f.event('security_result', dispatch.operationId, f.now + 3)
  await f.event('certificate_detect', dispatch.operationId, f.now + 2)
  expect(await f.read()).toMatchObject({ certificate: { validity: 'expiring' } })
  expect(
    (
      await f.write(
        `/api/v1/devices/device-01/registrations/${c.source.registrationId}/revoke`,
        {},
        { 'idempotency-key': crypto.randomUUID() },
      )
    ).status,
  ).toBe(200)
  await f.event('certificate_detect', dispatch.operationId, f.now + 4)
  expect(await f.read()).toMatchObject({
    certificate: {
      validity: 'unknown',
      source: null,
      installed: {
        credential: { fingerprint: expect.not.stringMatching(c.issuance.credential.fingerprint) },
      },
    },
  })
  expect(
    (await f.server.handle('GET', `/api/v1/mdm-candidate/executions/${dispatch.operationId}`)).body,
  ).toMatchObject({ execution: { effect: 'unknown', nativeCode: 'source_registration_changed' } })
  expect(
    (await f.server.handle('GET', '/api/v1/mdm-candidate/operations/alerts?device=device-01')).body,
  ).toMatchObject({
    items: [
      expect.objectContaining({
        state: 'open',
        evidence: expect.objectContaining({ state: 'unknown' }),
      }),
    ],
  })
})
