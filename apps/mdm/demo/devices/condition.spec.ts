import { expect, it } from 'vitest'
import { evaluateCondition } from './criteria'
import { createDeviceDemo } from './state'
import { fact } from './fixtures'
import { deviceCondition } from '../../src/features/devices/clients/asset-model'
it('evaluates namespaces independently and preserves Unknown for empty or incomplete quantified universes', () => {
  const base = createDeviceDemo().facts()[0]!.inventory
  const ast = {
    kind: 'predicate' as const,
    field: 'custom.asset_tag',
    op: 'eq' as const,
    value: { kind: 'string' as const, value: 'managed' },
  }
  const match = {
      ...base,
      fields: {
        'custom.asset_tag': fact('custom.asset_tag', { kind: 'string', value: 'managed' }),
      },
    },
    other = {
      ...base,
      collectionScope: { kind: 'macos_applications' as const, root: 'user' as const, uid: 501 },
      fields: { 'custom.asset_tag': fact('custom.asset_tag', { kind: 'string', value: 'other' }) },
    }
  expect(evaluateCondition(deviceCondition(ast), [match, other]).decision).toBe('match')
  expect(
    evaluateCondition({ selector: { kind: 'all_authorized' }, quantifier: 'all', criteria: ast }, [
      match,
      other,
    ]).decision,
  ).toBe('no_match')
  expect(
    evaluateCondition({ selector: { kind: 'all_authorized' }, quantifier: 'any', criteria: ast }, [
      match,
      other,
    ]).decision,
  ).toBe('match')
  expect(
    evaluateCondition(
      {
        selector: { kind: 'local_user', platform: 'macos', identity: '501' },
        quantifier: 'all',
        criteria: ast,
      },
      [match, other],
    ).decision,
  ).toBe('no_match')
  expect(
    evaluateCondition(
      {
        selector: { kind: 'local_user', platform: 'macos', identity: '502' },
        quantifier: 'all',
        criteria: ast,
      },
      [match, other],
    ).decision,
  ).toBe('unknown')
  expect(
    evaluateCondition(
      { selector: { kind: 'all_authorized' }, quantifier: 'all', criteria: ast },
      [match],
      false,
    ).decision,
  ).toBe('unknown')
})
