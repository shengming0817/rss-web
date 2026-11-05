import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createDevicesAdapter } from './devices'
const tenant = '11111111-1111-4111-8111-111111111111',
  operationId = '22222222-2222-4222-8222-222222222222'
function fixture(value: unknown) {
  const request = vi.fn(async (options: RequestOptions<unknown>) => options.decode(value))
  return { transport: { request } as unknown as HttpTransport, request }
}
it('preserves a projected endpoint row and sends formal server query controls', async () => {
  const f = fixture({ items: [{ id: 'endpoint-a', status: 'active' }], nextCursor: null }),
    client = createDevicesAdapter(f.transport, tenant)
  expect(
    (
      await client.endpoints({
        fields: ['id', 'status'],
        filter: "status=='active'",
        sort: ['-id'],
        limit: 3,
      })
    ).items,
  ).toEqual([{ id: 'endpoint-a', status: 'active' }])
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      path: '/api/v1/devices',
      query: { fields: 'id,status', filter: "status=='active'", sort: '-id', limit: 3 },
    }),
  )
  expect(() => client.endpoints({ fields: ['status'] })).toThrow('identity required')
})
it('uses the relationship directory and keeps empty candidate windows continuable', async () => {
  const f = fixture({ items: [], nextCursor: 'eA' }),
    client = createDevicesAdapter(f.transport, tenant)
  expect((await client.associations({ fields: ['id', 'version'] })).nextCursor).toBe('eA')
  expect(f.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      path: '/api/v1/device-associations',
      query: { fields: 'id,version', limit: 20 },
    }),
  )
  expect((await client.candidates('endpoint-a', 'mdm', { limit: 2 })).nextCursor).toBe('eA')
  expect(f.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      pathParams: { device: 'endpoint-a' },
      query: { channel: 'mdm', limit: 2 },
    }),
  )
})
it('keeps personnel idempotency in the header and rejects foreign-tenant read results', async () => {
  const f = fixture({ revision: 4, user: null }),
    client = createDevicesAdapter(f.transport, tenant)
  await client.assign('endpoint-a', { operationId, expectedRevision: 3, user: null })
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      path: '/api/v1/devices/{device}/registration-user',
      pathParams: { device: 'endpoint-a' },
      headers: expect.objectContaining({ 'Idempotency-Key': operationId }),
      body: { expectedRevision: 3, user: null },
    }),
  )
  const other = fixture({
    revision: 4,
    user: { tenantId: operationId, instanceId: tenant, principalId: operationId },
  })
  await expect(
    createDevicesAdapter(other.transport, tenant).registrationUser('endpoint-a'),
  ).rejects.toThrow('Wrong personnel tenant')
})
it('binds view detail to its route identity before rendering any endpoint facts', async () => {
  const f = fixture({
    reference: { kind: 'endpoint', id: 'other-endpoint' },
    association: null,
    endpoints: [],
    fields: {},
    lists: {},
    inventorySources: [],
  })
  await expect(
    createDevicesAdapter(f.transport, tenant).view({ kind: 'endpoint', id: 'requested-endpoint' }),
  ).rejects.toThrow()
})
