/** Telemetry integers retain canonical decimal text; only bounded display ratios use Number. */
export type IntegerKind = 'i64' | 'u64' | 'i128' | 'u128'
export type Numeric =
  | { readonly type: IntegerKind; readonly value: string }
  | { readonly type: 'f64'; readonly value: number }
export function integerText(value: unknown, kind: IntegerKind = 'i64'): string {
  if (typeof value !== 'string' || !/^(?:0|-?[1-9][0-9]*)$/.test(value))
    throw new Error('Invalid telemetry decimal')
  const bits = kind.endsWith('128') ? 128n : 64n,
    signed = kind.startsWith('i'),
    n = BigInt(value)
  if (n < (signed ? -(1n << (bits - 1n)) : 0n) || n > (1n << (signed ? bits - 1n : bits)) - 1n)
    throw new Error('Telemetry decimal out of range')
  return value
}
export function positiveText(value: unknown): string {
  const text = integerText(value, 'u64')
  if (text === '0') throw new Error('Positive telemetry integer required')
  return text
}
export function numericText(value: Numeric): string {
  return String(value.value)
}
/** Exact integer fractions are shown alongside any explicitly approximate decimal. */
export function fractionText(value: Numeric, denominator: string, scale = 1n): string {
  const d = BigInt(positiveText(denominator))
  if (value.type === 'f64')
    return `≈ ${(value.value * Number(scale)) / Number(d)} (${value.value} × ${scale} / ${denominator})`
  const n = BigInt(value.value) * scale,
    negative = n < 0n,
    magnitude = negative ? -n : n
  const rounded = (magnitude * 1000000n + d / 2n) / d
  return `≈ ${negative ? '-' : ''}${rounded / 1000000n}.${String(rounded % 1000000n).padStart(6, '0')} (${n} / ${denominator})`
}
