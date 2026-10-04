import { expect, it } from 'vitest'
import { createAdminDemo } from './admin'
import { createOperationsDemo } from './state'
import { createAuthorizationDemo } from './authorization'
import { createScenario, TENANT, type Scenario } from '../scenario'
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
it('keeps connector configuration, test and deliveries separate; CAS and retries retain failed history', async () => {
  const f = await fixture(),
    root = '/api/v1/mdm-candidate/integrations/connectors',
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
  const settings = (await f.server.handle('GET', '/api/v1/mdm-candidate/operations/settings'))
    .body as { configuration: { revision: number; values: unknown } }
  await f.post(
    '/api/v1/mdm-candidate/operations/settings',
    operation(settings.configuration.values, settings.configuration.revision),
  )
  expect(
    (await f.server.handle('GET', '/api/v1/mdm-candidate/operations/settings')).body,
  ).toMatchObject({ configuration: { state: 'saved', savedVersion: 2, activeVersion: 1 } })
  expect(
    (await f.post('/api/v1/mdm-candidate/operations/settings/activate', operation({}, 2))).body,
  ).toMatchObject({ configuration: { state: 'restart_required' } })
  expect(
    (
      await f.post(
        '/api/v1/mdm-candidate/operations/maintenance',
        operation({ kind: 'restore', target: 'demo-backup-1', method: 'full' }),
      )
    ).status,
  ).toBe(202)
  f.advance()
  const jobs = (await f.server.handle('GET', '/api/v1/mdm-candidate/operations/maintenance')).body
  expect(jobs).toMatchObject({ items: [{ phase: 'completed', effect: 'unverified' }] })
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
        `/api/v1/mdm-candidate/operations/maintenance?cursor=${first.nextCursor}`,
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

it('reads terminal connection tests without treating a passed test as business delivery recovery', async () => {
  const f = await fixture(),
    id = crypto.randomUUID(),
    root = `/api/v1/mdm-candidate/integrations/connectors/${id}`
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

it('uses report references for completed report audit events', async () => {
  const f = await fixture(),
    body = operation({ from: 0, until: 100 })
  await f.post('/api/v1/mdm-candidate/operations/reports', body)
  f.advance()
  const page = (await f.server.handle('GET', '/api/v1/mdm-candidate/operations/audit')).body as {
    items: { action: string; target: { kind: string; id: string } }[]
  }
  expect(page.items.find((v) => v.action === 'job_observed')?.target).toMatchObject({
    kind: 'report',
    id: body.operationId,
  })
})
it('derives alerts from the same diagnostics and retains unknown agent evidence', async () => {
  const f = await fixture()
  const projection = crypto.randomUUID(),
    agent = crypto.randomUUID()
  for (const [id, signal] of [
    [projection, 'projection_backlog'],
    [agent, 'agent_health'],
  ])
    await f.post(
      `/api/v1/mdm-candidate/operations/alert-rules/${id}`,
      operation({ name: signal, signal, threshold: 0, enabled: true }),
    )
  f.advance('normal')
  f.server.set('partial')
  expect(
    (await f.server.handle('GET', '/api/v1/mdm-candidate/operations/diagnostics')).body,
  ).toMatchObject({
    diagnostics: { projectionBacklog: 12, agents: [{ health: 'offline' }, { health: 'offline' }] },
  })
  f.advance('partial')
  const page = async () =>
    (await f.server.handle('GET', '/api/v1/mdm-candidate/operations/alerts')).body as {
      items: { state: string; target: { id: string }; evidence: { state: string } }[]
    }
  expect((await page()).items.find((v) => v.target.id === projection)?.state).toBe('open')
  f.server.set('normal')
  f.advance('normal')
  expect((await page()).items.find((v) => v.target.id === projection)?.state).toBe('resolved')
  expect((await page()).items.find((v) => v.target.id === agent)).toMatchObject({
    state: 'open',
    evidence: { state: 'unknown' },
  })
})
it('keeps disabled health while queued deliveries finish and restores known delivery facts on enable', async () => {
  const f = await fixture(),
    id = crypto.randomUUID(),
    root = `/api/v1/mdm-candidate/integrations/connectors/${id}`
  const definition = {
    name: 'Desk',
    kind: 'itsm',
    endpoint: 'https://desk.example.test',
    credentialRef: null,
    enabled: true,
  }
  await f.post(root, operation(definition))
  await f.post(`${root}/deliver`, operation({}, 1))
  await f.post(root, operation({ ...definition, enabled: false }, 1))
  f.advance()
  expect((await f.server.handle('GET', root)).body).toMatchObject({
    connector: { health: 'disabled', definition: { enabled: false } },
  })
  expect((await f.server.handle('GET', `${root}/deliveries`)).body).toMatchObject({
    items: [{ state: 'failed' }],
  })
  await f.post(root, operation(definition, 2))
  expect((await f.server.handle('GET', root)).body).toMatchObject({
    connector: { health: 'disconnected' },
  })
})

it.each(['retry_then_failure', 'failure_then_retry'] as const)(
  'uses explicit business completion order for same-tick deliveries: %s',
  async (order) => {
    const f = await fixture(),
      id = crypto.randomUUID(),
      ruleId = crypto.randomUUID(),
      root = `/api/v1/mdm-candidate/integrations/connectors/${id}`
    const definition = {
      name: 'Desk',
      kind: 'itsm',
      endpoint: 'https://desk.example.test',
      credentialRef: null,
      enabled: true,
    }
    await f.post(root, operation(definition))
    await f.post(
      `/api/v1/mdm-candidate/operations/alert-rules/${ruleId}`,
      operation({
        name: 'Delivery failures',
        signal: 'connector_failure',
        threshold: 0,
        enabled: true,
      }),
    )
    const first = operation({}, 1)
    await f.post(`${root}/deliver`, first)
    f.advance()
    const alert = async () => {
      const page = (await f.server.handle('GET', '/api/v1/mdm-candidate/operations/alerts'))
        .body as {
        items: { state: string; target: { id: string }; evidence: { state: string } }[]
      }
      return page.items.find((v) => v.target.id === ruleId)
    }
    expect(await alert()).toMatchObject({ state: 'open', evidence: { state: 'active' } })
    const retry = operation({}, 2),
      fresh = operation({}, 1)
    const submitRetry = () => f.post(`${root}/deliveries/${first.operationId}/retry`, retry)
    const submitFresh = () => f.post(`${root}/deliver`, fresh)
    for (const submit of order === 'retry_then_failure'
      ? [submitRetry, submitFresh]
      : [submitFresh, submitRetry])
      expect((await submit()).status).toBe(202)
    f.advance()
    expect(
      (await f.server.handle('GET', `${root}/attempts/${retry.operationId}`)).body,
    ).toMatchObject({ delivery: { state: 'delivered', at: 300, attempt: 2 } })
    expect(
      (await f.server.handle('GET', `${root}/attempts/${fresh.operationId}`)).body,
    ).toMatchObject({ delivery: { state: 'failed', at: 300, attempt: 1 } })
    const health = order === 'retry_then_failure' ? 'disconnected' : 'healthy'
    expect((await f.server.handle('GET', root)).body).toMatchObject({ connector: { health } })
    expect(await alert()).toMatchObject({
      state: health === 'disconnected' ? 'open' : 'resolved',
      evidence: { state: health === 'disconnected' ? 'active' : 'cleared' },
    })
    // Saving or re-enabling projects the same owner-observed fact.
    await f.post(root, operation({ ...definition, enabled: false }, 1))
    expect((await f.server.handle('GET', root)).body).toMatchObject({
      connector: { health: 'disabled' },
    })
    await f.post(root, operation(definition, 2))
    expect((await f.server.handle('GET', root)).body).toMatchObject({ connector: { health } })
  },
)

it('keeps unknown delivery evidence after a passed connection test', async () => {
  const f = await fixture(),
    id = crypto.randomUUID(),
    ruleId = crypto.randomUUID(),
    root = `/api/v1/mdm-candidate/integrations/connectors/${id}`
  await f.post(
    root,
    operation({
      name: 'Desk',
      kind: 'itsm',
      endpoint: 'https://desk.example.test',
      credentialRef: null,
      enabled: true,
    }),
  )
  await f.post(
    `/api/v1/mdm-candidate/operations/alert-rules/${ruleId}`,
    operation({ name: 'Failures', signal: 'connector_failure', threshold: 0, enabled: true }),
  )
  await f.post(`${root}/deliver`, operation({}, 1))
  f.advance()
  f.server.set('partial')
  await f.post(`${root}/deliver`, operation({}, 1))
  f.advance('partial')
  f.server.set('normal')
  await f.post(`${root}/test`, operation({}, 1))
  f.advance()
  expect((await f.server.handle('GET', root)).body).toMatchObject({
    connector: { health: 'backlog' },
  })
  const page = (await f.server.handle('GET', '/api/v1/mdm-candidate/operations/alerts')).body as {
    items: { state: string; target: { id: string }; evidence: { state: string } }[]
  }
  expect(page.items.find((v) => v.target.id === ruleId)).toMatchObject({
    state: 'open',
    evidence: { state: 'unknown' },
  })
})
it('resets the latest business observation with the domain state and receipts', async () => {
  const f = await fixture(),
    a = crypto.randomUUID(),
    b = crypto.randomUUID(),
    root = '/api/v1/mdm-candidate/integrations/connectors',
    body = operation({}, 1)
  const definition = {
    name: 'Desk',
    kind: 'itsm',
    endpoint: 'https://desk.example.test',
    credentialRef: null,
    enabled: true,
  }
  await f.post(`${root}/${a}`, operation(definition))
  await f.post(`${root}/${a}/deliver`, body)
  f.advance()
  f.admin.reset()
  f.operations.reset()
  await f.post(`${root}/${b}`, operation(definition))
  await f.post(`${root}/${b}/deliver`, body)
  f.advance()
  await f.post(`${root}/${a}`, operation(definition))
  expect((await f.server.handle('GET', `${root}/${a}`)).body).toMatchObject({
    connector: { health: 'unknown' },
  })
})
