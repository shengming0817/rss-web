import { createLifecycleDemo } from './lifecycle'
import { expect, it } from 'vitest'
import { decodeMdmError } from '@rss/api/mdm'
import { createPublicationDemo } from './publication'
import { createScenario, TENANT } from '../scenario'
import { createResourceDemo } from '../policies/resources'
const sourcePath = '/api/v1/software/sources/private/revisions/1'
it('requires the shared session and CSRF, reconciles a committed unknown write, and isolates linked software sources', async () => {
  const resources = createResourceDemo(() => false),
    admission = createLifecycleDemo(resources)
  const scenario = createScenario([admission.handle, resources.handle], () => {
    admission.reset()
    resources.reset()
  })
  const body = {
    operationId: crypto.randomUUID(),
    expectedRevision: 0,
    input: {
      action: 'register',
      definition: { id: 'private', revision: '1', protocol: { kind: 'private' } },
    },
  }
  expect((await scenario.handle('POST', sourcePath, body)).status).toBe(401)
  const login = await scenario.handle('POST', `/api/v1/identity/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  const headers = {
    'x-csrf-token': (login.body as { csrfToken: string }).csrfToken,
    'x-identity-request': '1',
  }
  expect((await scenario.handle('POST', sourcePath, body)).status).toBe(403)
  scenario.set('unknown')
  expect((await scenario.handle('POST', sourcePath, body, headers)).status).toBe(503)
  scenario.set('normal')
  expect((await scenario.handle('GET', sourcePath)).body).toMatchObject({
    lifecycle: { operation: body.operationId, revision: 1 },
  })
  expect((await scenario.handle('POST', sourcePath, body, headers)).status).toBe(200)
  expect(
    (await scenario.handle('POST', sourcePath, { ...body, expectedRevision: 1 }, headers)).status,
  ).toBe(409)
  const controls = '/api/v1/mdm-candidate/workspace/scenario'
  expect(
    (
      await scenario.handle(
        'POST',
        controls,
        { scenario: 'normal', module: 'software', source: 'real' },
        headers,
      )
    ).status,
  ).toBe(204)
  for (const path of [
    sourcePath,
    '/api/v1/software/publications/one',
    '/api/v1/policies',
    '/api/v1/operations',
    '/api/v1/resources/app',
    '/api/v1/mdm-candidate/software/catalog',
  ])
    expect((await scenario.handle('GET', path)).status).toBe(503)
  expect((await scenario.handle('GET', controls)).body).toMatchObject({
    sources: { software: 'real', policies: 'real' },
  })
  await scenario.handle(
    'POST',
    controls,
    { scenario: 'normal', module: 'policies', source: 'mock' },
    headers,
  )
  expect((await scenario.handle('GET', sourcePath)).status).toBe(200)
  scenario.set('denied')
  expect((await scenario.handle('GET', sourcePath)).status).toBe(403)
  scenario.reset()
  await scenario.handle('POST', `/api/v1/identity/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  expect((await scenario.handle('GET', sourcePath)).status).toBe(404)
})

it('keeps rejected publication writes definite through the shared HTTP error decoder', async () => {
  const resources = createResourceDemo(() => false),
    publication = createPublicationDemo(resources, createLifecycleDemo(resources), () => true)
  const scenario = createScenario([publication.handle])
  const login = await scenario.handle('POST', `/api/v1/identity/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  const reply = await scenario.handle(
    'POST',
    '/api/v1/software/publications/missing',
    { operationId: crypto.randomUUID(), expectedRevision: 0, input: { action: 'recover' } },
    { 'x-csrf-token': (login.body as { csrfToken: string }).csrfToken, 'x-identity-request': '1' },
  )
  expect(decodeMdmError(reply.status, reply.body)).toMatchObject({
    cause: 'wire',
    status: 404,
    code: 'software_publication_not_found',
  })
})

it('applies current software and native permissions before dispatching any formal handler', async () => {
  const { createAutomationDemo } = await import('../policies/state'),
    { createDeviceDemo } = await import('../devices/state')
  const devices = createDeviceDemo(),
    automation = createAutomationDemo(devices)
  const publication = automation.publication
  const scenario = createScenario([
    (request) => automation.authorization.guard(request),
    publication.handle,
    automation.handle,
    devices.handle,
  ])
  const login = await scenario.handle('POST', `/api/v1/identity/tenants/${TENANT}/login`, {
    login: 'reviewer',
    password: 'demo',
  })
  const headers = {
    'x-csrf-token': (login.body as { csrfToken: string }).csrfToken,
    'x-identity-request': '1',
  }
  const op = (input: unknown) => ({ operationId: crypto.randomUUID(), expectedRevision: 0, input })
  for (const [path, body] of [
    [
      sourcePath,
      op({
        action: 'register',
        definition: { id: 'private', revision: '1', protocol: { kind: 'private' } },
      }),
    ],
    ['/api/v1/software/imports', op({})],
    ['/api/v1/software/publications', op({ action: 'publish' })],
    [
      '/api/v1/devices/device-05/operations',
      { operationId: crypto.randomUUID(), deadline: 4102444800, action: { kind: 'restart' } },
    ],
  ] as const)
    expect((await scenario.handle('POST', path, body, headers)).status).toBe(403)
  expect((await scenario.handle('GET', '/api/v1/operations')).status).toBe(200)
})

it('applies current Policy read, write, resource and device authority without mutating rejected drafts', async () => {
  const { createAutomationDemo } = await import('../policies/state'),
    { createDeviceDemo } = await import('../devices/state'),
    { seedScriptPolicies } = await import('../policies/seed')
  const automation = createAutomationDemo(createDeviceDemo()),
    seed = seedScriptPolicies(automation),
    policy = `/api/v1/policies/${seed.ids[0]}`
  const scenario = createScenario([automation.handle])
  const login = async (name: string) => {
    const reply = await scenario.handle('POST', `/api/v1/identity/tenants/${TENANT}/login`, {
      login: name,
      password: 'demo',
    })
    return {
      'x-csrf-token': (reply.body as { csrfToken: string }).csrfToken,
      'x-identity-request': '1',
    }
  }
  await login('demo')
  const original = (await scenario.handle('GET', policy)).body as {
    revision: number
    definition: unknown
  }
  const reviewerHeaders = await login('reviewer'),
    op = (input: unknown, expectedRevision = original.revision) => ({
      operationId: crypto.randomUUID(),
      expectedRevision,
      input,
    })
  for (const path of [
    '/api/v1/policies',
    policy,
    `${policy}/assignments`,
    `${policy}/runs`,
    `${policy}/software/rollout`,
  ])
    expect((await scenario.handle('GET', path)).status).toBe(403)
  for (const input of [
    { action: 'disable' },
    { action: 'enable' },
    { action: 'put', definition: original.definition, enabled: true },
  ])
    expect((await scenario.handle('POST', policy, op(input), reviewerHeaders)).status).toBe(403)
  expect(
    (
      await scenario.handle(
        'POST',
        '/api/v1/policies/previews',
        { definition: original.definition },
        reviewerHeaders,
      )
    ).status,
  ).toBe(403)
  await login('demo')
  expect((await scenario.handle('GET', policy)).body).toEqual(original)
  let revision = 1
  const grant = async (names: readonly string[]) => {
    const adminHeaders = await login('demo')
    const reply = await scenario.handle(
      'PUT',
      '/api/v1/authorization/rules/77777777-7777-4777-8777-777777777777',
      {
        operationId: crypto.randomUUID(),
        expectedRevision: revision++,
        value: {
          subject: {
            kind: 'user',
            user: {
              tenantId: TENANT,
              instanceId: '44444444-4444-4444-8444-444444444444',
              principalId: '33333333-3333-4333-8333-333333333333',
            },
          },
          grants: names.map((operation) => ({
            operation,
            scope: {
              kind: ['inventory_read', 'operation_read', 'script_execute'].includes(operation)
                ? 'all_devices'
                : 'tenant',
            },
          })),
        },
      },
      adminHeaders,
    )
    expect(reply.status).toBe(200)
    return login('reviewer')
  }
  const base = ['policy_read', 'policy_write', 'scope_read', 'inventory_read', 'script_execute']
  let headers = await grant(base)
  expect((await scenario.handle('GET', policy)).status).toBe(200)
  expect((await scenario.handle('GET', `${policy}/runs`)).status).toBe(403)
  expect(
    (
      await scenario.handle(
        'POST',
        policy,
        op({ action: 'put', definition: original.definition, enabled: true }),
        headers,
      )
    ).status,
  ).toBe(403)
  expect(
    (
      await scenario.handle(
        'POST',
        '/api/v1/policies/previews',
        { definition: original.definition },
        headers,
      )
    ).status,
  ).toBe(403)
  expect((await scenario.handle('POST', policy, op({ action: 'disable' }), headers)).status).toBe(
    200,
  )
  headers = await grant([...base, 'resource_read', 'operation_read'])
  expect((await scenario.handle('GET', `${policy}/runs`)).status).toBe(200)
  expect(
    (
      await scenario.handle(
        'POST',
        policy,
        op({ action: 'put', definition: original.definition, enabled: true }, 2),
        headers,
      )
    ).status,
  ).toBe(200)
  expect((await scenario.handle('GET', policy)).body).toMatchObject({
    revision: 3,
    state: 'enabled',
    definition: original.definition,
  })
})
