import { expect, it } from 'vitest'
import { createAuthorizationDemo, ADMIN, ADMIN_RULE, INSTANCE } from './authorization'
import { createScenario, TENANT } from '../scenario'
const uuid = () => crypto.randomUUID()
async function fixture() {
  const events: unknown[] = []
  const auth = createAuthorizationDemo(
    () => 100,
    (e) => events.push(e),
  )
  const server = createScenario([auth.handle], auth.reset, () => true)
  const session = await server.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  const csrf = (session.body as { csrfToken: string }).csrfToken
  const write = (path: string, body: unknown) =>
    server.handle('PUT', path, body, { 'x-csrf-token': csrf, 'x-identity-request': '1' })
  return { auth, server, events, write }
}
it('enforces native authorization, revision/tombstone and exact unknown replay', async () => {
  const f = await fixture(),
    id = uuid(),
    op = uuid(),
    body = {
      operationId: op,
      expectedRevision: 0,
      value: {
        name: 'Team',
        enabled: true,
        members: [{ instanceId: INSTANCE, tenantId: TENANT, principalId: ADMIN }],
      },
    }
  const path = `/api/v1/authorization/user-groups/${id}`
  f.server.set('unknown')
  expect((await f.write(path, body)).status).toBe(503)
  f.server.set('normal')
  expect((await f.write(path, body)).body).toEqual({ id, revision: 1, deleted: false })
  expect(f.events).toHaveLength(1)
  expect((await f.write(path, { ...body, value: { ...body.value, name: 'changed' } })).status).toBe(
    409,
  )
  expect(
    (await f.write(path, { operationId: uuid(), expectedRevision: 1, value: null })).body,
  ).toEqual({ id, revision: 2, deleted: true })
  expect((await f.write(path, { ...body, operationId: uuid(), expectedRevision: 0 })).status).toBe(
    409,
  )
  const rules = (await f.server.handle('GET', '/api/v1/authorization/rules')).body as {
    items: { id: string; revision: number; value: unknown }[]
  }
  const admin = rules.items.find((r) => r.id === ADMIN_RULE)!
  expect(
    (
      await f.write(`/api/v1/authorization/rules/${ADMIN_RULE}`, {
        operationId: uuid(),
        expectedRevision: admin.revision,
        value: null,
      })
    ).status,
  ).toBe(200)
  expect((await f.server.handle('GET', '/api/v1/authorization/rules')).status).toBe(403)
})
it('pages native groups/members and rejects cross-instance members', async () => {
  const f = await fixture(),
    id = uuid()
  const members = Array.from({ length: 201 }, (_, i) => ({
    instanceId: INSTANCE,
    tenantId: TENANT,
    principalId: `33333333-3333-4333-8333-${String(i + 1).padStart(12, '0')}`,
  }))
  const body = {
    operationId: uuid(),
    expectedRevision: 0,
    value: { name: 'Large', enabled: true, members },
  }
  expect((await f.write(`/api/v1/authorization/user-groups/${id}`, body)).status).toBe(200)
  expect(
    (await f.server.handle('GET', `/api/v1/authorization/user-groups/${id}/members?offset=100`))
      .status,
  ).toBe(409)
  expect(
    (
      await f.server.handle(
        'GET',
        `/api/v1/authorization/user-groups/${id}/members?offset=100&expectedRevision=1`,
      )
    ).body,
  ).toMatchObject({ revision: 1, items: members.slice(100, 200), nextOffset: 200 })
  expect(
    (
      await f.write(`/api/v1/authorization/user-groups/${uuid()}`, {
        ...body,
        operationId: uuid(),
        value: { ...body.value, members: [{ ...members[0], instanceId: uuid() }] },
      })
    ).status,
  ).toBe(400)
})
