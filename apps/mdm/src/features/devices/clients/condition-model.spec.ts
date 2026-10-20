import { expect, it } from 'vitest'
import { collectionScope, inventoryCondition, deviceCondition } from './asset-model'
const id = '11111111-1111-4111-8111-111111111111',
  ast = { kind: 'and', children: [] }
const windows = { kind: 'windows', sid: 'S-1-5-21-1' },
  macos = { kind: 'macos', uid: 501, generated_uid: id }
const scopes = [
  { kind: 'device' },
  { kind: 'apple_user', identity: id },
  { kind: 'native_certificates', platform: 'windows', store: 'my', owner: null },
  { kind: 'native_certificates', platform: 'macos', store: 'login', owner: macos },
  { kind: 'native_accounts', platform: 'windows', identities: [windows.sid] },
  { kind: 'native_accounts', platform: 'macos', identities: [id] },
  { kind: 'native_application', platform: 'windows', identity: 'signed-app', owner: windows },
  { kind: 'native_user', owner: macos },
  { kind: 'macos_applications', root: 'user', uid: 501 },
  { kind: 'macos_applications', root: 'system', uid: null },
  {
    kind: 'macos_brew',
    uid: 501,
    prefix: '/opt/homebrew',
    package: 'formula',
    taps: ['homebrew/core'],
  },
]
it.each(scopes)('preserves the exact formal asset namespace $kind', (scope) => {
  expect(collectionScope(scope)).toEqual(scope)
  expect(
    inventoryCondition({ selector: { kind: 'exact', scope }, quantifier: 'one', criteria: ast }),
  ).toEqual({ selector: { kind: 'exact', scope }, quantifier: 'one', criteria: ast })
})
it('round trips device, local-user and authorized-universe conditions and rejects the retired AST', () => {
  expect(inventoryCondition(deviceCondition())).toEqual(deviceCondition())
  for (const selector of [
    { kind: 'local_user', platform: 'windows', identity: windows.sid },
    { kind: 'local_user', platform: 'macos', identity: '501' },
    { kind: 'all_authorized' },
  ])
    for (const quantifier of ['any', 'all'])
      expect(inventoryCondition({ selector, quantifier, criteria: ast })).toEqual({
        selector,
        quantifier,
        criteria: ast,
      })
  for (const invalid of [
    ast,
    { selector: { kind: 'device' }, quantifier: 'any', criteria: ast },
    { selector: { kind: 'all_authorized' }, quantifier: 'one', criteria: ast },
    {
      selector: { kind: 'local_user', platform: 'macos', identity: '0501' },
      quantifier: 'all',
      criteria: ast,
    },
    { ...deviceCondition(), legacy: true },
  ])
    expect(() => inventoryCondition(invalid)).toThrow()
})
it('rejects unbound users, cross-platform stores, traversal and unknown namespace fields', () => {
  for (const invalid of [
    { kind: 'native_user', owner: { ...macos, uid: 0 } },
    { kind: 'native_user', owner: { ...windows, sid: 'admin' } },
    { kind: 'native_certificates', platform: 'macos', store: 'login', owner: null },
    { kind: 'native_certificates', platform: 'macos', store: 'system', owner: windows },
    { kind: 'macos_applications', root: 'local', uid: 501 },
    { kind: 'macos_brew', uid: 501, prefix: '/opt/../homebrew', package: 'formula', taps: [] },
    {
      kind: 'macos_brew',
      uid: 501,
      prefix: '/opt/homebrew',
      package: 'formula',
      taps: ['../core'],
    },
    { kind: 'device', owner: null },
  ])
    expect(() => collectionScope(invalid)).toThrow()
})
