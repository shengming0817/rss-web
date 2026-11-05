import { identifier } from '@rss/mdm-inventory'

/** Shared collection extraction semantics; this model neither executes nor evaluates them. */
export type Conversion =
  | { readonly kind: 'identity' | 'cim_time' | 'integer' | 'number' }
  | { readonly kind: 'enum'; readonly values: Readonly<Record<string, string | boolean | number>> }
  | {
      readonly kind: 'array_member'
      readonly member: number
      readonly present: string
      readonly absent: string
    }
  | { readonly kind: 'scale'; readonly numerator: number; readonly denominator: number }
  | { readonly kind: 'bitmask'; readonly flags: Readonly<Record<string, string>> }
export interface ValueMapping {
  readonly pointer: string
  readonly conversion: Conversion
  readonly columns: Readonly<Record<string, ValueMapping>>
}
export interface AgentMapping {
  readonly query: string
  readonly mapping: ValueMapping
  readonly missing: 'missing' | 'null' | 'delete'
  readonly counterNormalization?: 'local_cumulative_v1' | null
}
export type NativeRead =
  | string
  | { readonly kind: 'scalar'; readonly uri: string }
  | { readonly kind: 'enrollment_id' | 'enrollment_type' }
  | {
      readonly kind: 'inventory'
      readonly inventory:
        | 'win32'
        | 'store'
        | 'non_store'
        | 'system'
        | 'network'
        | 'installed_updates'
        | 'installable_updates'
        | 'failed_updates'
        | 'pending_reboot_updates'
    }
export interface NativeMapping {
  readonly query: NativeRead
  readonly mapping: ValueMapping
}

export function validateMapping(mapping: ValueMapping): void {
  function visit(value: ValueMapping, ancestors: ReadonlySet<ValueMapping>): void {
    if (ancestors.has(value)) throw new Error('Cyclic mapping')
    if (
      value.pointer !== '' &&
      (!value.pointer.startsWith('/') || /~(?![01])/u.test(value.pointer))
    )
      throw new Error('Invalid JSON pointer')
    const conversion = value.conversion
    if (conversion.kind === 'array_member') {
      if (!Number.isSafeInteger(conversion.member)) throw new Error('Invalid array member')
    } else if (conversion.kind === 'scale') {
      if (
        !Number.isSafeInteger(conversion.numerator) ||
        !Number.isSafeInteger(conversion.denominator) ||
        conversion.denominator === 0
      )
        throw new Error('Invalid scale')
    } else if (conversion.kind === 'enum') {
      for (const item of Object.values(conversion.values))
        if (typeof item === 'number' && !Number.isFinite(item))
          throw new Error('Invalid enum number')
    } else if (conversion.kind === 'bitmask') {
      for (const mask of Object.keys(conversion.flags))
        if (!/^[0-9]+$/.test(mask) || BigInt(mask) > 18446744073709551615n)
          throw new Error('Invalid bitmask')
    }
    const path = new Set(ancestors).add(value)
    for (const [key, child] of Object.entries(value.columns)) {
      identifier(key, 256)
      visit(child, path)
    }
  }
  visit(mapping, new Set())
}
