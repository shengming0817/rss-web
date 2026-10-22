import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  identifier,
  integer,
  nullable,
  record,
  string,
  unique,
  uuid,
} from '../../../services/decode'
export const defaultApplicability = () => ({
  minimumOsVersion: null,
  minimumBuild: null,
  editions: [],
  enrollments: [],
  tools: {},
  capabilities: [],
})
export function applicability(value: unknown) {
  const v = closed(value, [
    'minimumOsVersion',
    'minimumBuild',
    'editions',
    'enrollments',
    'tools',
    'capabilities',
  ])
  return {
    minimumOsVersion: nullable(v['minimumOsVersion'], identifier),
    minimumBuild: nullable(v['minimumBuild'], count),
    editions: array(v['editions'], identifier),
    enrollments: array(v['enrollments'], identifier),
    tools: Object.fromEntries(
      Object.entries(record(v['tools'])).map(([k, v]) => [identifier(k), identifier(v)]),
    ),
    capabilities: array(v['capabilities'], identifier),
  }
}
export type Conversion =
  | { kind: 'identity' | 'cim_time' | 'integer' | 'number' }
  | { kind: 'enum'; values: Record<string, string | number | boolean> }
  | { kind: 'array_member'; member: number; present: string; absent: string }
  | { kind: 'scale'; numerator: number; denominator: number }
  | { kind: 'bitmask'; flags: Record<string, string> }
export interface ValueMapping {
  pointer: string
  conversion: Conversion
  columns: Record<string, ValueMapping>
}
export const identityMapping = (pointer: string): ValueMapping => ({
  pointer,
  conversion: { kind: 'identity' },
  columns: {},
})
export function conversion(value: unknown): Conversion {
  const kind = enumeration(record(value)['kind'], [
    'identity',
    'cim_time',
    'integer',
    'number',
    'enum',
    'array_member',
    'scale',
    'bitmask',
  ] as const)
  if (kind === 'enum') {
    const v = closed(value, ['kind', 'values'])
    const values = Object.fromEntries(
      Object.entries(record(v['values'])).map(([key, x]) => {
        const item =
          typeof x === 'boolean' ? boolean(x) : typeof x === 'number' ? finite(x) : string(x)
        return [string(key), item]
      }),
    )
    if (!Object.keys(values).length || Object.keys(values).length > 128)
      throw new Error('Invalid enum mapping')
    return { kind, values }
  }
  if (kind === 'scale') {
    const v = closed(value, ['kind', 'numerator', 'denominator']),
      numerator = count(v['numerator']),
      denominator = count(v['denominator'])
    if (!numerator || !denominator) throw new Error('Invalid scale')
    return { kind, numerator, denominator }
  }
  if (kind === 'array_member') {
    const v = closed(value, ['kind', 'member', 'present', 'absent'])
    return {
      kind,
      member: count(v['member']),
      present: identifier(v['present']),
      absent: identifier(v['absent']),
    }
  }
  if (kind === 'bitmask') {
    const v = closed(value, ['kind', 'flags']),
      flags = Object.fromEntries(
        Object.entries(record(v['flags'])).map(([k, x]) => {
          if (!/^[1-9]\d*$/.test(k)) throw new Error('Invalid bit')
          const bit = BigInt(k)
          if ((bit & (bit - 1n)) !== 0n || bit > 9223372036854775807n)
            throw new Error('Invalid bit')
          return [k, identifier(x)]
        }),
      )
    if (!Object.keys(flags).length || Object.keys(flags).length > 63)
      throw new Error('Invalid flags')
    unique(Object.values(flags), (x) => x)
    return { kind, flags }
  }
  closed(value, ['kind'])
  return { kind }
}
export function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid number')
  return value
}
export function valueMapping(value: unknown): ValueMapping {
  let nodes = 0
  function decode(value: unknown, depth: number): ValueMapping {
    if (depth > 4 || ++nodes > 128) throw new Error('Mapping exceeds bounds')
    const v = closed(value, ['pointer', 'conversion', 'columns']),
      pointer = string(v['pointer'])
    if (pointer !== '' && (!pointer.startsWith('/') || /~(?![01])/u.test(pointer)))
      throw new Error('Invalid JSON pointer')
    const entries = Object.entries(record(v['columns']))
    if (entries.length > 64) throw new Error('Invalid columns')
    const columns = Object.fromEntries(
      entries.map(([key, value]) => {
        if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)) throw new Error('Invalid column')
        return [key, decode(value, depth + 1)]
      }),
    )
    const c = conversion(v['conversion'])
    if (entries.length && c.kind !== 'identity') throw new Error('Invalid columns')
    return { pointer, conversion: c, columns }
  }
  return decode(value, 0)
}
export function positive(value: unknown) {
  const n = integer(value)
  if (n <= 0) throw new Error('Expected positive number')
  return n
}

export function templateScope(
  value: unknown,
): { kind: 'device' } | { kind: 'user'; identity: string } {
  const kind = enumeration(record(value)['kind'], ['device', 'user'] as const)
  const v = closed(value, kind === 'device' ? ['kind'] : ['kind', 'identity'])
  return kind === 'device' ? { kind } : { kind, identity: uuid(v['identity']) }
}
