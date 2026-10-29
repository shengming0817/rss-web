import { expect, it, vi } from 'vitest'
import {
  createProfiles,
  nextProfileExpiry,
  prepareDefinition,
  validateDefinition,
  visibleProfile,
  type DefinitionValue,
  type Profile,
  type ProfilesPort,
} from './index'
const principalId = '11111111-1111-4111-8111-111111111111',
  fieldId = '22222222-2222-4222-8222-222222222222'
const value: DefinitionValue = {
  key: 'businessField',
  displayName: 'Field',
  source: { kind: 'identity_local' },
  pointer: '/extensions/field',
  valueType: 'string',
  maxLength: 64,
  maxItems: null,
  minimum: null,
  maximum: null,
  enabled: true,
  sensitive: false,
  required: true,
  visibility: 'both',
  displayUse: 'profile',
  useExistingObservation: false,
}
const profile: Profile = {
  principalId,
  view: 'current',
  completeness: { required: 2, complete: 2, missing: 0 },
  profiles: [
    {
      source: { kind: 'identity_local' },
      status: 'available',
      snapshotId: fieldId,
      providerConfigVersion: null,
      sourceRevision: 1,
      observedAt: 50,
      collectedAtMicros: 50_000_000,
      expiresAt: 100,
      fixed: {
        displayName: { status: 'available', value: '' },
        username: { status: 'missing' },
        email: { status: 'missing' },
        emailVerified: { status: 'available', value: false },
      },
    },
    {
      source: { kind: 'idp', provider: principalId },
      status: 'available',
      snapshotId: principalId,
      providerConfigVersion: 1,
      sourceRevision: null,
      observedAt: 50,
      collectedAtMicros: 50_000_000,
      expiresAt: 200,
      fixed: null,
    },
  ],
  fields: [
    {
      fieldId,
      revision: 1,
      key: 'remote',
      displayName: 'Remote',
      source: { kind: 'identity_local' },
      valueType: 'boolean',
      sensitive: false,
      displayUse: 'profile',
      required: true,
      status: 'available',
      value: false,
    },
    {
      fieldId: principalId,
      revision: 1,
      key: 'allocation',
      displayName: 'Allocation',
      source: { kind: 'idp', provider: principalId },
      valueType: 'number',
      sensitive: false,
      displayUse: 'profile',
      required: true,
      status: 'available',
      value: 0,
    },
  ],
}
it('removes only expired source values without latest fallback or fabricated completeness', () => {
  expect(visibleProfile(profile, 99).profile.fields[0]?.value).toBe(false)
  const first = visibleProfile(profile, 100)
  expect(first.completenessStale).toBe(true)
  expect(first.profile.fields[0]).toMatchObject({ status: 'expired', value: null })
  expect(first.profile.profiles[0]?.fixed).toBeNull()
  expect(first.profile.fields[1]?.value).toBe(0)
  expect(first.profile.completeness).toEqual(profile.completeness)
  expect(nextProfileExpiry(first.profile)).toBe(200)
  expect(visibleProfile(first.profile, 200).profile.fields.every((f) => f.value === null)).toBe(
    true,
  )
})
it('accepts RFC6901 root and escapes while rejecting reserved keys, malformed escapes and inappropriate constraints', () => {
  for (const pointer of ['', '/extensions/a~1b/~0key', '/extensions/'])
    expect(() => validateDefinition({ ...value, pointer })).not.toThrow()
  for (const pointer of ['relative', '/extensions/~2bad', '/extensions/\u0000'])
    expect(() => validateDefinition({ ...value, pointer })).toThrow()
  expect(() => validateDefinition({ ...value, key: 'sessionId' })).toThrow()
  expect(() => validateDefinition({ ...value, maxItems: 1 })).toThrow()
  expect(() =>
    validateDefinition({ ...value, valueType: 'integer', maxLength: null, minimum: 0.5 }),
  ).not.toThrow()
  expect(() => validateDefinition({ ...value, displayName: '字'.repeat(86) })).toThrow()
  expect(() =>
    prepareDefinition(
      principalId,
      { fieldId, revision: 2, value: null, collectedAfterMicros: 0 },
      value,
    ),
  ).toThrow()
})
it('binds self/latest reads and CAS receipts to the requested principal, view and field', async () => {
  const self = vi.fn(async () => ({ ...profile, principalId: fieldId })),
    other = vi.fn(async () => profile)
  const save = vi.fn(async () => ({
    operationId: principalId,
    definition: { fieldId, revision: 1, value, collectedAfterMicros: 0 },
  }))
  const client = createProfiles({ self, other, save } as unknown as ProfilesPort, principalId)
  await expect(client.self('current', false)).rejects.toThrow('self')
  await expect(client.other(principalId, false)).rejects.toThrow('projection')
  await expect(
    client.save({ operationId: principalId, fieldId, expectedRevision: 1, value }),
  ).rejects.toThrow('receipt')
  expect(save).toHaveBeenCalledTimes(1)
})
