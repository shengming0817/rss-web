import { expect, it, vi } from 'vitest'
import { createScenario, TENANT } from '../scenario'
import { softwareResource, request, approver } from '../software/fixtures'
import { decodeUpload } from '../../src/features/policies/clients/uploads'
const query = new URLSearchParams({
  version: '1',
  variant: 'main',
  platform: 'windows',
  architecture: 'x86_64',
})
it('resumes from the acknowledged offset, requires complete, and isolates frozen upload ownership', () => {
  const { resources, bytes } = softwareResource(),
    upload = crypto.randomUUID(),
    path = `/api/v1/resources/app/uploads/${upload}`
  const begin = () =>
    resources.handle({ ...request(path, undefined, undefined, query), method: 'POST' }, 'normal')!
  const started = begin()
  expect(started.status).toBe(200)
  expect(decodeUpload(started.body, 'app', upload).offset).toBe(0)
  const append = (offset: number, body: ArrayBuffer) =>
    resources.handle(
      {
        ...request(path, body, undefined, new URLSearchParams({ offset: String(offset) })),
        method: 'PATCH',
      },
      'normal',
    )!
  expect(append(0, bytes.slice(0, 1)).body).toMatchObject({ offset: 1, complete: false })
  expect(begin().body).toMatchObject({ offset: 1 })
  expect(append(0, bytes.slice(0, 1))).toEqual({
    status: 409,
    body: { code: 'upload_offset_conflict', offset: 1 },
  })
  expect(resources.handle(request(path), 'normal')?.body).toMatchObject({ offset: 1 })
  expect(resources.handle(request(path.replace('/app/', '/foreign/')), 'normal')?.status).toBe(403)
  expect(resources.handle(request(path, undefined, approver), 'normal')?.status).toBe(404)
  expect(
    resources.handle({ ...request(`${path}/complete`), method: 'POST' }, 'normal')?.status,
  ).toBe(409)
  expect(append(1, bytes.slice(1)).body).toMatchObject({ offset: 3, complete: false })
  for (let replay = 0; replay < 2; replay++)
    expect(
      resources.handle({ ...request(`${path}/complete`), method: 'POST' }, 'normal')?.status,
    ).toBe(201)
  expect(
    resources.handle(request(`/api/v1/resources/app/content/operations/${upload}`), 'normal')?.body,
  ).toMatchObject({ operationId: upload, committed: true, resource: 'app', length: 3 })
  expect(append(3, bytes.slice(0, 1)).status).toBe(409)
})
it('retires a corrupt upload without publishing a receipt or allowing empty-payload completion', () => {
  const { resources } = softwareResource(),
    upload = crypto.randomUUID(),
    path = `/api/v1/resources/app/uploads/${upload}`
  resources.handle({ ...request(path, undefined, undefined, query), method: 'POST' }, 'normal')
  resources.handle(
    {
      ...request(
        path,
        new Uint8Array([9, 9, 9]).buffer,
        undefined,
        new URLSearchParams({ offset: '0' }),
      ),
      method: 'PATCH',
    },
    'normal',
  )
  expect(
    resources.handle({ ...request(`${path}/complete`), method: 'POST' }, 'normal')?.status,
  ).toBe(400)
  expect(
    resources.handle({ ...request(`${path}/complete`), method: 'POST' }, 'normal')?.status,
  ).toBe(409)
  expect(
    resources.handle({ ...request(path, undefined, undefined, query), method: 'POST' }, 'normal')
      ?.status,
  ).toBe(409)
  expect(
    resources.handle(request(`/api/v1/resources/app/content/operations/${upload}`), 'normal')
      ?.status,
  ).toBe(404)
})

it('requires HTTP session/CSRF and recovers a committed unknown chunk by reading its original offset', async () => {
  const { resources, bytes } = softwareResource(),
    upload = crypto.randomUUID(),
    path = `/api/v1/resources/app/uploads/${upload}`
  const server = createScenario([resources.handle])
  const beginPath = `${path}?${query.toString()}`
  expect((await server.handle('POST', beginPath)).status).toBe(401)
  const login = await server.handle('POST', `/api/v1/identity/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  const headers = {
    'x-csrf-token': (login.body as { csrfToken: string }).csrfToken,
    'x-identity-request': '1',
  }
  expect((await server.handle('POST', beginPath)).status).toBe(403)
  expect((await server.handle('POST', beginPath, undefined, headers)).status).toBe(200)
  server.set('unknown')
  expect((await server.handle('PATCH', `${path}?offset=0`, bytes, headers)).status).toBe(503)
  server.set('normal')
  expect((await server.handle('GET', path)).body).toMatchObject({ offset: 3, complete: false })
  expect((await server.handle('POST', `${path}/complete`, undefined, headers)).status).toBe(201)
  expect(
    (await server.handle('GET', `/api/v1/resources/app/content/operations/${upload}`)).body,
  ).toMatchObject({ committed: true, operationId: upload })
})

it('expires abandoned payloads on subsequent requests and retains committed receipts', () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(2000000000000)
  try {
    const { resources, bytes } = softwareResource()
    const incomplete = crypto.randomUUID(),
      completed = crypto.randomUUID()
    for (const id of [incomplete, completed]) {
      const path = `/api/v1/resources/app/uploads/${id}`
      expect(
        resources.handle(
          { ...request(path, undefined, undefined, query), method: 'POST' },
          'normal',
        )?.status,
      ).toBe(200)
      resources.handle(
        {
          ...request(path, bytes, undefined, new URLSearchParams({ offset: '0' })),
          method: 'PATCH',
        },
        'normal',
      )
      if (id === completed)
        expect(
          resources.handle({ ...request(`${path}/complete`), method: 'POST' }, 'normal')?.status,
        ).toBe(201)
    }
    clock.mockReturnValue(2000086400000)
    const receiptPath = `/api/v1/resources/app/content/operations/${completed}`
    expect(resources.handle(request(receiptPath), 'normal')?.body).toMatchObject({
      committed: true,
      operationId: completed,
    })
    const path = `/api/v1/resources/app/uploads/${incomplete}`
    expect(
      resources.handle({ ...request(path, undefined, undefined, query), method: 'POST' }, 'normal')
        ?.status,
    ).toBe(409)
    expect(
      resources.handle({ ...request(`${path}/complete`), method: 'POST' }, 'normal')?.status,
    ).toBe(409)
  } finally {
    clock.mockRestore()
  }
})
