import { expect, it } from 'vitest'
import { createAdminDemo } from './admin'
import { createOperationsDemo } from './state'
import { createAuthorizationDemo } from './authorization'
import { createScenario, TENANT } from '../scenario'
import { operation } from '../../src/services/useOperation'
async function fixture() {
  let time = 100
  const operations = createOperationsDemo(() => time)
  const auth = createAuthorizationDemo(() => time, operations.record)
  const admin = createAdminDemo(
    () => time,
    operations,
    () => [
      { id: 'device-01', platform: 'windows', status: 'active' },
      { id: 'device-02', platform: 'macos', status: 'pending' },
    ],
  )
  const server = createScenario(
    [auth.handle, admin.handle, operations.handle],
    () => {
      admin.reset()
      operations.reset()
      auth.reset()
    },
    (e) => {
      time = e.at
      admin.tick()
      return true
    },
  )
  const login = await server.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  const headers = {
    'x-csrf-token': (login.body as { csrfToken: string }).csrfToken,
    'x-identity-request': '1',
  }
  const post = (path: string, body: unknown) => server.handle('POST', path, body, headers)
  return {
    server,
    post,
    admin,
    operations,
    advance: () => {
      time += 100
      admin.tick()
    },
  }
}
it('keeps connector configuration, test and deliveries separate; CAS and retries retain failed history', async () => {
  const f = await fixture(),
    root = '/api/mdm-candidate/v1/integrations/connectors',
    id = crypto.randomUUID()
  const definition = {
    name: 'Service desk',
    kind: 'itsm',
    endpoint: 'https://itsm.example.test/events',
    credentialRef: 'secret-binding-1',
    enabled: true,
  }
  const created = await f.post(`${root}/${id}`, operation(definition))
  expect(created.status).toBe(200)
  expect(created.body).toMatchObject({ connector: { id, revision: 1, health: 'unknown' } })
  expect((await f.post(`${root}/${id}`, operation(definition, 0))).status).toBe(409)
  expect((await f.post(`${root}/${id}/test`, operation({}, 1))).status).toBe(202)
  expect((await f.server.handle('GET', `${root}/${id}/deliveries`)).body).toMatchObject({
    items: [],
  })
  const delivered = await f.post(`${root}/${id}/deliver`, operation({}, 1))
  expect(delivered.status).toBe(202)
  f.advance()
  const rows = (await f.server.handle('GET', `${root}/${id}/deliveries`)).body as {
    items: { id: string; revision: number; state: string }[]
  }
  expect(rows.items[0]?.state).toBe('failed')
  expect(
    (
      await f.post(
        `${root}/${id}/deliveries/${rows.items[0]!.id}/retry`,
        operation({}, rows.items[0]!.revision),
      )
    ).status,
  ).toBe(202)
  f.advance()
  expect((await f.server.handle('GET', `${root}/${id}/deliveries`)).body).toMatchObject({
    items: [{ state: 'delivered' }, { state: 'failed' }],
  })
})
it('runs bounded reports and configuration/maintenance stages only on explicit events', async () => {
  const f = await fixture()
  const report = await f.post(
    '/api/mdm-candidate/v1/operations/reports',
    operation({ from: 0, until: 100 }),
  )
  expect(report.status).toBe(202)
  const job = (report.body as { job: { id: string } }).job
  expect(
    (await f.server.handle('GET', `/api/mdm-candidate/v1/operations/reports/${job.id}`)).body,
  ).toMatchObject({ job: { phase: 'accepted', result: null } })
  f.advance()
  expect(
    (await f.server.handle('GET', `/api/mdm-candidate/v1/operations/reports/${job.id}`)).body,
  ).toMatchObject({
    job: { phase: 'completed', result: { known: 2, unknown: 0, scope: 'authorized' } },
  })
  const settings = (await f.server.handle('GET', '/api/mdm-candidate/v1/operations/settings'))
    .body as { configuration: { revision: number; values: unknown } }
  await f.post(
    '/api/mdm-candidate/v1/operations/settings',
    operation(settings.configuration.values, settings.configuration.revision),
  )
  expect(
    (await f.server.handle('GET', '/api/mdm-candidate/v1/operations/settings')).body,
  ).toMatchObject({ configuration: { state: 'saved', savedVersion: 2, activeVersion: 1 } })
  expect(
    (await f.post('/api/mdm-candidate/v1/operations/settings/activate', operation({}, 2))).body,
  ).toMatchObject({ configuration: { state: 'restart_required' } })
  expect(
    (
      await f.post(
        '/api/mdm-candidate/v1/operations/maintenance',
        operation({ kind: 'restore', target: 'demo-backup-1', method: 'full' }),
      )
    ).status,
  ).toBe(202)
  f.advance()
  const jobs = (await f.server.handle('GET', '/api/mdm-candidate/v1/operations/maintenance')).body
  expect(jobs).toMatchObject({ items: [{ phase: 'completed', effect: 'unverified' }] })
})
it('supports alert rules, authorized partial metrics, frozen pages and unknown writes', async () => {
  const f = await fixture(),
    root = '/api/mdm-candidate/v1/operations/alert-rules'
  for (let i = 0; i < 3; i++)
    await f.post(
      `${root}/${crypto.randomUUID()}`,
      operation({ name: `Rule ${i}`, signal: 'projection_backlog', threshold: 1, enabled: true }),
    )
  const first = (await f.server.handle('GET', `${root}?limit=1`)).body as {
    snapshot: string
    nextCursor: string
  }
  expect(first.nextCursor).toBeTruthy()
  f.server.set('unknown')
  const id = crypto.randomUUID(),
    body = operation({ name: 'Late', signal: 'connector_failure', threshold: 1, enabled: true })
  expect((await f.post(`${root}/${id}`, body)).status).toBe(503)
  f.server.set('normal')
  expect((await f.post(`${root}/${id}`, body)).status).toBe(200)
  expect(
    (await f.server.handle('GET', `${root}?limit=1&cursor=${first.nextCursor}`)).body,
  ).toMatchObject({ snapshot: first.snapshot })
  expect(
    (
      await f.server.handle(
        'GET',
        `/api/mdm-candidate/v1/operations/maintenance?cursor=${first.nextCursor}`,
      )
    ).status,
  ).toBe(400)
  f.server.set('partial')
  expect(
    (await f.server.handle('GET', '/api/mdm-candidate/v1/operations/metrics?from=0&until=100'))
      .body,
  ).toMatchObject({ metrics: { complete: false, unknown: null, scope: 'authorized' } })
})

