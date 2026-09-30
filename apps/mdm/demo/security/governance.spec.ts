import { expect, it } from 'vitest'
import { createDeviceDemo } from '../devices/state'
import { createAutomationDemo } from '../policies/state'
import { createScenario, TENANT } from '../scenario'
import { operation } from '../../src/services/useOperation'
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
    const response = await server.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
      login,
      password: 'demo',
    })
    headers = {
      'x-csrf-token': (response.body as { csrfToken: string }).csrfToken,
      'x-identity-request': '1',
    }
  }
  await login('demo')
  const write = (method: string, path: string, body: unknown) =>
    server.handle(method, path, body, headers)
  const now = Math.floor(Date.now() / 1000),
    scope = crypto.randomUUID(),
    rule = crypto.randomUUID(),
    baseline = crypto.randomUUID()
  const scopeDefinition = {
    targets: [{ kind: 'device', id: 'device-01' }],
    limitations: null,
    exclusions: [],
  }
  const scoped = operation({ action: 'put', definition: scopeDefinition })
  expect((await write('POST', `/api/v2/scopes/${scope}`, scoped)).status).toBe(200)
  await server.handle('GET', `/api/v2/scopes/${scope}/tasks/${scoped.operationId}`)
  await server.handle('GET', `/api/v2/scopes/${scope}/tasks/${scoped.operationId}`)
  const ruleDefinition = {
    name: 'Office floor',
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
  const created = await write('PUT', `/api/v2/compliance-rules/${rule}`, operation(ruleDefinition))
  const task = (created.body as { task: string }).task
  await server.handle('GET', `/api/v2/compliance-rules/${rule}/tasks/${task}`)
  await server.handle('GET', `/api/v2/compliance-rules/${rule}/tasks/${task}`)
  const definition = {
    name: 'Managed workplace',
    enabled: true,
    scope,
    rules: [{ id: rule, revision: 1 }],
    graceUntil: now + 600,
  }
  expect((await write('PUT', `${root}/baselines/${baseline}`, operation(definition))).status).toBe(
    200,
  )
  const target = {
    kind: 'compliance_exception',
    baseline,
    baselineRevision: 1,
    rule,
    ruleVersion: 1,
    device: 'device-01',
  }
  const request = () =>
    operation({
      target,
      reason: 'Private business justification',
      validFrom: now,
      validUntil: now + 120,
    })
  const projection = () => server.handle('GET', `${root}/baselines/${baseline}/devices`)
  return {
    server,
    write,
    login,
    now,
    scope,
    scopeDefinition,
    rule,
    ruleDefinition,
    baseline,
    definition,
    target,
    request,
    projection,
  }
}
it('keeps raw noncompliance intact through grace, separate approval and expiry', async () => {
  const f = await setup(),
    nativePath = '/api/v2/devices/device-01/compliance'
  const native = (await f.server.handle('GET', nativePath)).body
  expect((await f.projection()).body).toMatchObject({
    items: [{ device: 'device-01', native, rules: [{ governance: 'grace', drift: 'none' }] }],
  })
  const body = f.request(),
    requestPath = `${root}/requests/${body.operationId}`
  expect((await f.write('POST', `${root}/requests`, body)).body).toMatchObject({
    request: { id: body.operationId, state: 'pending' },
  })
  expect((await f.write('POST', `${requestPath}/approve`, operation({}, 1))).status).toBe(403)
  await f.login('reviewer')
  expect((await f.write('POST', `${requestPath}/approve`, operation({}, 1))).body).toMatchObject({
    request: { state: 'approved', revision: 2 },
  })
  expect((await f.projection()).body).toMatchObject({
    items: [{ native, rules: [{ governance: 'exempt', request: body.operationId }] }],
  })
  expect((await f.server.handle('GET', nativePath)).body).toEqual(native)
  expect(
    (
      await f.write('POST', '/api/mdm-candidate/v1/workspace/scenario', {
        event: { kind: 'clock', at: f.now + 601 },
      })
    ).status,
  ).toBe(204)
  expect((await f.server.handle('GET', requestPath)).body).toMatchObject({
    request: { state: 'expired' },
  })
  expect((await f.projection()).body).toMatchObject({
    items: [{ native, rules: [{ governance: 'action_required', request: null }] }],
  })
  const audit = (await f.server.handle('GET', '/api/mdm-candidate/v1/operations/audit')).body
  expect(JSON.stringify(audit)).not.toContain('Private business justification')
})
it('pins exact rule revisions, rejects stale approval and replays unknown baseline edits', async () => {
  const f = await setup(),
    requested = f.request(),
    requestPath = `${root}/requests/${requested.operationId}`
  await f.write('POST', `${root}/requests`, requested)
  expect(
    (
      await f.write(
        'PUT',
        `/api/v2/compliance-rules/${f.rule}`,
        operation({ ...f.ruleDefinition, criteria: { kind: 'and', children: [] } }, 1),
      )
    ).status,
  ).toBe(200)
  expect((await f.projection()).body).toMatchObject({
    items: [{ rules: [{ ruleVersion: 1, drift: 'rule_changed', governance: 'unknown' }] }],
  })
  await f.login('reviewer')
  expect((await f.write('POST', `${requestPath}/approve`, operation({}, 1))).status).toBe(409)
  const change = operation({ ...f.definition, rules: [{ id: f.rule, revision: 2 }] }, 1)
  f.server.set('unknown')
  expect((await f.write('PUT', `${root}/baselines/${f.baseline}`, change)).status).toBe(503)
  f.server.set('normal')
  const recovered = await f.write('PUT', `${root}/baselines/${f.baseline}`, change)
  expect(recovered.body).toMatchObject({ baseline: { revision: 2, operation: change.operationId } })
  expect((await f.write('PUT', `${root}/baselines/${f.baseline}`, change)).body).toEqual(
    recovered.body,
  )
  expect(
    (
      await f.write('PUT', `${root}/baselines/${f.baseline}`, {
        ...change,
        input: { ...change.input, name: 'Changed again' },
      })
    ).status,
  ).toBe(409)
})
it('revokes and denies exceptions without hiding native evidence, and refuses approvals after Scope changes', async () => {
  const f = await setup(),
    first = f.request()
  await f.write('POST', `${root}/requests`, first)
  await f.login('reviewer')
  await f.write('POST', `${root}/requests/${first.operationId}/approve`, operation({}, 1))
  expect(
    (await f.write('POST', `${root}/requests/${first.operationId}/revoke`, operation({}, 2))).body,
  ).toMatchObject({ request: { state: 'revoked' } })
  expect((await f.projection()).body).toMatchObject({
    items: [{ native: { status: 'non_compliant' }, rules: [{ governance: 'grace' }] }],
  })
  await f.login('demo')
  const second = f.request(),
    third = f.request()
  await f.write('POST', `${root}/requests`, second)
  await f.write('POST', `${root}/requests`, third)
  await f.login('reviewer')
  expect(
    (await f.write('POST', `${root}/requests/${second.operationId}/deny`, operation({}, 1))).body,
  ).toMatchObject({ request: { state: 'denied' } })
  const changed = operation({ action: 'put', definition: { ...f.scopeDefinition, targets: [] } }, 1)
  await f.write('POST', `/api/v2/scopes/${f.scope}`, changed)
  await f.server.handle('GET', `/api/v2/scopes/${f.scope}/tasks/${changed.operationId}`)
  await f.server.handle('GET', `/api/v2/scopes/${f.scope}/tasks/${changed.operationId}`)
  expect((await f.projection()).body).toMatchObject({
    items: [{ rules: [{ drift: 'scope_changed', governance: 'unknown' }] }],
  })
  expect(
    (await f.write('POST', `${root}/requests/${third.operationId}/approve`, operation({}, 1)))
      .status,
  ).toBe(409)
})
it('retains the original time and approval state across cursor pages while fresh reads expire requests', async () => {
  const f = await setup()
  const first = f.request(),
    second = f.request()
  await f.write('POST', `${root}/requests`, first)
  await f.write('POST', `${root}/requests`, second)
  await f.login('reviewer')
  await f.write('POST', `${root}/requests/${first.operationId}/approve`, operation({}, 1))
  await f.write('POST', `${root}/requests/${second.operationId}/approve`, operation({}, 1))
  const initial = (await f.server.handle('GET', `${root}/requests?state=approved&limit=1`))
    .body as { asOf: number; snapshot: string; nextCursor: string }
  expect(initial.nextCursor).toEqual(expect.any(String))
  await f.write('POST', '/api/mdm-candidate/v1/workspace/scenario', {
    event: { kind: 'clock', at: f.now + 121 },
  })
  const path = `${root}/requests?state=approved&limit=1&cursor=${encodeURIComponent(initial.nextCursor)}`
  expect((await f.server.handle('GET', path)).body).toMatchObject({
    asOf: initial.asOf,
    snapshot: initial.snapshot,
    items: [{ id: first.operationId, state: 'approved' }],
  })
  expect(
    (await f.server.handle('GET', `${root}/requests/${first.operationId}`)).body,
  ).toMatchObject({ asOf: f.now + 121, request: { state: 'expired' } })
  expect((await f.server.handle('GET', `${root}/requests?state=approved`)).body).toMatchObject({
    items: [],
  })
  await f.login('demo')
  expect((await f.server.handle('GET', path)).status).toBe(400)
  expect(
    (await f.server.handle('GET', `${root}/baselines/${f.baseline}/devices?revision=2`)).status,
  ).toBe(409)
})
