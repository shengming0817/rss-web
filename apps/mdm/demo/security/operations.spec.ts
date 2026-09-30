import { afterEach, expect, it, vi } from 'vitest'
afterEach(() => vi.useRealTimers())
import { createDeviceDemo } from '../devices/state'
import { createAutomationDemo } from '../policies/state'
import { createScenario, TENANT } from '../scenario'
import { operation } from '../../src/services/useOperation'
it('records native security changes once and keeps alert acknowledgement independent of reevaluation', async () => {
  const devices = createDeviceDemo(),
    automation = createAutomationDemo(devices),
    server = createScenario([automation.handle, devices.handle])
  const login = await server.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  const headers = {
    'x-csrf-token': (login.body as { csrfToken: string }).csrfToken,
    'x-identity-request': '1',
  }
  const write = (method: string, path: string, body: unknown) =>
    server.handle(method, path, body, headers)
  const root = '/api/mdm-candidate/v1/operations',
    id = crypto.randomUUID(),
    path = `/api/v2/compliance-rules/${id}`
  expect((await server.handle('GET', `${root}/audit`)).status).toBe(200)
  const definition = {
    name: 'Private administrator draft',
    severity: 'high',
    enabled: true,
    platform: 'all',
    target: { kind: 'all' },
    criteria: {
      kind: 'predicate',
      field: 'custom.office_floor',
      op: 'ge',
      value: { kind: 'integer', value: 1 },
    },
  }
  const body = operation(definition),
    created = await write('PUT', path, body)
  expect(created.status).toBe(200)
  await write('PUT', path, body)
  const audit = (await server.handle('GET', `${root}/audit?action=compliance_saved`)).body as {
    items: { id: string }[]
  }
  expect(audit.items).toHaveLength(1)
  expect(audit.items[0]).toMatchObject({
    action: 'compliance_saved',
    operation: body.operationId,
    target: { kind: 'compliance_rule', id, revision: 1 },
    outcome: 'accepted',
  })
  expect(JSON.stringify(audit)).not.toContain(definition.name)
  expect((await server.handle('GET', `${root}/audit/${audit.items[0]!.id}`)).body).toMatchObject({
    entry: audit.items[0],
  })
  const task = (created.body as { task: string }).task
  await server.handle('GET', `${path}/tasks/${task}`)
  await server.handle('GET', `${path}/tasks/${task}`)
  const page = (await server.handle('GET', `${root}/alerts?device=device-01`)).body as {
    items: { id: string; revision: number }[]
  }
  const alert = page.items[0]!
  expect(alert).toMatchObject({
    state: 'open',
    acknowledgment: null,
    evidence: { id: task, state: 'active' },
  })
  const ack = operation({}, alert.revision)
  server.set('unknown')
  expect((await write('POST', `${root}/alerts/${alert.id}/acknowledge`, ack)).status).toBe(503)
  server.set('normal')
  const acknowledged = await write('POST', `${root}/alerts/${alert.id}/acknowledge`, ack)
  expect(acknowledged.body).toMatchObject({
    alert: {
      state: 'open',
      revision: alert.revision + 1,
      operation: ack.operationId,
      acknowledgment: { actor: '22222222-2222-4222-8222-222222222222' },
    },
  })
  expect(
    (await write('POST', `${root}/alerts/${alert.id}/resolve`, operation({}, alert.revision + 1)))
      .status,
  ).toBe(400)
  expect((await server.handle('GET', '/api/v2/devices/device-01/compliance')).body).toMatchObject({
    status: 'non_compliant',
  })
  const changed = await write(
    'PUT',
    path,
    operation({ ...definition, criteria: { kind: 'and', children: [] } }, 1),
  )
  const next = (changed.body as { task: string }).task
  await server.handle('GET', `${path}/tasks/${next}`)
  await server.handle('GET', `${path}/tasks/${next}`)
  expect((await server.handle('GET', `${root}/alerts/${alert.id}`)).body).toMatchObject({
    alert: { state: 'resolved', evidence: { id: next, state: 'cleared' } },
  })
  automation.operations.observeAlert({
    code: 'compliance_noncompliant',
    severity: 'high',
    target: { kind: 'compliance_rule', id, revision: 1, device: 'device-01' },
    evidence: { id: task, version: 1, at: 1, state: 'active' },
  })
  expect((await server.handle('GET', `${root}/alerts/${alert.id}`)).body).toMatchObject({
    alert: { state: 'resolved', evidence: { id: next } },
  })
  const recurrence = (await write('PUT', path, operation(definition, 2))).body as { task: string }
  await server.handle('GET', `${path}/tasks/${recurrence.task}`)
  await server.handle('GET', `${path}/tasks/${recurrence.task}`)
  expect((await server.handle('GET', `${root}/alerts/${alert.id}`)).body).toMatchObject({
    alert: { state: 'open', acknowledgment: null, operation: null },
  })
  // Receipt replay retains the original outcome but cannot confirm a new incident.
  await write('POST', `${root}/alerts/${alert.id}/acknowledge`, ack)
  expect((await server.handle('GET', `${root}/alerts/${alert.id}`)).body).toMatchObject({
    alert: { acknowledgment: null },
  })
  const rows = (await server.handle('GET', `${root}/audit?device=device-01&limit=1`)).body as {
    nextCursor: string
  }
  expect(rows.nextCursor).toBeTruthy()
  expect(
    (await server.handle('GET', `${root}/audit?device=device-02&cursor=${rows.nextCursor}`)).status,
  ).toBe(400)
  const all = (await server.handle('GET', `${root}/audit`)).body
  expect(JSON.stringify(all)).not.toContain(definition.name)
  await server.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
    login: 'reviewer',
    password: 'demo',
  })
  expect(
    (await server.handle('GET', `${root}/audit?device=device-01&cursor=${rows.nextCursor}`)).status,
  ).toBe(400)
})

