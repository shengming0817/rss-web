import { expect, it } from 'vitest'
import { fractionText, integerText, positiveText } from './numbers'
it('preserves all signed and unsigned boundaries and rejects noncanonical or out-of-range integers', () => {
  for (const kind of ['i64', 'u64', 'i128', 'u128'] as const) {
    const bits = kind.endsWith('128') ? 128n : 64n,
      signed = kind.startsWith('i'),
      low = signed ? -(1n << (bits - 1n)) : 0n,
      high = (1n << (signed ? bits - 1n : bits)) - 1n
    expect(integerText(String(low), kind)).toBe(String(low))
    expect(integerText(String(high), kind)).toBe(String(high))
    expect(() => integerText(String(low - 1n), kind)).toThrow()
    expect(() => integerText(String(high + 1n), kind)).toThrow()
  }
  for (const value of [1, '+1', '01', '-0', '1e2', '1\n'])
    expect(() => integerText(value)).toThrow()
  expect(() => positiveText('0')).toThrow()
  expect(integerText('9007199254740993')).not.toBe(integerText('9007199254740992'))
})
it('retains sufficient statistics when formatting means and per-second rates', () => {
  expect(fractionText({ type: 'i128', value: '9007199254740993' }, '2')).toContain(
    '(9007199254740993 / 2)',
  )
  expect(
    fractionText({ type: 'u128', value: '18446744073709551615' }, '1000000', 1000000n),
  ).toContain('(18446744073709551615000000 / 1000000)')
  expect(fractionText({ type: 'i128', value: '-1' }, '3')).toContain('≈ -0.333333')
})

it('formats finite f64 rates without overflowing the intermediate product', () => {
  expect(fractionText({ type: 'f64', value: Number.MAX_VALUE }, '1000000', 1000000n)).toContain(
    `≈ ${Number.MAX_VALUE} (`,
  )
  expect(fractionText({ type: 'f64', value: Number.MIN_VALUE }, '1000000', 1000000n)).toContain(
    `≈ ${Number.MIN_VALUE} (`,
  )
})
