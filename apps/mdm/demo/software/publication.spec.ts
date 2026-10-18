import { expect, it } from 'vitest'
import { createPublicationDemo } from './publication'
import { createLifecycleDemo } from './lifecycle'
import { operation, request, softwareResource } from './fixtures'
import { decodePublication } from '../../src/features/software/clients/publication'
it('saves without distribution, publishes directly as pending, and recovers only the exact attempt', () => {
  const { resources } = softwareResource('Example.App', true),
    lifecycle = createLifecycleDemo(resources),
    demo = createPublicationDemo(resources, lifecycle),
    path = '/api/v1/software-sources/demo-winget/candidates/app'
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
    version = r.versions[0]!
  const draft = demo.handle(
    request(
      path,
      operation(
        {
          action: 'candidate',
          resource: 'app',
          version: '1',
          expectedResourceRevision: r.revision,
          resourceDigest: version.digest,
        },
        0,
      ),
    ),
    'normal',
  )!
  expect(draft.status).toBe(200)
  expect(lifecycle.isEnabled('app', '1')).toBe(false)
  expect(decodePublication(draft.body, 'app').rings.every((r) => r.state === 'candidate')).toBe(
    true,
  )
  const publish = demo.handle(
    request(path, operation({ action: 'publish', ring: 'test' }, 0)),
    'normal',
  )!
  expect(publish.status).toBe(202)
  const pending = decodePublication(publish.body, 'app')
  expect(pending.rings[0]?.publication?.outcome).toBe('pending')
  expect(lifecycle.isEnabled('app', '1')).toBe(true)
  const exact = pending.rings[0]!.publication!
  expect(
    demo.handle(request(path, operation({ action: 'publish', ring: 'pilot' }, 1)), 'normal')
      ?.status,
  ).toBe(409)
  expect(
    demo.handle(
      request(
        path,
        operation({ action: 'recover', ring: 'test', publication: exact.id, attempt: 999 }, 1),
      ),
      'normal',
    )?.status,
  ).toBe(409)
  const failed = demo.handle(
    request(
      path,
      operation(
        { action: 'recover', ring: 'test', publication: exact.id, attempt: exact.attempt },
        1,
      ),
    ),
    'partial',
  )!
  expect(decodePublication(failed.body, 'app').rings[0]!.publication!.outcome).toBe('not_applied')
  const retried = demo.handle(
    request(path, operation({ action: 'retry', ring: 'test', attempt: 1 }, 2)),
    'normal',
  )!
  expect(decodePublication(retried.body, 'app').rings[0]!.publication!.attempt).toBe(2)
  expect(
    demo.handle(
      request(path, operation({ action: 'approve', ring: 'test', publisherSubject: 'old' }, 3)),
      'normal',
    )?.status,
  ).toBe(400)
})
