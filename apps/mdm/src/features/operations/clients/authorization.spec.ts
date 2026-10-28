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
it('reads one complete group detail as the CAS baseline and pages members with an opaque cursor', async () => {
  const request = vi.fn(async (o: RequestOptions<unknown>) =>
    o.decode(
      o.path.endsWith('/members')
        ? { id: group, revision: 7, items: members.slice(0, 2), nextCursor: 'YQ' }
        : { id: group, revision: 7, value: { name: 'Operators', enabled: true, members } },
    ),
  )
  const client = createAuthorizationClient({ request } as unknown as HttpTransport, tenant)
  expect((await client.group(group)).value?.members).toEqual(members)
  expect(request.mock.lastCall![0]).toMatchObject({
    path: '/api/v1/authorization/user-groups/{id}',
    pathParams: { id: group },
  })
  expect((await client.members(group, { cursor: 'YQ', limit: 2 })).nextCursor).toBe('YQ')
  expect(request.mock.lastCall![0].query).toEqual({
    cursor: 'YQ',
    limit: 2,
  })
})
it('rejects mismatched group identities and duplicate members', async () => {
  let reply: unknown = { id: tenant, revision: 7, value: { name: 'Wrong', enabled: true, members } }
  const client = createAuthorizationClient(
    { request: async (o: RequestOptions<unknown>) => o.decode(reply) } as HttpTransport,
    tenant,
  )
  await expect(client.group(group)).rejects.toThrow()
  reply = { id: group, revision: 7, items: [members[0], members[0]], nextCursor: null }
  await expect(client.members(group)).rejects.toThrow()
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
  for (const operation of ['telemetry_delete', 'telemetry_maintain']) {
    expect(
      rule({ subject, grants: [{ operation, scope: { kind: 'all_devices' } }] }, tenant).grants[0]!
        .operation,
    ).toBe(operation)
    expect(() =>
      rule({ subject, grants: [{ operation, scope: { kind: 'tenant' } }] }, tenant),
    ).toThrow()
  }
  for (const operation of ['firewall_write', 'state_verify'])
    expect(() =>
      rule({ subject, grants: [{ operation, scope: { kind: 'all_devices' } }] }, tenant),
    ).toThrow()
})

it('admits only management user subjects and its eight tenant permissions on every boundary', async () => {
  const { ruleForRealm, platformPermissions } = await import('./authorization')
  const subject = {
    kind: 'user',
    user: { instanceId: tenant, tenantId: tenant, principalId: group },
  }
  const definition = {
    subject,
    grants: platformPermissions.map((operation) => ({ operation, scope: { kind: 'tenant' } })),
  }
  expect(ruleForRealm(definition, tenant, 'platform')).toEqual(definition)
  expect(() =>
    ruleForRealm({ ...definition, subject: { kind: 'user_group', id: group } }, tenant, 'platform'),
  ).toThrow()
  expect(() =>
    ruleForRealm(
      { ...definition, grants: [{ operation: 'inventory_read', scope: { kind: 'all_devices' } }] },
      tenant,
      'platform',
    ),
  ).toThrow()
  expect(() =>
    ruleForRealm(
      { ...definition, grants: [{ operation: 'tenant_read', scope: { kind: 'tenant' } }] },
      tenant,
      'tenant',
    ),
  ).toThrow()
  const request = vi.fn(async (o: RequestOptions<unknown>) =>
    o.decode({ id: group, revision: 1, deleted: false }),
  )
  const client = createAuthorizationClient(
    { request } as unknown as HttpTransport,
    tenant,
    'platform',
  )
  await client.changeRule(group, {
    operationId: group,
    expectedRevision: 0,
    value: definition as unknown as ReturnType<typeof rule>,
  })
  expect(request.mock.lastCall![0]).toMatchObject({
    path: '/api/v1/tenant-administration/authorization/rules/{id}',
    method: 'PUT',
    pathParams: { id: group },
  })
  expect(() => client.groups()).toThrow()
  expect(() => client.departments()).toThrow()
  expect(() =>
    client.changeGroup(group, { operationId: group, expectedRevision: 0, value: null }),
  ).toThrow()
  expect(request).toHaveBeenCalledTimes(1)
})
it('uses the directory query for rules, accepts short continuation pages and reads detail directly', async () => {
  const value = {
    subject: { kind: 'user_group', id: group },
    grants: [{ operation: 'authorization_read', scope: { kind: 'tenant' } }],
  }
  let reply: unknown = {
    items: [{ id: group, revision: 1, deleted: false, subjectKind: 'user_group', value }],
    nextCursor: 'YQ',
  }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply)),
    client = createAuthorizationClient({ request } as unknown as HttpTransport, tenant)
  expect((await client.rules({ cursor: 'YQ', limit: 1 })).nextCursor).toBe('YQ')
  expect(request.mock.lastCall![0].query).toEqual({
    limit: 1,
    cursor: 'YQ',
  })
  reply = { id: group, revision: 1, value }
  expect((await client.rule(group)).value).toEqual(value)
  expect(request.mock.lastCall![0].path).toBe('/api/v1/authorization/rules/{id}')
})

it('accepts current enterprise application grants without accepting device scopes', () => {
  for (const operation of ['enterprise_applications_read', 'enterprise_applications_write']) {
    const value = {
      subject: { kind: 'user_group', id: group },
      grants: [{ operation, scope: { kind: 'tenant' } }],
    }
    expect(rule(value, tenant)).toEqual(value)
    expect(() =>
      rule({ ...value, grants: [{ operation, scope: { kind: 'all_devices' } }] }, tenant),
    ).toThrow()
  }
})
