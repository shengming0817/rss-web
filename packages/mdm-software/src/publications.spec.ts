import { expect, it, vi } from 'vitest'
import {
  createPublications,
  type Publication,
  type PublicationsPort,
  type PublishInput,
} from './publications'

const id = '11111111-1111-4111-8111-111111111111',
  originalChange = '22222222-2222-4222-8222-222222222222',
  hash = () => Array<number>(32).fill(3)
function publication(): Publication {
  return {
    id,
    revision: 1,
    target: 'host-target',
    resource: 'company/app',
    version: 'resource-v2',
    publication: hash(),
    contentDigest: hash(),
    manifestDigest: hash(),
    targetDigest: hash(),
    attempt: 1,
    outcome: 'pending',
    withdrawn: false,
    withdrawal: null,
  }
}
function input(): PublishInput {
  return {
    action: 'publish',
    resource: 'company/app',
    version: 'resource-v2',
    expectedResourceRevision: 19,
    resourceDigest: hash(),
    target: 'host-target',
    targetDigest: hash(),
  }
}
function port(methods: Partial<PublicationsPort>): PublicationsPort {
  return new Proxy(methods as PublicationsPort, {
    get(target, key) {
      if (!(key in target)) throw new Error(`Unexpected publication action: ${String(key)}`)
      return Reflect.get(target, key)
    },
  })
}
it('reads exact Winget and Brew target digests and represents an absent target without inventing configuration', async () => {
  const target = vi
      .fn<PublicationsPort['target']>()
      .mockResolvedValueOnce({ id: 'host-target', protocol: 'winget', digest: hash() })
      .mockResolvedValueOnce({ id: 'host-target', protocol: 'brew', digest: hash() })
      .mockResolvedValueOnce(null),
    publications = createPublications(port({ target }))
  expect((await publications.target('host-target'))?.protocol).toBe('winget')
  expect((await publications.target('host-target'))?.protocol).toBe('brew')
  expect(await publications.target('absent')).toBeNull()
  target.mockResolvedValueOnce({ id: 'different', protocol: 'brew', digest: hash() })
  await expect(publications.target('host-target')).rejects.toThrow('Wrong publication target')
})
it('separates publication absence revision, Resource revision and target digest without automatic replay', async () => {
  const publish = vi
      .fn<PublicationsPort['publish']>()
      .mockRejectedValueOnce({ status: 503, code: 'operation_unknown' })
      .mockResolvedValueOnce(publication()),
    publications = createPublications(port({ publish })),
    original = { operationId: id, expectedRevision: 0, input: input() }
  await expect(publications.publish(original)).rejects.toMatchObject({ code: 'operation_unknown' })
  expect(publish).toHaveBeenCalledTimes(1)
  expect(publish.mock.calls[0]?.[0]).toMatchObject({
    expectedRevision: 0,
    input: { expectedResourceRevision: 19, targetDigest: hash() },
  })
  await publications.publish(original)
  expect(publish.mock.calls[1]?.[0]).toEqual(publish.mock.calls[0]?.[0])
  await expect(publications.publish({ ...original, expectedRevision: 19 })).rejects.toThrow(
    'absence revision',
  )
})
it('rejects an acknowledged publication for another immutable version or target digest', async () => {
  const publish = vi
      .fn<PublicationsPort['publish']>()
      .mockResolvedValueOnce({ ...publication(), version: 'other' })
      .mockResolvedValueOnce({ ...publication(), targetDigest: [] }),
    publications = createPublications(port({ publish })),
    original = { operationId: id, expectedRevision: 0, input: input() }
  await expect(publications.publish(original)).rejects.toThrow('Wrong publication receipt')
  await expect(publications.publish(original)).rejects.toThrow('digest')
})
it('preserves pending, unknown, not-applied and withdrawal outcomes as independent facts', async () => {
  const read = vi.fn<PublicationsPort['read']>(),
    publications = createPublications(port({ read }))
  for (const outcome of ['pending', 'unknown', 'not_applied', 'published'] as const) {
    read.mockResolvedValueOnce({
      ...publication(),
      outcome,
      withdrawn: true,
      withdrawal: 'waiting_publication',
    })
    expect(await publications.read(id)).toMatchObject({
      outcome,
      withdrawn: true,
      withdrawal: 'waiting_publication',
      attempt: 1,
    })
  }
  read.mockResolvedValueOnce({
    ...publication(),
    outcome: 'published',
    withdrawn: true,
    withdrawal: 'unknown',
  })
  expect((await publications.read(id)).withdrawal).toBe('unknown')
})
it('queries the original mutation UUID separately from the publication record ID and never auto-recovers', async () => {
  const original = vi
      .fn<PublicationsPort['original']>()
      .mockResolvedValue({ items: [{ ...publication(), outcome: 'unknown' }], nextCursor: null }),
    change = vi
      .fn<PublicationsPort['change']>()
      .mockResolvedValue({ ...publication(), revision: 4, outcome: 'not_applied' }),
    publications = createPublications(port({ original, change }))
  await publications.original(originalChange)
  expect(original).toHaveBeenCalledWith(originalChange, {})
  expect(change).not.toHaveBeenCalled()
  await publications.change(id, {
    operationId: originalChange,
    expectedRevision: 3,
    input: { action: 'recover' },
  })
  expect(change).toHaveBeenCalledTimes(1)
  expect(change.mock.calls[0]?.[0]).toBe(id)
  expect(change.mock.calls[0]?.[1]).toMatchObject({
    operationId: originalChange,
    expectedRevision: 3,
    input: { action: 'recover' },
  })
})

it('binds an asynchronous publication response to its frozen input rather than a changed caller draft', async () => {
  let finish!: (value: Publication) => void
  const publish = vi.fn<PublicationsPort['publish']>(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    ),
    publications = createPublications(port({ publish })),
    draft = { ...input() },
    original = { operationId: id, expectedRevision: 0, input: draft },
    running = publications.publish(original)
  draft.version = 'changed-by-caller'
  finish(publication())
  await expect(running).resolves.toMatchObject({ version: 'resource-v2' })
  expect(publish.mock.calls[0]?.[0].input.version).toBe('resource-v2')
})

it('rejects unknown publication actions before crossing the port', async () => {
  const publications = createPublications(port({}))
  await expect(
    publications.publish({
      operationId: id,
      expectedRevision: 0,
      input: { ...input(), action: 'deploy' } as never,
    }),
  ).rejects.toThrow('publication action')
  await expect(
    publications.change(id, {
      operationId: originalChange,
      expectedRevision: 1,
      input: { action: 'restart' } as never,
    }),
  ).rejects.toThrow('publication action')
})
