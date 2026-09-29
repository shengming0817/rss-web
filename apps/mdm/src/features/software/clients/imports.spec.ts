import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createImportsClient } from './imports'
const tenant = '11111111-1111-4111-8111-111111111111'
it('rejects source, version and platform substitution and production mock data', async () => {
  const query = {
    source: 'winget',
    revision: '1',
    package: 'Example.Browser',
    version: '128.0',
    platform: 'windows' as const,
    architecture: 'x86_64' as const,
  }
  const resolution = {
    id: tenant,
    source: { id: 'winget', revision: '1', sha256: Array<number>(32).fill(1) },
    ecosystem: 'winget',
    package: query.package,
    version: query.version,
    platform: query.platform,
    architecture: query.architecture,
    definitionDigest: Array<number>(32).fill(2),
    expiresAt: 100,
  }
  let reply = { contract: 'software-v1', tenantId: tenant, source: 'mock', resolution }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply)),
    transport = { request } as unknown as HttpTransport
  const client = createImportsClient(transport, tenant, true)
  expect((await client.resolve(query)).package).toBe(query.package)
  reply = { ...reply, resolution: { ...resolution, version: '129.0' } }
  await expect(client.resolve(query)).rejects.toThrow('Wrong import resolution')
  reply = {
    ...reply,
    resolution: { ...resolution, source: { ...resolution.source, revision: '2' } },
  }
  await expect(client.resolve(query)).rejects.toThrow('Wrong import resolution')
  reply = { ...reply, resolution }
  await expect(createImportsClient(transport, tenant, false).resolve(query)).rejects.toThrow(
    'Unexpected simulated data',
  )
})
