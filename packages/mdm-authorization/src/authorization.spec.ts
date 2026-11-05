import { expect, it, vi } from 'vitest'
import {
  createAuthorization,
  prepareChange,
  validateGrant,
  validateGroup,
  validateKey,
  validateRule,
  type AuthorizationPort,
  type Rule,
} from './index'
const tenant = '11111111-1111-4111-8111-111111111111',
  foreign = '22222222-2222-4222-8222-222222222222'
const id = '33333333-3333-4333-8333-333333333333',
  operationId = '44444444-4444-4444-8444-444444444444'
const user = { instanceId: id, tenantId: tenant, principalId: operationId }
const rule: Rule = {
  subject: { kind: 'user', user },
  grants: [{ operation: 'authorization_read', scope: { kind: 'tenant' } }],
}
it('rejects foreign realms, scope mismatches and foreign tenant subjects during authoring', () => {
  expect(() => validateRule(rule, tenant, 'management')).not.toThrow()
  expect(() =>
    validateGrant({ operation: 'tenant_create', scope: { kind: 'tenant' } }, 'tenant'),
  ).toThrow()
  expect(() =>
    validateGrant({ operation: 'inventory_read', scope: { kind: 'tenant' } }, 'tenant'),
  ).toThrow()
  expect(() =>
    validateRule({ ...rule, subject: { kind: 'user_group', id } }, tenant, 'management'),
  ).toThrow()
  expect(() => validateRule(rule, foreign, 'tenant')).toThrow()
  expect(() =>
    validateGroup(
      {
        name: 'operators',
        enabled: true,
        members: [user, { ...user, instanceId: foreign, principalId: foreign }],
      },
      tenant,
    ),
  ).toThrow()
  expect(() =>
    validateRule({ ...rule, grants: [...rule.grants, ...rule.grants] }, tenant, 'tenant'),
  ).toThrow()
})
it('keeps enterprise application write and identity administration out of API key delegation', () => {
  for (const operation of [
    'enterprise_applications_write',
    'identity_accounts_manage',
    'authorization_write',
  ] as const)
    expect(() =>
      validateKey({
        name: 'key',
        enabled: true,
        expiresAt: null,
        grants: [{ operation, scope: { kind: 'tenant' } }],
      }),
    ).toThrow()
  expect(() =>
    validateKey({
      name: 'key',
      enabled: true,
      expiresAt: null,
      grants: [{ operation: 'enterprise_applications_read', scope: { kind: 'tenant' } }],
    }),
  ).not.toThrow()
})
it('copies a complete CAS draft, rejects tombstone reuse and never retries an uncertain write', async () => {
  const draft = structuredClone(rule)
  const change = prepareChange(operationId, { id, revision: 7, value: rule }, draft)
  expect(change.value).not.toBe(draft)
  expect(() => prepareChange(operationId, { id, revision: 8, value: null }, rule)).toThrow(
    'tombstone',
  )
  const changeRule = vi.fn(async () => {
    throw new Error('Response lost after commit')
  })
  const client = createAuthorization(
    { changeRule } as unknown as AuthorizationPort,
    tenant,
    'tenant',
  )
  await expect(client.changeRule(id, change)).rejects.toThrow('Response lost')
  expect(changeRule).toHaveBeenCalledTimes(1)
  expect(changeRule).toHaveBeenCalledWith(id, change)
})
it('rejects a receipt for another object/revision and prevents secrets on metadata changes', async () => {
  const changeRule = vi.fn(async () => ({ id: foreign, revision: 2, deleted: false }))
  const changeKey = vi.fn(async () => ({
    receipt: { id, revision: 2, deleted: false },
    secret: 'unexpected-secret',
  }))
  const client = createAuthorization(
    { changeRule, changeKey } as unknown as AuthorizationPort,
    tenant,
    'tenant',
  )
  await expect(
    client.changeRule(id, { operationId, expectedRevision: 1, value: rule }),
  ).rejects.toThrow('receipt')
  await expect(
    client.changeKey(operationId, {
      kind: 'update',
      id,
      revision: 1,
      metadata: {
        name: 'key',
        enabled: true,
        expiresAt: null,
        grants: [{ operation: 'audit_read', scope: { kind: 'tenant' } }],
      },
    }),
  ).rejects.toThrow('receipt')
})
