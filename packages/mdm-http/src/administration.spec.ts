import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createAuthorizationAdapter } from './authorization'
import { createTenantAdministrationAdapter } from './tenant-administration'
import { createProfilesAdapter } from './user-profiles'
const tenant = '11111111-1111-4111-8111-111111111111',
  principal = '22222222-2222-4222-8222-222222222222',
  id = '33333333-3333-4333-8333-333333333333'
function fixture(value: unknown) {
  const request = vi.fn(async (options: RequestOptions<unknown>) => options.decode(value))
  return { transport: { request } as unknown as HttpTransport, request }
}
it('keeps management authorization on its formal realm endpoint and rejects a foreign effective actor', async () => {
  const f = fixture({ instanceId: id, tenantId: tenant, principalId: principal, grants: [] })
  const client = createAuthorizationAdapter(f.transport, tenant, 'management', principal)
  expect((await client.effective()).principalId).toBe(principal)
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({ path: '/api/v1/tenant-administration/authorization' }),
  )
  const foreign = createAuthorizationAdapter(f.transport, tenant, 'tenant', id)
  await expect(foreign.effective()).rejects.toThrow('Wrong effective')
  expect(() => client.groups()).toThrow('Business tenant')
})
it('serializes filter/sort/projection/window on the server and never fills absent list fields', async () => {
  const f = fixture({ items: [{ id, revision: 9 }], nextCursor: null })
  const client = createAuthorizationAdapter(f.transport, tenant, 'tenant', principal)
  const result = await client.rules({
    filter: 'deleted==false',
    sort: ['-revision'],
    fields: ['id', 'revision'],
    limit: 2,
  })
  expect(result.items).toEqual([{ id, revision: 9 }])
  expect(result.items[0]).not.toHaveProperty('value')
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      query: { filter: 'deleted==false', sort: '-revision', fields: 'id,revision', limit: 2 },
    }),
  )
})
it('binds tenant update idempotency to the resource locator, original operation, action and revision', async () => {
  const result = {
    tenantId: tenant,
    management: false,
    initialEpoch: 1,
    currentEpoch: 1,
    name: 'New',
    notes: null,
    revision: 5,
    deletable: true,
  }
  const f = fixture({ operationId: id, action: 'update', result }),
    client = createTenantAdministrationAdapter(f.transport)
  await client.update({
    operationId: id,
    tenantId: tenant,
    expectedRevision: 4,
    name: 'New',
    notes: null,
  })
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      pathParams: { tenant },
      headers: expect.objectContaining({ 'Idempotency-Key': id }),
      body: { expectedRevision: 4, name: 'New', notes: null },
    }),
  )
  const wrong = fixture({ operationId: principal, action: 'update', result })
  await expect(
    createTenantAdministrationAdapter(wrong.transport).update({
      operationId: id,
      tenantId: tenant,
      expectedRevision: 4,
      name: 'New',
      notes: null,
    }),
  ).rejects.toThrow('receipt')
})
it('rejects a wrong field detail and wrong principal/view profile instead of leaking a previous selection', async () => {
  const detail = fixture({ fieldId: id, revision: 2, collectedAfterMicros: 0, value: null })
  await expect(createProfilesAdapter(detail.transport).definition(principal)).rejects.toThrow(
    'Wrong field',
  )
  const profile = fixture({
    principalId: principal,
    view: 'current',
    profiles: [],
    fields: [],
    completeness: { complete: 0, required: 0, missing: 0 },
  })
  await expect(createProfilesAdapter(profile.transport).other(principal, false)).rejects.toThrow(
    'Wrong profile',
  )
})
it('never recovers a key secret from a replay with null secret, and rejects unsolicited secret disclosure', async () => {
  const replay = fixture({ receipt: { id, revision: 1, deleted: false }, secret: null })
  const metadata = {
    name: 'key',
    enabled: true,
    expiresAt: null,
    grants: [{ operation: 'audit_read' as const, scope: { kind: 'tenant' as const } }],
  }
  expect(
    (
      await createAuthorizationAdapter(replay.transport, tenant, 'tenant', principal).changeKey(
        principal,
        { kind: 'create', id, revision: 0, metadata },
      )
    ).secret,
  ).toBeNull()
  const invalid = fixture({ receipt: { id, revision: 2, deleted: false }, secret: 'unsolicited' })
  await expect(
    createAuthorizationAdapter(invalid.transport, tenant, 'tenant', principal).changeKey(
      principal,
      { kind: 'update', id, revision: 1, metadata },
    ),
  ).rejects.toThrow('receipt')
})
