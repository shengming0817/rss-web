import { expect, it } from 'vitest'
import { createScenario, TENANT } from '../scenario'
import { createDeviceDemo } from '../devices/state'
import { createAutomationDemo } from '../policies/state'
import { ADMIN_RULE } from './authorization'
const id = () => crypto.randomUUID()
async function fixture() {
  const devices = createDeviceDemo(),
    automation = createAutomationDemo(devices),
    server = createScenario(
      [automation.handle, devices.handle],
      automation.reset,
      automation.tick,
      automation.observe,
      automation.now,
    )
  const login = await server.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  const headers = {
    'x-csrf-token': (login.body as { csrfToken: string }).csrfToken,
    'x-identity-request': '1',
  }
  return {
    server,
    automation,
    write: (method: string, path: string, body: unknown) =>
      server.handle(method, path, body, headers),
  }
}
it('connects native permission changes, denied device access and sanitized audit without replay duplication', async () => {
  const f = await fixture(),
    root = '/api/mdm-candidate/v1/operations/audit'
  expect((await f.server.handle('GET', '/api/mdm-candidate/v1/devices/device-01')).status).toBe(200)
  const original = (await f.server.handle('GET', '/api/v1/authorization/rules')).body as {
    items: {
      id: string
      revision: number
      value: { grants: { operation: string }[]; subject: unknown }
    }[]
  }
  const rule = original.items.find((r) => r.id === ADMIN_RULE)!,
    operationId = id(),
    body = {
      operationId,
      expectedRevision: rule.revision,
      value: {
        subject: rule.value.subject,
        grants: rule.value.grants.filter((g) => g.operation !== 'inventory_read'),
      },
    }
  f.server.set('unknown')
  expect((await f.write('PUT', `/api/v1/authorization/rules/${ADMIN_RULE}`, body)).status).toBe(503)
  f.server.set('normal')
  expect((await f.write('PUT', `/api/v1/authorization/rules/${ADMIN_RULE}`, body)).status).toBe(200)
  expect((await f.server.handle('GET', '/api/mdm-candidate/v1/devices/device-01')).status).toBe(403)
  const audit = (await f.server.handle('GET', `${root}?operation=${operationId}`)).body as {
    items: { stage: string; outcome: string }[]
  }
  expect(audit.items.filter((v) => v.stage === 'business')).toHaveLength(1)
  expect(audit.items.some((v) => v.stage === 'request' && v.outcome === 'unknown')).toBe(true)
  expect(JSON.stringify(audit)).not.toContain('grants')
  const sessions = (await f.server.handle('GET', `${root}?stream=identity_security`)).body
  expect(sessions).toMatchObject({
    items: [{ stream: 'identity_security', stage: 'request', action: 'identity_session_created' }],
  })
  for (const path of [
    '/api/v1/authorization',
    '/api/mdm-candidate/v1/authorization/delegations',
    '/api/mdm-candidate/v1/operations/settings',
    '/api/mdm-candidate/v1/integrations/connectors',
  ]) {
    await f.write('POST', '/api/mdm-candidate/v1/workspace/scenario', {
      scenario: 'normal',
      module: 'operations',
      source: 'real',
    })
    expect((await f.server.handle('GET', path)).status).toBe(503)
  }
})
it('binds frozen audit pages to exact filters and actor and clears them on reset', async () => {
  const f = await fixture(),
    root = '/api/mdm-candidate/v1/operations/audit',
    path = '/api/mdm-candidate/v1/operations/alert-rules'
  for (let i = 0; i < 3; i++)
    await f.write('POST', `${path}/${id()}`, {
      operationId: id(),
      expectedRevision: 0,
      input: { name: `Signal ${i}`, signal: 'agent_health', threshold: 1, enabled: true },
    })
  const first = (await f.server.handle('GET', `${root}?limit=1`)).body as {
    snapshot: string
    nextCursor: string
  }
  expect(first.nextCursor).toBeTruthy()
  expect(
    (await f.server.handle('GET', `${root}?limit=1&cursor=${first.nextCursor}`)).body,
  ).toMatchObject({ snapshot: first.snapshot })
  expect(
    (await f.server.handle('GET', `${root}?limit=1&stream=mdm_business&cursor=${first.nextCursor}`))
      .status,
  ).toBe(400)
  await f.server.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
    login: 'reviewer',
    password: 'demo',
  })
  expect((await f.server.handle('GET', `${root}?limit=1&cursor=${first.nextCursor}`)).status).toBe(
    400,
  )
  f.automation.reset()
  expect((await f.server.handle('GET', `${root}?cursor=${first.nextCursor}`)).status).toBe(400)
})

