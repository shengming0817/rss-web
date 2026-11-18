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
  const f = fixture({
      items: [{ id: '17322c55-8461-54b1-9d68-c62afc8b6cc1', status: 'active' }],
      nextCursor: null,
    }),
    client = createDevicesAdapter(f.transport, tenant),
    signal = new AbortController().signal
  expect(
    (
      await client.endpoints(
        {
          fields: ['id', 'status'],
          filter: "status=='active'",
          sort: ['-id'],
          limit: 3,
        },
        signal,
      )
    ).items,
  ).toEqual([{ id: '17322c55-8461-54b1-9d68-c62afc8b6cc1', status: 'active' }])
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      path: '/api/v1/tenants/{tenant}/devices',
      signal,
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
      path: '/api/v1/tenants/{tenant}/device-associations',
      query: { fields: 'id,version', limit: 100 },
    }),
  )
  expect(
    (await client.candidates('17322c55-8461-54b1-9d68-c62afc8b6cc1', 'mdm', { limit: 2 }))
      .nextCursor,
  ).toBe('eA')
  expect(f.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      pathParams: { tenant, device: '17322c55-8461-54b1-9d68-c62afc8b6cc1' },
      query: { channel: 'mdm', limit: 2 },
    }),
  )
})
it('uses projected typed view identities and rejects duplicate references', async () => {
  const endpoint = { reference: { kind: 'endpoint', id: operationId } },
    association = { reference: { kind: 'association', id: operationId } },
    page = { items: [endpoint, association], nextCursor: null },
    f = fixture(page),
    client = createDevicesAdapter(f.transport, tenant),
    query = { fields: ['reference'], sort: ['reference.kind', 'reference.id'] } as const
  expect(await client.views(query)).toEqual(page)
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      path: '/api/v1/tenants/{tenant}/device-views',
      query: { fields: 'reference', sort: 'reference.kind,reference.id', limit: 100 },
    }),
  )
  page.items = [endpoint, { reference: { id: operationId, kind: 'endpoint' } }]
  await expect(client.views(query)).rejects.toThrow('Duplicate device identity')
})
it('decodes current nonempty association candidates by device and channel', async () => {
  const f = fixture({
      items: [{ device: '621f76f9-bea3-58dd-9ee4-fcffe7f1f3f5', channel: 'agent' }],
      nextCursor: 'eA',
    }),
    client = createDevicesAdapter(f.transport, tenant)
  expect(await client.candidates('545f3b9d-a6dd-57e5-8759-034b78eec56d', 'mdm', {})).toEqual({
    items: [{ device: '621f76f9-bea3-58dd-9ee4-fcffe7f1f3f5', channel: 'agent' }],
    nextCursor: 'eA',
  })
})
it('keeps personnel idempotency in the header and rejects foreign-tenant read results', async () => {
  const f = fixture({ revision: 4, user: null }),
    client = createDevicesAdapter(f.transport, tenant)
  await client.assign('17322c55-8461-54b1-9d68-c62afc8b6cc1', {
    operationId,
    expectedRevision: 3,
    user: null,
  })
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      path: '/api/v1/tenants/{tenant}/devices/{device}/registration-user',
      pathParams: { tenant, device: '17322c55-8461-54b1-9d68-c62afc8b6cc1' },
      headers: expect.objectContaining({ 'Idempotency-Key': operationId }),
      body: { expectedRevision: 3, user: null },
    }),
  )
  const other = fixture({
    revision: 4,
    user: { tenantId: operationId, instanceId: tenant, principalId: operationId },
  })
  await expect(
    createDevicesAdapter(other.transport, tenant).registrationUser(
      '17322c55-8461-54b1-9d68-c62afc8b6cc1',
    ),
  ).rejects.toThrow('Wrong personnel tenant')
})
it('binds view detail to its route identity before rendering any endpoint facts', async () => {
  const f = fixture({
    reference: { kind: 'endpoint', id: '5f3fffc1-bd48-5095-890d-011848ab3dd9' },
    association: null,
    endpoints: [],
    fields: {},
    lists: {},
    inventorySources: [],
  })
  await expect(
    createDevicesAdapter(f.transport, tenant).view({
      kind: 'endpoint',
      id: '80e11781-b9aa-540d-b50e-753a8fa5b734',
    }),
  ).rejects.toThrow()
})
