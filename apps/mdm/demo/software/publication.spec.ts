import { expect, it } from 'vitest'
import { decodePublication } from '../../src/features/software/clients/publication'
import { createPublicationDemo } from './publication'
import { approver, operation, publisher, request, softwareResource } from './fixtures'
const path = '/api/v1/software-sources/demo-winget/candidates/app-1'
it('keeps publication independent from enterprise admission, enforces promotion and actor separation, and retains publication evidence after withdrawal', () => {
  const { resources } = softwareResource(),
    demo = createPublicationDemo(resources)
  const write = (input: unknown, revision: number, actor = publisher) =>
    demo.handle(request(path, operation(input, revision), actor), 'normal')!
  const initial = write(
    {
      action: 'candidate',
      resource: 'app',
      version: '1',
      expectedResourceRevision: 2,
      submission: {
        kind: 'Winget',
        manifest: { PackageIdentifier: 'Example.App', PackageVersion: '1.0' },
      },
    },
    0,
  )
  expect(initial.status).toBe(200)
  let value = decodePublication(initial.body, 'app-1')
  expect(value.revision).toBe(0)
  expect(write({ action: 'validate', ring: 'pilot' }, 0).status).toBe(409)
  expect(
    write({ action: 'approve', ring: 'test', publisherSubject: publisher }, 0, approver).status,
  ).toBe(409)
  value = decodePublication(write({ action: 'validate', ring: 'test' }, 0).body, 'app-1')
  expect(value.rings[0]?.state).toBe('validated')
  expect(write({ action: 'approve', ring: 'test', publisherSubject: publisher }, 1).status).toBe(
    403,
  )
  value = decodePublication(
    write({ action: 'approve', ring: 'test', publisherSubject: publisher }, 1, approver).body,
    'app-1',
  )
  expect(write({ action: 'authorize', ring: 'test' }, 2, approver).status).toBe(403)
  value = decodePublication(write({ action: 'authorize', ring: 'test' }, 2).body, 'app-1')
  const publication = value.rings[0]!.publication!
  expect(publication.outcome).toBe('unknown')
  const publish = operation(
    { action: 'publish', ring: 'test', publication: publication.id, attempt: 1 },
    3,
  )
  const result = demo.handle(request(path, publish), 'normal')!
  expect(result.status).toBe(200)
  expect(demo.handle(request(path, publish), 'normal')).toEqual(result)
  expect(
    demo.handle(
      request(path, { ...publish, input: { action: 'withdraw', ring: 'test' } }),
      'normal',
    )?.status,
  ).toBe(409)
  value = decodePublication(result.body, 'app-1')
  expect(value.rings[0]?.publication?.outcome).toBe('published')
  expect(write({ action: 'validate', ring: 'pilot' }, value.revision).status).toBe(200)
  const current = decodePublication(demo.handle(request(path), 'normal')!.body, 'app-1')
  const withdrawn = decodePublication(
    write({ action: 'withdraw', ring: 'test' }, current.revision).body,
    'app-1',
  )
  expect(withdrawn.disposition).toBe('deprecated')
  expect(withdrawn.rings[0]?.publication?.outcome).toBe('published')
  expect(write({ action: 'authorize', ring: 'pilot' }, withdrawn.revision).status).toBe(409)
  expect(resources.read('app')?.versions[0]?.state).toBe('frozen')
  demo.reset()
  expect(demo.handle(request(path), 'normal')?.status).toBe(404)
})
it('reconciles an uncertain publication, fences exact attempts, and only retries a confirmed not-applied result', () => {
  const { resources } = softwareResource(),
    demo = createPublicationDemo(resources)
  const write = (
    input: unknown,
    revision: number,
    actor = publisher,
    scenario: 'normal' | 'partial' | 'unknown' = 'normal',
  ) => demo.handle(request(path, operation(input, revision), actor), scenario)!
  write(
    {
      action: 'candidate',
      resource: 'app',
      version: '1',
      expectedResourceRevision: 2,
      submission: {
        kind: 'Winget',
        manifest: { PackageIdentifier: 'Example.App', PackageVersion: '1.0' },
      },
    },
    0,
  )
  write({ action: 'validate', ring: 'test' }, 0)
  write({ action: 'approve', ring: 'test', publisherSubject: publisher }, 1, approver)
  let value = decodePublication(write({ action: 'authorize', ring: 'test' }, 2).body, 'app-1')
  const id = value.rings[0]!.publication!.id
  expect(write({ action: 'retry', ring: 'test', attempt: 1 }, 3).status).toBe(409)
  expect(write({ action: 'publish', ring: 'test', publication: id, attempt: 2 }, 3).status).toBe(
    409,
  )
  expect(
    write({ action: 'publish', ring: 'test', publication: id, attempt: 1 }, 3, publisher, 'unknown')
      .status,
  ).toBe(503)
  value = decodePublication(demo.handle(request(path), 'normal')!.body, 'app-1')
  expect(value.rings[0]?.publication?.outcome).toBe('unknown')
  value = decodePublication(
    write(
      { action: 'recover', ring: 'test', publication: id, attempt: 1 },
      value.revision,
      publisher,
      'partial',
    ).body,
    'app-1',
  )
  expect(value.rings[0]?.publication?.outcome).toBe('not_applied')
  value = decodePublication(
    write({ action: 'retry', ring: 'test', attempt: 1 }, value.revision).body,
    'app-1',
  )
  expect(value.rings[0]?.publication).toMatchObject({ attempt: 2, outcome: 'unknown' })
  expect(
    write({ action: 'recover', ring: 'test', publication: id, attempt: 1 }, value.revision).status,
  ).toBe(409)
})
