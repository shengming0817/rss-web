import { describe, expect, it } from 'vitest'
import { createScenario, TENANT } from './scenario'
async function control(scenario: ReturnType<typeof createScenario>, body: unknown) {
  const session = await scenario.handle('GET', `/api/v2/tenants/${TENANT}/session`)
  return scenario.handle('POST', '/api/mdm-candidate/v1/workspace/scenario', body, {
    'x-csrf-token': (session.body as { csrfToken: string }).csrfToken,
    'x-identity-request': '1',
  })
}
describe('HTTP demo state', () => {
  it('requires login, rotates CSRF and resets deterministically', async () => {
    const scenario = createScenario()
    expect((await scenario.handle('GET', `/api/v2/tenants/${TENANT}/session`)).status).toBe(401)
    const login = await scenario.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
      login: 'demo',
      password: 'demo',
    })
    expect(login.status).toBe(200)
    expect((await scenario.handle('GET', '/api/mdm-candidate/v1/workspace')).status).toBe(200)
    scenario.reset()
    expect((await scenario.handle('GET', '/api/mdm-candidate/v1/workspace')).status).toBe(401)
  })
  it('keeps explicit denied, unavailable and unknown scenarios distinct', async () => {
    const scenario = createScenario()
    const login = await scenario.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
      login: 'demo',
      password: 'demo',
    })
    scenario.set('forbidden')
    expect((await scenario.handle('GET', '/api/mdm-candidate/v1/workspace')).status).toBe(403)
    scenario.set('offline')
    expect((await scenario.handle('GET', '/api/mdm-candidate/v1/workspace')).status).toBe(503)
    scenario.set('unknown')
    expect(
      (
        await scenario.handle(
          'POST',
          '/api/mdm-candidate/v1/workspace/change',
          {},
          {
            'x-csrf-token': (login.body as { csrfToken: string }).csrfToken,
            'x-identity-request': '1',
          },
        )
      ).body,
    ).toEqual({
      code: 'operation_unknown',
    })
  })
})

it('enforces CSRF, rotates it on refresh, and clears authenticated state after logout', async () => {
  const scenario = createScenario()
  const login = await scenario.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  const token = (login.body as { csrfToken: string }).csrfToken
  expect((await scenario.handle('POST', `/api/v2/tenants/${TENANT}/session/refresh`)).status).toBe(
    403,
  )
  const refresh = await scenario.handle(
    'POST',
    `/api/v2/tenants/${TENANT}/session/refresh`,
    {},
    { 'x-csrf-token': token, 'x-identity-request': '1' },
  )
  const next = (refresh.body as { csrfToken: string }).csrfToken
  expect(next).not.toBe(token)
  expect(
    (
      await scenario.handle(
        'POST',
        `/api/v2/tenants/${TENANT}/session/logout`,
        {},
        { 'x-csrf-token': token, 'x-identity-request': '1' },
      )
    ).status,
  ).toBe(403)
  expect(
    (
      await scenario.handle(
        'POST',
        `/api/v2/tenants/${TENANT}/session/logout`,
        {},
        { 'x-csrf-token': next, 'x-identity-request': '1' },
      )
    ).status,
  ).toBe(204)
  expect((await scenario.handle('GET', `/api/v2/tenants/${TENANT}/session`)).status).toBe(401)
})

