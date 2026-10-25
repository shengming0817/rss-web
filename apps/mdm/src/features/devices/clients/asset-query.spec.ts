import { expect, it } from 'vitest'
import { encodeAssetQuery, decodeAssetCondition } from './asset-query'
import { fieldDefinition, queryInput, type InventoryCondition } from './asset-model'

const fields = [
  ['custom.text', { kind: 'string', maxLength: 256, allowEmpty: false }],
  ['custom.count', { kind: 'integer' }],
  ['custom.flag', { kind: 'boolean' }],
].map(([key, valueType]) =>
  fieldDefinition({
    key,
    valueType,
    version: 1,
    timeSeries: null,
    nullable: true,
    manual: true,
    sources: { manual: 0 },
    platforms: ['windows'],
    sensitivity: 'standard',
    unit: null,
    searchable: true,
    itemKey: null,
    operations: ['eq', 'in', 'is_null'],
  }),
)

it('roundtrips editor conditions through the current RSQL wire without coercing false or zero', () => {
  const condition: InventoryCondition = {
    selector: { kind: 'device' },
    quantifier: 'one',
    criteria: {
      kind: 'and',
      children: [
        {
          kind: 'predicate',
          field: 'custom.text',
          op: 'eq',
          value: { kind: 'string', value: "a'b\\c,;()" },
        },
        {
          kind: 'or',
          children: [
            {
              kind: 'predicate',
              field: 'custom.flag',
              op: 'eq',
              value: { kind: 'boolean', value: false },
            },
            {
              kind: 'predicate',
              field: 'custom.count',
              op: 'in',
              values: [{ kind: 'integer', value: 0 }],
            },
            { kind: 'predicate', field: 'custom.text', op: 'is_null' },
          ],
        },
      ],
    },
  }
  const input = encodeAssetQuery(
    condition,
    ['custom.count'],
    [{ field: 'custom.count', descending: true }],
  )
  expect(decodeAssetCondition(input, fields)).toEqual(condition)
  expect(queryInput(input)).toEqual(input)
  expect(input).not.toHaveProperty('criteria')
  expect(input).not.toHaveProperty('select')
})
it('represents all devices explicitly and rejects incomplete scoped predicates and retired DTOs', () => {
  expect(encodeAssetQuery(null, [], [])).toEqual({
    filter: null,
    scope: { selector: { kind: 'device' }, quantifier: 'one' },
    fields: [],
    sort: [],
  })
  expect(() => queryInput({ criteria: null, select: [], sort: null })).toThrow()
  expect(() =>
    encodeAssetQuery(
      {
        selector: { kind: 'all_authorized' },
        quantifier: 'any',
        criteria: { kind: 'and', children: [] },
      },
      [],
      [],
    ),
  ).toThrow()
  expect(() =>
    encodeAssetQuery(
      { selector: { kind: 'device' }, quantifier: 'one', criteria: { kind: 'or', children: [] } },
      [],
      [],
    ),
  ).toThrow()
})