it('closes the administrative ticket without resolving source evidence and reopens on new evidence', async () => {
  const f = await fixture(),
    rule = crypto.randomUUID()
  await f.post(
    `/api/mdm-candidate/v1/operations/alert-rules/${rule}`,
    operation({ name: 'Pending agents', signal: 'agent_health', threshold: 0, enabled: true }),
  )
  f.advance()
  const alertPage = (await f.server.handle('GET', '/api/mdm-candidate/v1/operations/alerts'))
    .body as { items: { id: string; revision: number }[] }
  const alert = alertPage.items[0]!
  expect(alert).toMatchObject({ state: 'open', target: { kind: 'alert_rule', id: rule } })
  expect(
    (
      await f.post(
        `/api/mdm-candidate/v1/operations/alerts/${alert.id}/close`,
        operation({ note: 'Tracked by support' }, alert.revision),
      )
    ).status,
  ).toBe(200)
  expect(
    (await f.server.handle('GET', `/api/mdm-candidate/v1/operations/alerts/${alert.id}`)).body,
  ).toMatchObject({ alert: { state: 'open' } })
  expect(
    (await f.server.handle('GET', `/api/mdm-candidate/v1/operations/alerts/${alert.id}/closure`))
      .body,
  ).toMatchObject({ closure: { note: 'Tracked by support' } })
  f.advance()
  expect(
    (await f.server.handle('GET', `/api/mdm-candidate/v1/operations/alerts/${alert.id}/closure`))
      .body,
  ).toMatchObject({ closure: null })
})

it('reads terminal connection tests without treating a passed test as business delivery recovery', async () => {
  const f = await fixture(),
    id = crypto.randomUUID(),
    root = `/api/mdm-candidate/v1/integrations/connectors/${id}`
  await f.post(
    root,
    operation({
      name: 'Desk',
      kind: 'itsm',
      endpoint: 'https://desk.example.test/events',
      credentialRef: null,
      enabled: true,
    }),
  )
  await f.post(`${root}/deliver`, operation({}, 1))
  f.advance()
  expect((await f.server.handle('GET', root)).body).toMatchObject({
    connector: { health: 'disconnected' },
  })
  const test = (await f.post(`${root}/test`, operation({}, 1))).body as { delivery: { id: string } }
  f.advance()
  expect((await f.server.handle('GET', `${root}/attempts/${test.delivery.id}`)).body).toMatchObject(
    { delivery: { kind: 'test', state: 'passed' } },
  )
  expect((await f.server.handle('GET', root)).body).toMatchObject({
    connector: { health: 'disconnected' },
  })
})
