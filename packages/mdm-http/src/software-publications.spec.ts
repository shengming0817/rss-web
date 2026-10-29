import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createPublications } from '@rss/mdm-software/publications'
import { createPublicationsAdapter } from './software-publications'

const id = '11111111-1111-4111-8111-111111111111',
  operation = '22222222-2222-4222-8222-222222222222',
  hash = () => Array<number>(32).fill(7)
function publication() {
  return {
    id,
    revision: 2,
    target: 'host-brew',
    resource: 'company/app',
    version: 'resource-v2',
    publication: hash(),
    contentDigest: hash(),
    manifestDigest: hash(),
    targetDigest: hash(),
    attempt: 1,
    outcome: 'published',
    withdrawn: false,
    withdrawal: null,
  }
}
function brew() {
  const artifact = {
    key: 'content/setup.pkg',
    length: 3,
    sha256: hash(),
    url: 'https://host.example/content/setup.pkg',
  }
  return {
    kind: 'Brew',
    recipe: {
      description: 'Fixture',
      homepage: 'https://example.com',
      name: 'App',
      package: 'company-app',
      version: '1.2',
      payload: {
        kind: 'Cask',
        artifacts: [{ architecture: 'arm64', artifact }],
        install: { kind: 'Pkg', path: 'App.pkg', receipts: ['com.example.app'] },
      },
    },
  }
}
function fixture(read: (options: RequestOptions<unknown>) => unknown | Promise<unknown>) {
  const request = vi.fn(async (options: RequestOptions<unknown>) =>
      options.decode(await read(options)),
    ),
    adapter = createPublicationsAdapter({ request } as unknown as HttpTransport)
  return { request, adapter, publications: createPublications(adapter) }
}
it('finds a host-configured target by its exact ID and digest without fabricating a target-write endpoint', async () => {
  const target = { id: 'host-brew', protocol: 'brew', digest: hash() },
    f = fixture(() => ({ items: [target], nextCursor: null }))
  expect(await f.publications.target('host-brew')).toEqual(target)
  expect(f.request.mock.calls[0]?.[0]).toMatchObject({
    method: 'GET',
    path: '/api/v1/software/publication-targets',
    query: { filter: "id=='host-brew'", fields: 'id,digest,protocol', limit: 2 },
  })
  const absent = fixture(() => ({ items: [], nextCursor: null }))
  expect(await absent.publications.target('absent')).toBeNull()
  const wrong = fixture(() => ({ items: [target], nextCursor: null }))
  await expect(wrong.publications.target('other')).rejects.toThrow('Wrong exact publication target')
})
it('retains full current Brew recipe and Winget manifest data while decoding their protocol discriminator', async () => {
  const document = brew(),
    f = fixture(() => ({ ...publication(), document, withdrawn: true, withdrawal: 'unknown' }))
  expect(await f.publications.read(id)).toMatchObject({
    document: { ...document, kind: 'brew' },
    withdrawn: true,
    withdrawal: 'unknown',
  })
  const manifest = {
      PackageIdentifier: 'Company.App',
      Versions: [
        {
          PackageVersion: '1.2',
          DefaultLocale: {
            PackageLocale: 'en-US',
            Publisher: 'Company',
            PackageName: 'App',
            License: 'Proprietary',
            ShortDescription: 'Fixture',
          },
          Installers: [],
        },
      ],
    },
    winget = fixture(() => ({ ...publication(), document: { kind: 'Winget', manifest } }))
  expect((await winget.publications.read(id)).document).toEqual({ kind: 'winget', manifest })
})
it('queries an original mutation UUID through the formal filter while keeping the publication record ID distinct', async () => {
  const f = fixture(() => ({
    items: [{ ...publication(), withdrawn: true, withdrawal: 'waiting_publication' }],
    nextCursor: 'b3BhcXVl',
  }))
  expect(
    (await f.publications.original(operation, { cursor: 'cHJldmlvdXM', limit: 1 })).items[0]?.id,
  ).toBe(id)
  expect(f.request.mock.calls[0]?.[0]).toMatchObject({
    method: 'GET',
    path: '/api/v1/software/publications',
    query: { filter: "operationId=='" + operation + "'", cursor: 'cHJldmlvdXM', limit: 1 },
  })
  expect(f.request).toHaveBeenCalledTimes(1)
})
it('publishes an exact Resource revision and target snapshot with 202, preserving unknown results without retry', async () => {
  const change = {
      operationId: id,
      expectedRevision: 0,
      input: {
        action: 'publish' as const,
        resource: 'company/app',
        version: 'resource-v2',
        expectedResourceRevision: 19,
        resourceDigest: hash(),
        target: 'host-brew',
        targetDigest: hash(),
      },
    },
    f = fixture(() => ({ ...publication(), outcome: 'pending' }))
  await f.publications.publish(change)
  expect(f.request.mock.calls[0]?.[0]).toMatchObject({
    method: 'POST',
    path: '/api/v1/software/publications',
    successStatus: 202,
    body: change,
  })
  const unknown = fixture(() => {
    throw { status: 503, code: 'operation_unknown' }
  })
  await expect(unknown.publications.publish(change)).rejects.toMatchObject({
    code: 'operation_unknown',
  })
  expect(unknown.request).toHaveBeenCalledTimes(1)
})
it('keeps recover/retry/withdraw explicit and rejects undeclared native documents or states', async () => {
  for (const action of ['recover', 'retry', 'withdraw'] as const) {
    const f = fixture(() => publication()),
      change = { operationId: operation, expectedRevision: 2, input: { action } }
    await f.publications.change(id, change)
    expect(f.request.mock.calls[0]?.[0]).toMatchObject({
      method: 'POST',
      path: '/api/v1/software/publications/{id}',
      pathParams: { id },
      body: change,
    })
    expect(f.request).toHaveBeenCalledTimes(1)
  }
  for (const value of [
    { ...publication(), outcome: 'successful' },
    { ...publication(), withdrawal: 'done' },
    { ...publication(), document: { kind: 'Brew', recipe: { raw: 'fallback' } } },
  ]) {
    const f = fixture(() => value)
    await expect(f.publications.read(id)).rejects.toThrow()
  }
})

it('normalizes a current optional null export document without fabricating a native recipe', async () => {
  const f = fixture(() => ({ ...publication(), document: null }))
  expect((await f.publications.read(id)).document).toBeUndefined()
})
