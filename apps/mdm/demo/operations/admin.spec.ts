import { expect, it } from 'vitest'
import { createAdminDemo } from './admin'
import { createOperationsDemo } from './state'
import { createAuthorizationDemo } from './authorization'
import { createScenario, TENANT, type Scenario } from '../scenario'
import { operation } from '../../src/services/useOperation'
async function fixture() {
  let time = 100
  const operations = createOperationsDemo(() => time, {
    can: (actor) => auth.can(actor, 'audit_read'),
    binding: (actor) => JSON.stringify(auth.effective(actor)),
    devices: () => [],
  })
  const auth = createAuthorizationDemo(
    () => time,
    operations.record,
    () => ({ definition: undefined, device: undefined }),
  )
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
      admin.tick('normal')
      return true
    },
  )
  const login = await server.handle('POST', `/api/v1/identity/tenants/${TENANT}/login`, {
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
    advance: (scenario: Scenario = 'normal') => {
      time += 100
      admin.tick(scenario)
    },
  }
}
it('runs bounded reports only on explicit events', async () => {
  const f = await fixture()
  const report = await f.post(
    '/api/v1/mdm-candidate/operations/reports',
    operation({ from: 0, until: 100 }),
  )
  expect(report.status).toBe(202)
  const job = (report.body as { job: { id: string } }).job
  expect(
    (await f.server.handle('GET', `/api/v1/mdm-candidate/operations/reports/${job.id}`)).body,
  ).toMatchObject({ job: { phase: 'accepted', result: null } })
  f.advance()
  expect(
    (await f.server.handle('GET', `/api/v1/mdm-candidate/operations/reports/${job.id}`)).body,
  ).toMatchObject({
    job: { phase: 'completed', result: { known: 2, unknown: 0, scope: 'authorized' } },
  })
})
it('supports alert rules, authorized partial metrics, frozen pages and unknown writes', async () => {
  const f = await fixture(),
    root = '/api/v1/mdm-candidate/operations/alert-rules'
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
        `/api/v1/mdm-candidate/operations/reports?cursor=${first.nextCursor}`,
      )
    ).status,
  ).toBe(400)
  f.server.set('partial')
  expect(
    (await f.server.handle('GET', '/api/v1/mdm-candidate/operations/metrics?from=0&until=100'))
      .body,
  ).toMatchObject({ metrics: { complete: false, unknown: null, scope: 'authorized' } })
})

it('closes the administrative ticket without resolving source evidence and reopens on new evidence', async () => {
  const f = await fixture(),
    rule = crypto.randomUUID()
  await f.post(
    `/api/v1/mdm-candidate/operations/alert-rules/${rule}`,
    operation({
      name: 'Projection backlog',
      signal: 'projection_backlog',
      threshold: 0,
      enabled: true,
    }),
  )
  f.advance('partial')
  const alertPage = (await f.server.handle('GET', '/api/v1/mdm-candidate/operations/alerts'))
    .body as { items: { id: string; revision: number }[] }
  const alert = alertPage.items[0]!
  expect(alert).toMatchObject({ state: 'open', target: { kind: 'alert_rule', id: rule } })
  expect(
    (
      await f.post(
        `/api/v1/mdm-candidate/operations/alerts/${alert.id}/close`,
        operation({ note: 'Tracked by support' }, alert.revision),
      )
    ).status,
  ).toBe(200)
  expect(
    (await f.server.handle('GET', `/api/v1/mdm-candidate/operations/alerts/${alert.id}`)).body,
  ).toMatchObject({ alert: { state: 'open' } })
  expect(
    (await f.server.handle('GET', `/api/v1/mdm-candidate/operations/alerts/${alert.id}/closure`))
      .body,
  ).toMatchObject({ closure: { note: 'Tracked by support' } })
  f.advance('partial')
  expect(
    (await f.server.handle('GET', `/api/v1/mdm-candidate/operations/alerts/${alert.id}/closure`))
      .body,
  ).toMatchObject({ closure: null })
})

it('uses report references for completed report audit events', async () => {
  const f = await fixture(),
    body = operation({ from: 0, until: 100 })
  await f.post('/api/v1/mdm-candidate/operations/reports', body)
  f.advance()
  const page = (await f.server.handle('GET', '/api/v1/audit-events')).body as {
    items: { action: string; target: { type: string; id: string } }[]
  }
  expect(page.items.find((v) => v.action === 'job_observed')?.target).toMatchObject({
    type: 'report',
    id: body.operationId,
  })
})