it('rechecks native inventory/assignment permissions and preserves single-device reads', async () => {
  const f = await fixture()
  const original = (await f.server.handle('GET', '/api/v1/authorization/rules')).body as {
    items: {
      id: string
      revision: number
      value: { subject: unknown; grants: { operation: string; scope: unknown }[] }
    }[]
  }
  const admin = original.items.find((r) => r.id === ADMIN_RULE)!
  await f.write('PUT', `/api/v1/authorization/rules/${ADMIN_RULE}`, {
    operationId: id(),
    expectedRevision: admin.revision,
    value: {
      ...admin.value,
      grants: admin.value.grants.filter((g) => g.operation !== 'inventory_read'),
    },
  })
  expect((await f.server.handle('GET', '/api/v2/devices/device-01/inventory')).status).toBe(403)
  await f.write('PUT', `/api/v1/authorization/rules/${ADMIN_RULE}`, {
    operationId: id(),
    expectedRevision: 2,
    value: {
      ...admin.value,
      grants: admin.value.grants.map((g) =>
        g.operation === 'inventory_read' ? { ...g, scope: { kind: 'device', id: 'device-01' } } : g,
      ),
    },
  })
  for (const suffix of ['', '/hardware', '/software', '/history'])
    expect(
      (await f.server.handle('GET', `/api/mdm-candidate/v1/devices/device-01${suffix}`)).status,
    ).toBe(200)
  expect(
    (await f.server.handle('GET', '/api/mdm-candidate/v1/devices/device-02/hardware')).status,
  ).toBe(403)
  const login = await f.server.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
    login: 'reviewer',
    password: 'demo',
  })
  expect(
    (
      await f.server.handle(
        'PUT',
        '/api/mdm-candidate/v1/devices/device-01/assignment',
        { operationId: id(), expectedRevision: 1, input: { owner: 'changed', department: null } },
        {
          'x-csrf-token': (login.body as { csrfToken: string }).csrfToken,
          'x-identity-request': '1',
        },
      )
    ).status,
  ).toBe(403)
})
it('records the exact business target and offline/unsupported failures without inventing an object', async () => {
  const observed: import('../scenario').DemoObservation[] = []
  const server = createScenario(
    [() => ({ status: 200, body: {} })],
    () => {},
    () => true,
    (e) => observed.push(e),
  )
  const login = await server.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  const headers = {
    'x-csrf-token': (login.body as { csrfToken: string }).csrfToken,
    'x-identity-request': '1',
  }
  const target = id()
  const cases: [string, string | null][] = [
    ['/api/v2/devices/device-01/operations', 'device-01'],
    [`/api/mdm-candidate/v1/software/self-service/requests/${target}`, target],
    [`/api/mdm-candidate/v1/policies/assignments/${target}`, target],
    ['/api/mdm-candidate/v1/unrecognized', null],
  ]
  for (const [path, expected] of cases) {
    await server.handle('POST', path, { operationId: id() }, headers)
    expect(observed.at(-1)?.target?.id ?? null).toBe(expected)
  }
  for (const scenario of ['offline', 'unsupported'] as const) {
    server.set(scenario)
    await server.handle(
      'POST',
      `/api/v2/devices/device-01/operations`,
      { operationId: id() },
      headers,
    )
    expect(observed.at(-1)).toMatchObject({
      target: { device: 'device-01' },
      outcome: 'failed',
      status: scenario === 'offline' ? 503 : 501,
    })
  }
})
