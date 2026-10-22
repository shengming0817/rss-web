import { expect, it } from 'vitest'
import { profileJson, profileObject } from '@rss/auth'
import { profile, definition, definitionReceipt } from './profiles'
const id = '11111111-1111-4111-8111-111111111111'
const input = {
  fieldId: id,
  revision: 1,
  collectedAfterMicros: 1,
  value: {
    key: 'employee',
    displayName: 'Employee',
    source: { kind: 'identity_local' },
    pointer: '/extensions/employee',
    valueType: 'string',
    maxLength: null,
    maxItems: null,
    minimum: null,
    maximum: null,
    enabled: true,
    sensitive: false,
    visibility: 'both',
    displayUse: 'profile',
    required: true,
    useExistingObservation: false,
  },
}
it('keeps dynamic values lossless while enforcing the ordinary attribute boundary', () => {
  expect(
    profileObject({
      remote: false,
      count: 0,
      empty: '',
      missing: null,
      nested: [{ label: 'a\nb' }],
    }),
  ).toEqual({ remote: false, count: 0, empty: '', missing: null, nested: [{ label: 'a\nb' }] })
  for (const value of [
    Infinity,
    NaN,
    9007199254740992,
    { value: '\0' },
    Array(129).fill(0),
    { value: 'x'.repeat(65536) },
  ])
    expect(() => profileJson(value)).toThrow()
  expect(() => profileObject([])).toThrow()
  expect(() =>
    profileJson({ a: { b: { c: { d: { e: { f: { g: { h: { i: 1 } } } } } } } } }),
  ).toThrow()
})
it('binds receipts to the original operation and keeps definition deletion explicit', () => {
  expect(definition(input).value?.source).toEqual({ kind: 'identity_local' })
  expect(definition({ ...input, value: null }).value).toBeNull()
  expect(() => definition({ ...input, value: undefined })).toThrow()
  expect(
    definitionReceipt({ operationId: id, definition: input }, id, id).definition.revision,
  ).toBe(1)
  expect(() =>
    definitionReceipt(
      { operationId: id, definition: input },
      '22222222-2222-4222-8222-222222222222',
    ),
  ).toThrow()
})
it('requires complete observation metadata independently of fixed identity fields', () => {
  const value = {
    principalId: id,
    view: 'current',
    profiles: [
      {
        source: { kind: 'identity_local' },
        status: 'available',
        snapshotId: id,
        providerConfigVersion: null,
        sourceRevision: 1,
        observedAt: 1,
        collectedAtMicros: 1000000,
        expiresAt: 100,
        fixed: {
          displayName: { status: 'missing' },
          username: { status: 'missing' },
          email: { status: 'invalid' },
          emailVerified: { status: 'available', value: false },
        },
      },
    ],
    fields: [
      {
        fieldId: id,
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
    ],
    completeness: { required: 1, complete: 1, missing: 0 },
  }
  expect(profile(value).fields[0]?.value).toBe(false)
  expect(profile(value).profiles[0]?.sourceRevision).toBe(1)
  expect(() =>
    profile({ ...value, completeness: { required: 1, complete: 1, missing: 1 } }),
  ).toThrow()
  expect(() =>
    profile({
      ...value,
      profiles: value.profiles.map((v) => ({ ...v, sourceRevision: undefined })),
    }),
  ).toThrow()
  expect(() => profile({ ...value, principalId: { arbitrary: 'identity' } })).toThrow()
})