it('uses the advanced scenario clock for alert transitions, acknowledgement and time-filtered audit', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-30T00:00:00Z'))
  const devices = createDeviceDemo(),
    automation = createAutomationDemo(devices),
    server = createScenario(
      [automation.handle, devices.handle],
      () => {},
      (event, scenario) => automation.tick(event, scenario),
    ),
    root = '/api/mdm-candidate/v1/operations',
    login = await server.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
      login: 'demo',
      password: 'demo',
    }),
    headers = {
      'x-csrf-token': (login.body as { csrfToken: string }).csrfToken,
      'x-identity-request': '1',
    },
    advance = async (at: number) => {
      expect(
        (
          await server.handle(
            'POST',
            '/api/mdm-candidate/v1/workspace/scenario',
            { event: { kind: 'clock', at } },
            headers,
          )
        ).status,
      ).toBe(204)
    },
    start = Math.floor(Date.now() / 1000) + 3600,
    id = crypto.randomUUID(),
    target = { kind: 'certificate' as const, id, device: 'device-01', revision: 1 },
    observe = (version: number, state: 'active' | 'cleared') =>
      automation.operations.observeAlert({
        code: 'certificate_expiry',
        severity: 'high',
        target,
        evidence: { id, version, at: start - 1, state },
      })
  await advance(start)
  observe(1, 'active')
  const page = (await server.handle('GET', `${root}/alerts`)).body as {
      items: { id: string; revision: number }[]
    },
    alert = page.items[0]!
  expect(alert).toMatchObject({ openedAt: start, updatedAt: start })
  await advance(start + 60)
  expect(
    (
      await server.handle(
        'POST',
        `${root}/alerts/${alert.id}/acknowledge`,
        operation({}, alert.revision),
        headers,
      )
    ).body,
  ).toMatchObject({ alert: { acknowledgment: { at: start + 60 } } })
  await advance(start + 120)
  observe(2, 'cleared')
  expect((await server.handle('GET', `${root}/alerts/${alert.id}`)).body).toMatchObject({
    alert: { resolvedAt: start + 120 },
  })
  for (const [action, at] of [
    ['alert_opened', start],
    ['alert_acknowledged', start + 60],
    ['alert_resolved', start + 120],
  ] as const) {
    expect(
      (await server.handle('GET', `${root}/audit?action=${action}&from=${at}&until=${at}`)).body,
    ).toMatchObject({ items: [expect.objectContaining({ at })] })
  }
})
