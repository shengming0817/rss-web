import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createCatalogClient } from './catalog'
const tenant = '11111111-1111-4111-8111-111111111111'
it('validates the software candidate boundary, preserves pagination/search, and rejects simulated production responses', async () => {
  let reply: unknown = {
    contract: 'software-v1',
    tenantId: tenant,
    source: 'mock',
    snapshot: tenant,
    items: [],
    nextCursor: 'opaque',
  }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply))
  const transport = { request } as unknown as HttpTransport
  const client = createCatalogClient(transport, tenant, true)
  expect(await client.list('Browser', 'previous')).toMatchObject({
    items: [],
    nextCursor: 'opaque',
  })
  expect(request.mock.calls[0]![0].query).toEqual({
    query: 'Browser',
    cursor: 'previous',
    limit: 20,
  })
  await expect(createCatalogClient(transport, tenant, false).list()).rejects.toThrow()
  reply = { ...(reply as object), contract: 'policies-v1' }
  await expect(client.list()).rejects.toThrow()
})
