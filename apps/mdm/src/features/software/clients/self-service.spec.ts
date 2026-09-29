import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createSelfServiceClient, selfServiceDefinition } from './self-service'
const tenant = '11111111-1111-4111-8111-111111111111'
it('pins self-service catalog admission and rejects unbounded authority fields', () => {
  const definition = {
    title: 'Browser',
    description: '',
    enabled: true,
    resource: {
      kind: 'software',
      id: 'browser',
      version: '1',
      variants: { windows_x86_64: 'main' },
    },
    scope: tenant,
    admissionOperation: tenant,
    schedule: {
      trigger: { kind: 'check_in', minimumSeconds: 60 },
      misfire: { kind: 'coalesce_one' },
      notBefore: 0,
      until: null,
      jitterSeconds: 0,
      window: null,
    },
    runLifetimeSeconds: 3600,
  }
  expect(selfServiceDefinition(definition)).toEqual(definition)
  expect(() => selfServiceDefinition({ ...definition, approved: true })).toThrow()
  expect(() => selfServiceDefinition({ ...definition, admissionOperation: '' })).toThrow()
})
it('keeps requests server-owned and rejects mock production data and cross-tenant queues', async () => {
  let reply: unknown = {
    contract: 'software-v1',
    tenantId: tenant,
    source: 'mock',
    snapshot: tenant,
    items: [],
    nextCursor: 'next',
  }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply))
  const transport = { request } as unknown as HttpTransport,
    client = createSelfServiceClient(transport, tenant, true)
  expect((await client.requests('pending', 'old')).nextCursor).toBe('next')
  expect(request.mock.calls[0]![0].query).toEqual({ phase: 'pending', cursor: 'old', limit: 20 })
  await expect(createSelfServiceClient(transport, tenant, false).requests()).rejects.toThrow()
  reply = { ...(reply as object), tenantId: '22222222-2222-4222-8222-222222222222' }
  await expect(client.requests()).rejects.toThrow()
})
