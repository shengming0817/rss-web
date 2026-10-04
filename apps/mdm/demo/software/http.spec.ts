import { expect, it } from 'vitest'
import { decodeMdmError } from '@rss/api/mdm'
import { createPublicationDemo } from './publication'
import { createScenario, TENANT } from '../scenario'
import { createResourceDemo } from '../policies/resources'
import { createAdmissionDemo } from './admission'
const sourcePath = '/api/v1/software/sources/private/revisions/1'
it('requires the shared session and CSRF, reconciles a committed unknown write, and isolates linked software sources', async () => {
  const resources = createResourceDemo(() => false),
    admission = createAdmissionDemo(resources)
  const scenario = createScenario([admission.handle, resources.handle], () => {
    admission.reset()
    resources.reset()
  })
  const body = {
    operationId: crypto.randomUUID(),
    expectedRevision: 0,
    input: {
      action: 'register',
      definition: { id: 'private', revision: '1', kind: 'private', location: null, publishers: [] },
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
    admission: { operation: body.operationId, revision: 1 },
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
    '/api/v1/software-sources/private/candidates/one',
    '/api/v1/policies',
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
    publication = createPublicationDemo(resources)
  const scenario = createScenario([publication.handle])
  const login = await scenario.handle('POST', `/api/v1/identity/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  const reply = await scenario.handle(
    'POST',
    '/api/v1/software-sources/missing/candidates/missing',
    { operationId: crypto.randomUUID(), expectedRevision: 0, input: { action: 'validate' } },
    { 'x-csrf-token': (login.body as { csrfToken: string }).csrfToken, 'x-identity-request': '1' },
  )
  expect(decodeMdmError(reply.status, reply.body)).toMatchObject({
    cause: 'wire',
    status: 404,
    code: 'software_source_not_found',
  })
})
