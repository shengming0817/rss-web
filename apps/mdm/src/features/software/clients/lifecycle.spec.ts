import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createLifecycleClient, lifecycle, sourceDefinition, sourceRead } from './lifecycle'
const id = '11111111-1111-4111-8111-111111111111'
const sha = Array<number>(32).fill(1)
const enabled = {
  revision: 1,
  state: 'enabled',
  operation: id,
  actor: 'operator',
  at: 1,
  digest: sha,
}
it('accepts the current finite source protocols and refuses ambiguous or credential-bearing definitions', () => {
  for (const protocol of [
    { kind: 'private' },
    { kind: 'winget_rest', location: 'https://packages.test/', identifier: 'enterprise' },
    {
      kind: 'winget_community',
      repository: 'https://github.com/microsoft/winget-pkgs',
      commit: 'a'.repeat(40),
    },
    {
      kind: 'brew_tap',
      repository: 'https://github.com/example/tap',
      tap: 'example/tap',
      commit: 'b'.repeat(40),
    },
  ])
    expect(sourceDefinition({ id: 'source', revision: '1', protocol })).toEqual({
      id: 'source',
      revision: '1',
      protocol,
    })
  for (const protocol of [
    { kind: 'private', location: null },
    { kind: 'winget_rest', location: 'https://secret@packages.test/', identifier: 'source' },
    { kind: 'winget_community', repository: 'https://github.com/example/repo', commit: 'main' },
    {
      kind: 'brew_tap',
      repository: 'https://github.com/example/tap',
      tap: '../tap',
      commit: 'a'.repeat(40),
    },
  ])
    expect(() => sourceDefinition({ id: 'source', revision: '1', protocol })).toThrow()
  expect(() =>
    sourceDefinition({
      id: 'source',
      revision: '1',
      kind: 'private',
      location: null,
      publishers: [],
    }),
  ).toThrow()
  expect(() => lifecycle({ ...enabled, evidence: [] })).toThrow()
  expect(() => lifecycle({ ...enabled, state: 'approved' })).toThrow()
})
it('keeps a draft lifecycle absent and binds mutations to their exact operation receipt', async () => {
  let reply: unknown = {
    resource: 'app',
    version: '1',
    resourceDigest: sha,
    resourceRevision: 7,
    presentation: { name: 'App', vendorExtension: { color: 'blue' } },
    lifecycle: null,
  }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply)),
    client = createLifecycleClient({ request } as unknown as HttpTransport)
  const version = await client.version('app', '1')
  expect(version.lifecycle).toBeNull()
  expect(version.presentation['vendorExtension']).toEqual({ color: 'blue' })
  expect(version.resourceRevision).toBe(7)
  const body = { operationId: id, expectedRevision: 0, input: { action: 'enable' as const } }
  reply = { resource: 'app', version: '1', lifecycle: enabled }
  expect((await client.changeVersion('app', '1', body)).lifecycle.state).toBe('enabled')
  expect(request.mock.calls[1]?.[0]).toMatchObject({
    path: '/api/v1/software/resources/{id}/versions/{version}',
    body,
  })
  reply = {
    resource: 'app',
    version: '1',
    lifecycle: { ...enabled, operation: crypto.randomUUID() },
  }
  await expect(client.changeVersion('app', '1', body)).rejects.toThrow()
  const source = {
    source: { id: 'private', revision: '1', protocol: { kind: 'private' } },
    snapshot: { id: 'private', revision: '1', sha256: sha },
    lifecycle: enabled,
  }
  expect(sourceRead(source, 'private', '1').lifecycle.operation).toBe(id)
  expect(() => sourceRead(source, 'other', '1')).toThrow()
  reply = source
  await client.changeSource('private', '1', {
    operationId: id,
    expectedRevision: 0,
    input: { action: 'register', definition: sourceDefinition(source.source) },
  })
  request.mockRejectedValueOnce(new Error('lost response'))
  await expect(
    client.changeSource('private', '1', {
      operationId: id,
      expectedRevision: 1,
      input: { action: 'disable' },
    }),
  ).rejects.toThrow('lost response')
  expect(request).toHaveBeenCalledTimes(5)
})

it('rejects the retired version DTO without current presentation and Resource revision', async () => {
  const request = vi.fn(async (o: RequestOptions<unknown>) =>
    o.decode({ resource: 'app', version: '1', resourceDigest: sha, lifecycle: null }),
  )
  await expect(
    createLifecycleClient({ request } as unknown as HttpTransport).version('app', '1'),
  ).rejects.toThrow()
})

it('keeps source directory projections distinct from the complete revision used by import', async () => {
  const source = { id: 'private', revision: '1', protocol: { kind: 'private' } }
  const snapshot = { id: 'private', revision: '1', sha256: sha }
  const row = {
    id: 'private',
    revision: '1',
    protocol: 'private',
    state: 'enabled',
    source,
    snapshot,
    lifecycle: enabled,
  }
  let reply: unknown = { items: [row], nextCursor: 'YQ' }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply))
  const client = createLifecycleClient({ request } as unknown as HttpTransport)
  expect((await client.sources({ limit: 1, sort: ['-revision'] })).items).toEqual([row])
  reply = { items: [{ id: 'private', revision: '1', state: 'enabled' }], nextCursor: null }
  expect(
    (await client.sources({ fields: ['id', 'revision', 'state'], cursor: 'YQ' })).items,
  ).toEqual([{ id: 'private', revision: '1', state: 'enabled' }])
  reply = { source, snapshot, lifecycle: enabled }
  expect(await client.source('private', '1')).toEqual(reply)
  expect(request.mock.lastCall![0].pathParams).toEqual({ id: 'private', revision: '1' })
  reply = { items: [{ ...row, snapshot: { ...snapshot, revision: '2' } }], nextCursor: null }
  await expect(client.sources()).rejects.toThrow()
})