it('derives distinct actors and session IDs from authenticated accounts, never request data', async () => {
  const seen: unknown[] = []
  const scenario = createScenario([
    (request) => {
      seen.push(request.actor)
      return { status: 200 }
    },
  ])
  async function login(login: string) {
    const reply = await scenario.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
      login,
      password: 'demo',
    })
    expect(reply.status).toBe(200)
    return reply.body as {
      session: { id: string }
      identity: { principalId: string }
      csrfToken: string
    }
  }
  const author = await login('demo')
  await scenario.handle('GET', '/api/v2/scopes/example', { principalId: 'forged' })
  const reviewer = await login('reviewer')
  await scenario.handle('GET', '/api/v2/scopes/example')
  const renewed = await login('demo')
  expect(author.identity.principalId).not.toBe(reviewer.identity.principalId)
  expect(author.session.id).not.toBe(renewed.session.id)
  expect(seen).toEqual([
    { principalId: author.identity.principalId, sessionId: author.session.id },
    { principalId: reviewer.identity.principalId, sessionId: reviewer.session.id },
  ])
})
it('never falls back to mock for published policy or native-operation paths', async () => {
  const scenario = createScenario([() => ({ status: 200 })])
  await scenario.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  await control(scenario, {
    scenario: 'normal',
    module: 'policies',
    source: 'real',
  })
  for (const path of [
    '/api/v2/scopes/id',
    '/api/v3/resources/id',
    '/api/v2/policies/id',
    '/api/mdm-candidate/v1/policies/assignments/id',
    '/api/v2/devices/device/operations/id',
    '/api/mdm-candidate/v1/executions/id',
  ]) {
    expect((await scenario.handle('GET', path)).status, path).toBe(503)
  }
})

it('classifies native compliance under security before the generic device path', async () => {
  const scenario = createScenario([() => ({ status: 200 })])
  await scenario.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  await control(scenario, { scenario: 'normal', module: 'security', source: 'real' })
  for (const path of [
    '/api/v2/compliance-rules',
    '/api/v2/compliance-rules/id/tasks/task',
    '/api/v2/devices/device-01/compliance',
    '/api/v2/devices/device-01/compliance/history',
  ])
    expect((await scenario.handle('GET', path)).status, path).toBe(503)
  expect((await scenario.handle('GET', '/api/v2/devices/device-01/inventory')).status).toBe(200)
  await control(scenario, { scenario: 'normal', module: 'security', source: 'mock' })
  await control(scenario, { scenario: 'normal', module: 'devices', source: 'real' })
  expect((await scenario.handle('GET', '/api/v2/devices/device-01/compliance')).status).toBe(200)
})

it('accepts bounded raw resource bytes while retaining the JSON request budget elsewhere', async () => {
  const scenario = createScenario([
    (request) => ({
      status: 201,
      body: request.body instanceof ArrayBuffer ? request.body.byteLength : -1,
    }),
  ])
  const login = await scenario.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  const headers = {
    'x-csrf-token': (login.body as { csrfToken: string }).csrfToken,
    'x-identity-request': '1',
  }
  const content = new Uint8Array(20_000).buffer
  expect(await scenario.handle('POST', '/api/v3/resources/id/content', content, headers)).toEqual({
    status: 201,
    body: 20_000,
  })
  expect((await scenario.handle('POST', '/api/v3/resources/id', content, headers)).status).toBe(400)
  expect(
    (await scenario.handle('POST', '/api/v3/resources/id', { data: 'a'.repeat(20_000) }, headers))
      .status,
  ).toBe(413)
  expect(
    (
      await scenario.handle(
        'POST',
        '/api/v3/resources/id/content',
        new ArrayBuffer(16_777_217),
        headers,
      )
    ).status,
  ).toBe(413)
})

it('injects automation events only into the explicit mock source after login', async () => {
  const events: unknown[] = []
  const scenario = createScenario(
    [],
    () => {},
    (event) => events.push(event),
  )
  const path = '/api/mdm-candidate/v1/workspace/scenario'
  const event = { kind: 'clock', at: Math.floor(Date.now() / 1000) + 60 }
  expect((await scenario.handle('POST', path, { event })).status).toBe(401)
  await scenario.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  expect((await scenario.handle('POST', path, { event })).status).toBe(403)
  expect((await control(scenario, { event })).status).toBe(204)
  expect(events).toEqual([event])
  expect((await control(scenario, { event: { kind: 'check_in', at: event.at } })).status).toBe(400)
  await control(scenario, { scenario: 'normal', module: 'policies', source: 'real' })
  expect((await control(scenario, { event })).status).toBe(409)
  expect(events).toHaveLength(1)
})
