import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createPublicationClient, decodePublication, rings } from './publication'
const sha = Array<number>(32).fill(1),
  id = 'candidate'
const value = {
  id,
  revision: 1,
  contentDigest: sha,
  manifestDigest: sha,
  sourceSnapshot: sha,
  disposition: 'active',
  rings: rings.map((ring) => ({ ring, state: 'candidate', publication: null })),
}
it('reads draft and pending publication facts and rejects retired approval states and author documents', () => {
  expect(decodePublication(value, id)).toEqual(value)
  const pending = {
    ...value,
    rings: value.rings.map((r, i) =>
      i
        ? r
        : { ...r, state: 'publication', publication: { id: sha, attempt: 1, outcome: 'pending' } },
    ),
    document: { kind: 'Winget', manifest: { PackageIdentifier: 'Example.App' } },
  }
  expect(decodePublication(pending, id)).toMatchObject({
    document: pending.document,
    rings: [{ publication: { outcome: 'pending' } }, {}, {}],
  })
  for (const bad of [
    { ...value, submission: {} },
    { ...value, rings: [value.rings[0]] },
    { ...value, rings: value.rings.map((r) => ({ ...r, approval: null })) },
    { ...value, rings: value.rings.map((r) => ({ ...r, state: 'approved' })) },
  ])
    expect(() => decodePublication(bad, id)).toThrow()
})
it('accepts Publish only as 202 and preserves exact Recover/Retry attempt coordinates', async () => {
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(value)),
    client = createPublicationClient({ request } as unknown as HttpTransport)
  const base = { operationId: '11111111-1111-4111-8111-111111111111', expectedRevision: 1 }
  await client.change('source', id, { ...base, input: { action: 'publish', ring: 'test' } })
  expect(request.mock.calls[0]?.[0]).toMatchObject({
    successStatus: 202,
    body: { input: { action: 'publish', ring: 'test' } },
  })
  await client.change('source', id, {
    ...base,
    input: { action: 'recover', ring: 'test', publication: sha, attempt: 2 },
  })
  expect(request.mock.calls[1]?.[0]).toMatchObject({
    successStatus: 200,
    body: { input: { action: 'recover', ring: 'test', publication: sha, attempt: 2 } },
  })
  await client.change('source', id, {
    ...base,
    input: { action: 'retry', ring: 'test', attempt: 2 },
  })
  request.mockRejectedValueOnce(new Error('unknown result'))
  await expect(
    client.change('source', id, { ...base, input: { action: 'publish', ring: 'pilot' } }),
  ).rejects.toThrow('unknown result')
  expect(request).toHaveBeenCalledTimes(4)
})
