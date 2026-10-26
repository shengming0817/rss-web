// @vitest-environment node
import { it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createDemoServer } from './server'
import { TENANT } from './state'
function signedIn(login = 'demo') {
  const server = createDemoServer(),
    reply = server.handle(
      'POST',
      '/api/v1/identity/tenants/' + TENANT + '/login',
      { login, password: 'demo' },
      {},
    ),
    value = reply.body as { csrfToken: string }
  return {
    server,
    headers: {
      cookie: reply.headers!['Set-Cookie']!.split(';')[0]!,
      'x-identity-request': '1',
      'x-csrf-token': value.csrfToken,
    },
  }
}
it('requires a cookie and CSRF, enforces readonly and returns no production fallback', () => {
  const { server, headers } = signedIn()
  expect(server.handle('GET', '/api/da-demo/computers', undefined, {}).status).toBe(401)
  expect(
    server.handle(
      'POST',
      '/api/da-demo/scenario',
      { scenario: 'normal' },
      { cookie: headers.cookie },
    ).status,
  ).toBe(403)
  expect(server.handle('GET', '/api/v1/devices', undefined, headers).status).toBe(501)
  const reader = signedIn('reader')
  expect(
    reader.server.handle('POST', '/api/da-demo/credentials', { label: 'key' }, reader.headers)
      .status,
  ).toBe(403)
})
it('commits unknown writes once, preserves device-bound receipts and does not transfer Passkeys', () => {
  const { server, headers } = signedIn(),
    device = server.data.computers[0]!,
    old = server.data.assignments[device.id]!,
    person = server.data.people[1]!
  server.handle('POST', '/api/da-demo/scenario', { scenario: 'unknown' }, headers)
  const operationId = randomUUID(),
    body = { operationId, expectedRevision: old.revision, assignee: person, owner: old.owner }
  const reply = server.handle(
    'POST',
    '/api/da-demo/computers/' + device.id + '/assignment',
    body,
    headers,
  )
  expect(reply.status).toBe(503)
  expect(server.data.assignments[device.id]?.assignee?.id).toBe(person.id)
  expect(server.data.passkeys[device.id]?.[0]?.account).not.toBe(person.label)
  expect(
    server.handle(
      'GET',
      '/api/da-demo/operations/' + operationId + '?device=' + device.id,
      undefined,
      headers,
    ).body,
  ).toMatchObject({ id: operationId, device: device.id })
  expect(
    server.handle(
      'GET',
      '/api/da-demo/operations/' + operationId + '?device=other',
      undefined,
      headers,
    ).body,
  ).toBeNull()
  expect(server.data.audit).toHaveLength(2)
})
it('returns metadata without secrets and separates rotation from applied device effect', () => {
  const { server, headers } = signedIn(),
    device = server.data.computers[1]!,
    m = server.data.materials[device.id]![0]!
  const path = '/api/da-demo/computers/' + device.id + '/materials'
  const metadata = server.handle('GET', path, undefined, headers)
  expect(JSON.stringify(metadata.body)).not.toContain('4826')
  expect(
    server.handle(
      'POST',
      path + '/' + m.id + '/secret',
      { operationId: randomUUID(), version: m.version },
      headers,
    ).body,
  ).toHaveProperty('secret')
  const operationId = randomUUID()
  expect(
    server.handle(
      'POST',
      path + '/' + m.id + '/rotate',
      { operationId, version: m.version },
      headers,
    ).body,
  ).toMatchObject({ state: 'accepted', observations: [{ state: 'unknown' }] })
  expect(m.version).toBe(4)
})
it('rejects conflicts and enforces source/current identity even in demo', () => {
  const { server, headers } = signedIn(),
    device = server.data.computers[0]!
  server.handle('POST', '/api/da-demo/scenario', { scenario: 'conflict' }, headers)
  expect(
    server.handle(
      'POST',
      '/api/da-demo/computers/' + device.id + '/assignment',
      { operationId: randomUUID(), expectedRevision: 1, assignee: null, owner: null },
      headers,
    ).status,
  ).toBe(409)
  server.handle('POST', '/api/da-demo/scenario', { scenario: 'forbidden' }, headers)
  expect(server.handle('GET', '/api/da-demo/computers', undefined, headers).status).toBe(403)
  server.handle('POST', '/api/da-demo/scenario', { scenario: 'empty' }, headers)
  expect(server.handle('GET', '/api/da-demo/computers', undefined, headers).body).toEqual({
    items: [],
    nextCursor: null,
  })
  server.handle('POST', '/api/da-demo/scenario', { scenario: 'expired' }, headers)
  expect(server.handle('GET', '/api/da-demo/computers', undefined, headers).status).toBe(401)
})
