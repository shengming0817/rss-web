import { expect, it } from 'vitest'
import { createPublicationDemo, publicationTargets } from './publication'
import { createLifecycleDemo } from './lifecycle'
import { operation, request, softwareResource } from './fixtures'
import {
  createPublicationClient,
  decodePublication,
} from '../../src/features/software/clients/publication'
import type { HttpTransport } from '@rss/api/mdm'
it('publishes one exact version, exposes strict directory projections and retains detailed export documents across recovery', async () => {
  const { resources } = softwareResource('Example.App', true),
    lifecycle = createLifecycleDemo(resources),
    demo = createPublicationDemo(resources, lifecycle, () => true)
  lifecycle.handle(
    request(
      '/api/v1/software/sources/private/revisions/1',
      operation(
        {
          action: 'register',
          definition: { id: 'private', revision: '1', protocol: { kind: 'private' } },
        },
        0,
      ),
    ),
    'normal',
  )
  const r = resources.read('app')!,
    v = r.versions[0]!,
    target = publicationTargets[0]!
  const body = operation(
    {
      action: 'publish',
      resource: r.id,
      version: v.id,
      expectedResourceRevision: r.revision,
      resourceDigest: v.digest,
      target: target.id,
      targetDigest: target.digest,
    },
    0,
  )
  const reply = demo.handle(request('/api/v1/software/publications', body), 'normal')!
  expect(reply.status).toBe(202)
  const pending = decodePublication(reply.body, body.operationId),
    path = `/api/v1/software/publications/${pending.id}`
  expect(pending).toMatchObject({ target: target.id, attempt: 1, outcome: 'pending' })
  expect(lifecycle.isEnabled('app', '1')).toBe(true)
  const recover = operation({ action: 'recover' }, pending.revision)
  expect(demo.handle(request(path, recover), 'unknown')!.status).toBe(503)
  const recovered = demo.handle(request(path, recover), 'normal')!
  expect(recovered.status).toBe(200)
  expect(decodePublication(recovered.body).outcome).toBe('published')
  expect(demo.binding(target.id, 'app', '1')).not.toBeNull()
  const lookup = demo.handle(
    request(
      '/api/v1/software/publications',
      undefined,
      undefined,
      new URLSearchParams({ filter: `operationId==${recover.operationId}` }),
    ),
    'normal',
  )!
  expect(lookup.body).toMatchObject({ items: [{ id: pending.id }] })
  const transport: HttpTransport = {
    request: async (options) => {
      const path = options.path.replace(/\{([^}]+)\}/g, (_, key: string) =>
        encodeURIComponent(String(options.pathParams?.[key])),
      )
      const query = new URLSearchParams()
      for (const [key, value] of Object.entries(options.query ?? {}))
        if (value !== undefined) query.set(key, String(value))
      const reply = demo.handle(request(path, undefined, undefined, query), 'normal')!
      expect(reply.status).toBe(options.successStatus)
      return options.decode(reply.body)
    },
  }
  const client = createPublicationClient(transport)
  const directory = await client.list({ filter: "outcome=='published';withdrawn=='false'" })
  expect(directory.items).toHaveLength(1)
  expect(directory.items[0]).toMatchObject({
    id: pending.id,
    resource: r.id,
    version: v.id,
    outcome: 'published',
  })
  expect(directory.items[0]).not.toHaveProperty('document')
  expect(await client.list({ fields: ['id', 'resource', 'version'] })).toEqual({
    items: [{ id: pending.id, resource: r.id, version: v.id }],
    nextCursor: null,
  })
  expect((await client.read(pending.id)).document).toEqual(
    decodePublication(recovered.body).document,
  )
  expect((await client.read(pending.id)).document).toBeDefined()
  const targets = await client.targets({ fields: ['id', 'protocol'] })
  expect(targets.items).toContainEqual({ id: target.id, protocol: target.protocol })
  expect(targets.items[0]).not.toHaveProperty('digest')
  for (const fields of ['document', 'operationId', 'id,document'])
    expect(
      demo.handle(
        request(
          '/api/v1/software/publications',
          undefined,
          undefined,
          new URLSearchParams({ fields }),
        ),
        'normal',
      )?.status,
    ).toBe(400)
  const closed = demo.handle(
    request(path, operation({ action: 'withdraw' }, decodePublication(recovered.body).revision)),
    'normal',
  )!
  expect(decodePublication(closed.body).withdrawn).toBe(true)
  expect(demo.binding(target.id, 'app', '1')).toBeNull()
  demo.reset()
  expect(await client.list()).toEqual({ items: [], nextCursor: null })
  expect(
    demo.handle(
      request(
        '/api/v1/software/publications',
        undefined,
        undefined,
        new URLSearchParams({ fields: 'document' }),
      ),
      'normal',
    )?.status,
  ).toBe(400)
})
