import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createPublicationClient, decodePublication } from './publication'
const sha = Array<number>(32).fill(1),
  id = '11111111-1111-4111-8111-111111111111'
const value = {
  id,
  revision: 0,
  target: 'internal',
  resource: 'app',
  version: '1',
  publication: sha,
  contentDigest: sha,
  manifestDigest: sha,
  targetDigest: sha,
  attempt: 1,
  outcome: 'pending',
  withdrawn: false,
  withdrawal: null,
}
it('decodes exact publication identity, independent target digest and withdrawal facts', () => {
  expect(decodePublication(value, id)).toEqual(value)
  expect(
    decodePublication(
      {
        ...value,
        withdrawn: true,
        withdrawal: 'waiting_publication',
        document: {
          kind: 'Winget',
          manifest: {
            PackageIdentifier: 'Example.App',
            Versions: [
              {
                PackageVersion: '1',
                DefaultLocale: {
                  PackageLocale: 'en-US',
                  Publisher: 'Example',
                  PackageName: 'Example App',
                  License: 'Proprietary',
                  ShortDescription: 'Fixture',
                },
                Installers: [],
              },
            ],
          },
        },
      },
      id,
    ),
  ).toMatchObject({ withdrawal: 'waiting_publication' })
  for (const bad of [
    { ...value, id: 'other' },
    { ...value, targetDigest: [1] },
    { ...value, attempt: 0 },
    { ...value, outcome: 'unexpected' },
  ])
    expect(() => decodePublication(bad, id)).toThrow()
})
it('uses bounded directories and keeps writes explicit with server-owned attempt coordinates', async () => {
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(value)),
    client = createPublicationClient({ request } as unknown as HttpTransport)
  const body = {
    operationId: id,
    expectedRevision: 0,
    input: {
      action: 'publish' as const,
      resource: 'app',
      version: '1',
      expectedResourceRevision: 2,
      resourceDigest: sha,
      target: 'internal',
      targetDigest: sha,
    },
  }
  await client.publish(body)
  expect(request.mock.calls[0]?.[0]).toMatchObject({
    path: '/api/v1/software/publications',
    successStatus: 202,
    body,
  })
  await client.change(id, {
    operationId: crypto.randomUUID(),
    expectedRevision: 0,
    input: { action: 'recover' },
  })
  expect(request.mock.calls[1]?.[0]).toMatchObject({
    successStatus: 200,
    body: { input: { action: 'recover' } },
  })
  request.mockRejectedValueOnce(new Error('lost'))
  await expect(client.publish(body)).rejects.toThrow('lost')
  expect(request).toHaveBeenCalledTimes(3)
  request.mockImplementationOnce(async (o: RequestOptions<unknown>) =>
    o.decode({ items: [value], nextCursor: null }),
  )
  await client.list({ filter: "operationId=='" + id + "'" })
  expect(request.mock.calls[3]?.[0]).toMatchObject({
    query: { filter: "operationId=='" + id + "'", limit: 20 },
  })
})
