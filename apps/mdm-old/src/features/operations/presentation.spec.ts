import { expect, it } from 'vitest'
import { utc } from './presentation'
it('formats UTC and retains out-of-range protocol values without invalid Date errors', () => {
  expect(utc(0)).toBe('1970-01-01T00:00:00.000Z')
  expect(utc(Number.MAX_SAFE_INTEGER)).toBe(String(Number.MAX_SAFE_INTEGER))
})
