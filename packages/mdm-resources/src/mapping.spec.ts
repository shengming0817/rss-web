import { expect, it } from 'vitest'
import { freeze } from '@rss/mdm-inventory'
import { validateMapping } from './index'

it('preserves recursive column conversions, false and full-width bitmask keys', () => {
  const mapping = freeze({
    pointer: '/rows',
    conversion: { kind: 'identity' as const },
    columns: {
      enabled: {
        pointer: '/state',
        conversion: { kind: 'enum' as const, values: { off: false, zero: 0 } },
        columns: {},
      },
      flags: {
        pointer: '/flags',
        conversion: { kind: 'bitmask' as const, flags: { '18446744073709551615': 'all' } },
        columns: {},
      },
    },
  })
  validateMapping(mapping)
  expect(mapping.columns.enabled.conversion.values).toEqual({ off: false, zero: 0 })
  expect(() => validateMapping({ ...mapping, pointer: '/invalid~2escape' })).toThrow('pointer')
  expect(() =>
    validateMapping({
      pointer: '',
      conversion: { kind: 'bitmask', flags: { '18446744073709551616': 'overflow' } },
      columns: {},
    }),
  ).toThrow('bitmask')
})
