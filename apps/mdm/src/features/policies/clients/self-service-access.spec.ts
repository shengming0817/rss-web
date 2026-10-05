import { expect, it } from 'vitest'
import { selfServiceAccess } from './self-service-access'
import { initialSelfService, selfService } from './model'
const id = '11111111-1111-4111-8111-111111111111'
const source = {
  providerId: id,
  issuer: 'https://idp.example.test/tenant',
  configurationVersion: 2,
}
it('preserves explicit device/user access and fixed selector coordinates without applying management grants', () => {
  expect(selfServiceAccess({ kind: 'device' })).toEqual({ kind: 'device' })
  expect(selfServiceAccess({ kind: 'authenticated_user' })).toEqual({ kind: 'authenticated_user' })
  const access = {
    kind: 'users',
    selectors: [
      { kind: 'user', instanceId: id, tenantId: id, principalId: id },
      { kind: 'idp_group', source, id: 'engineering' },
      { kind: 'department', source, id: 'department', matching: 'exact' },
      { kind: 'department', source, id: 'department', matching: 'subtree' },
      { kind: 'user_group', id },
    ],
  }
  expect(selfServiceAccess(access)).toEqual(access)
  for (const bad of [
    { kind: 'users', selectors: [] },
    { kind: 'users', selectors: [access.selectors[0], access.selectors[0]] },
    { kind: 'device', selectors: [] },
    { kind: 'users', selectors: [{ kind: 'user', user: access.selectors[0] }] },
    { kind: 'users', selectors: [{ kind: 'department', source, id: 'd', matching: 'recursive' }] },
    {
      kind: 'users',
      selectors: [{ kind: 'idp_group', source: { ...source, configurationVersion: 0 }, id: 'g' }],
    },
    {
      kind: 'users',
      selectors: Array.from({ length: 257 }, (_, i) => ({
        kind: 'idp_group',
        source,
        id: `g${i}`,
      })),
    },
  ])
    expect(() => selfServiceAccess(bad)).toThrow()
})
it('reads migrated null access only while withdrawn and requires an explicit choice to republish', () => {
  const migrated = {
    ...initialSelfService(),
    displayName: 'Repair',
    category: 'Support',
    published: false,
  }
  expect(selfService(migrated).access).toBeNull()
  expect(() => selfService({ ...migrated, published: true })).toThrow()
  const legacy: Partial<typeof migrated> = { ...migrated }
  delete legacy.access
  expect(() => selfService(legacy)).toThrow()
  expect(
    selfService({
      ...migrated,
      published: true,
      access: { kind: 'device' },
      allowAi: false,
      riskLevel: 1,
    }),
  ).toMatchObject({ access: { kind: 'device' }, allowAi: false, riskLevel: 1 })
})
