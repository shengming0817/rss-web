import { expect, it } from 'vitest'
import { createPublicationDemo, publicationTargets } from './publication'
import { createLifecycleDemo } from './lifecycle'
import { operation, request, softwareResource } from './fixtures'
import { decodePublication } from '../../src/features/software/clients/publication'
it('publishes one exact version to one target and recovers the original operation after revision advances', () => {
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
      new URLSearchParams({ operationId: recover.operationId }),
    ),
    'normal',
  )!
  expect(lookup.body).toMatchObject({ items: [{ id: pending.id }] })
  const closed = demo.handle(
    request(path, operation({ action: 'withdraw' }, decodePublication(recovered.body).revision)),
    'normal',
  )!
  expect(decodePublication(closed.body).withdrawn).toBe(true)
  expect(demo.binding(target.id, 'app', '1')).toBeNull()
})
