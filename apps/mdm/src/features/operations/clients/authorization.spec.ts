import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createAuthorizationClient, rule } from './authorization'
const tenant = '11111111-1111-4111-8111-111111111111'
const group = '22222222-2222-4222-8222-222222222222'
const members = Array.from({ length: 201 }, (_, i) => ({
  instanceId: tenant,
  tenantId: tenant,
  principalId: `33333333-3333-4333-8333-${String(i + 1).padStart(12, '0')}`,
}))
it('loads every revision-bound member page before complete replacement and uses native wire', async () => {
  const request = vi.fn(async (o: RequestOptions<unknown>) => {
    if (o.method === 'PUT') return o.decode({ id: group, revision: 8, deleted: false })
    const offset = Number(o.query?.['offset'] ?? 0)
    return o.decode({
      id: group,
      revision: 7,
      items: members.slice(offset, offset + 100),
      nextOffset: offset + 100 < members.length ? offset + 100 : null,
    })
  })
  const client = createAuthorizationClient({ request } as unknown as HttpTransport, tenant)
  expect(await client.allMembers(group, 7)).toEqual(members)
  expect(request.mock.calls.map(([o]) => o.query)).toEqual([
    { offset: 0, expectedRevision: 7 },
    { offset: 100, expectedRevision: 7 },
    { offset: 200, expectedRevision: 7 },
  ])
  const body = {
    operationId: group,
    expectedRevision: 7,
    value: { name: 'Operators', enabled: true, members },
  }
  await client.changeGroup(group, body)
  expect(request.mock.lastCall![0]).toMatchObject({
    method: 'PUT',
    path: '/api/v1/authorization/user-groups/{id}',
    body,
  })
})
it('rejects mixed revisions, duplicate members and repeated pagination', async () => {
  let reply: unknown = { id: group, revision: 8, items: members.slice(0, 2), nextOffset: null }
  const client = createAuthorizationClient(
    { request: async (o: RequestOptions<unknown>) => o.decode(reply) } as HttpTransport,
    tenant,
  )
  await expect(client.allMembers(group, 7)).rejects.toThrow()
  reply = { id: group, revision: 7, items: [members[0], members[0]], nextOffset: null }
  await expect(client.allMembers(group, 7)).rejects.toThrow()
  reply = { id: group, revision: 7, items: [], nextOffset: 0 }
  await expect(client.allMembers(group, 7)).rejects.toThrow()
})
it('decodes current closed rules without legacy permissions or invented department write scopes', () => {
  const value = {
    subject: { kind: 'user_group', id: group },
    grants: [{ operation: 'inventory_read', scope: { kind: 'all_devices' } }],
  }
  expect(rule(value, tenant)).toEqual(value)
  expect(() =>
    rule(
      { ...value, grants: [{ operation: 'connector_write', scope: { kind: 'tenant' } }] },
      tenant,
    ),
  ).toThrow()
  expect(() =>
    rule(
      { ...value, grants: [{ operation: 'inventory_read', scope: { kind: 'tenant' } }] },
      tenant,
    ),
  ).toThrow()
  expect(() => rule({ ...value, legacyRole: 'administrator' }, tenant)).toThrow()
})

it('uses current native configuration permissions and service-owned device versus tenant scopes', () => {
  const subject = { kind: 'user_group', id: group }
  for (const operation of [
    'configuration_write',
    'windows_mi_execute',
    'device_control',
    'device_update',
    'account_write',
    'security_operate',
    'device_diagnostics',
  ])
    expect(
      rule({ subject, grants: [{ operation, scope: { kind: 'all_devices' } }] }, tenant).grants[0]!
        .operation,
    ).toBe(operation)
  for (const operation of [
    'runtime_diagnostics_read',
    'inventory_sensitive_read',
    'inventory_fields_write',
  ]) {
    expect(
      rule({ subject, grants: [{ operation, scope: { kind: 'tenant' } }] }, tenant).grants[0]!
        .operation,
    ).toBe(operation)
    expect(() =>
      rule({ subject, grants: [{ operation, scope: { kind: 'all_devices' } }] }, tenant),
    ).toThrow()
  }
  for (const operation of ['firewall_write', 'state_verify'])
    expect(() =>
      rule({ subject, grants: [{ operation, scope: { kind: 'all_devices' } }] }, tenant),
    ).toThrow()
})
