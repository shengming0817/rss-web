import { expect, it } from 'vitest'
import { createAdmissionDemo } from './admission'
import { createPublicationDemo } from './publication'
import { createCatalogDemo } from './catalog'
import { operation, request, softwareResource } from './fixtures'
const path = '/api/v1/mdm-candidate/software/catalog/app'
it('projects the one Resource owner, persists licensed catalog metadata with CAS, and keeps unsampled usage unknown', () => {
  const { resources } = softwareResource(),
    admission = createAdmissionDemo(resources),
    publication = createPublicationDemo(resources)
  const demo = createCatalogDemo(resources, admission, publication, () =>
    Array.from({ length: 24 }, (_, i) => `device-${i + 1}`),
  )
  const initial = demo.handle(request(path), 'normal')!
  expect(initial.body).toMatchObject({
    contract: 'software-v1',
    entry: {
      resource: { id: 'app', revision: 2 },
      metadata: { revision: 0 },
      usage: { sampledDevices: 0, totalDevices: 24, activeDevices: null, unknownDevices: 24 },
    },
  })
  const update = operation(
    {
      action: 'put',
      title: 'Example Editor',
      description: 'Engineering application',
      category: 'Engineering',
      license: { kind: 'commercial', seats: 40, expiresAt: null },
      supersedes: [],
    },
    0,
  )
  const result = demo.handle(request(path, update), 'normal')!
  expect(result.status).toBe(200)
  expect(demo.handle(request(path, update), 'normal')).toEqual(result)
  expect(demo.handle(request(path, operation(update.input, 0)), 'normal')?.status).toBe(409)
  expect(
    demo.handle(
      request(
        path,
        operation({ ...update.input, supersedes: [{ resource: 'app', version: '1' }] }, 1),
      ),
      'normal',
    )?.status,
  ).toBe(400)
  expect(resources.read('app')?.revision).toBe(2)
  const filtered = demo.handle(
    request(
      '/api/v1/mdm-candidate/software/catalog',
      undefined,
      undefined,
      new URLSearchParams({ query: 'editor' }),
    ),
    'normal',
  )!
  expect(filtered.body).toMatchObject({
    items: [{ metadata: { definition: { title: 'Example Editor' } } }],
  })
  expect(
    demo.handle(request('/api/v1/mdm-candidate/software/catalog'), 'empty')?.body,
  ).toMatchObject({ items: [] })
  expect(demo.handle(request(path), 'denied')?.status).toBe(403)
  demo.reset()
  expect(demo.handle(request(path), 'normal')?.body).toMatchObject({
    entry: { metadata: { revision: 0 } },
  })
})

it('derives usage only from explicit usage observations, retaining unknown denominators and expiring old samples', () => {
  const { resources } = softwareResource(),
    admission = createAdmissionDemo(resources),
    publication = createPublicationDemo(resources)
  const demo = createCatalogDemo(resources, admission, publication, () => ['one', 'two', 'three'])
  const at = 2000000000
  demo.tick({ kind: 'check_in', device: 'one', at })
  expect(demo.handle(request(path), 'normal')?.body).toMatchObject({
    entry: { usage: { sampledDevices: 0, activeDevices: null } },
  })
  demo.tick({ kind: 'software_usage', resource: 'app', device: 'one', active: true, at })
  demo.tick({ kind: 'software_usage', resource: 'app', device: 'two', active: false, at })
  demo.tick({ kind: 'software_usage', resource: 'app', device: 'unregistered', active: true, at })
  expect(demo.handle(request(path), 'normal')?.body).toMatchObject({
    entry: {
      usage: {
        asOf: at,
        sampledDevices: 2,
        totalDevices: 3,
        activeDevices: 1,
        unknownDevices: 1,
        source: 'agent_usage',
      },
    },
  })
  demo.tick({ kind: 'clock', at: at + 31 * 86400 })
  expect(demo.handle(request(path), 'normal')?.body).toMatchObject({
    entry: {
      usage: { sampledDevices: 0, activeDevices: null, unknownDevices: 3, source: 'unavailable' },
    },
  })
})
