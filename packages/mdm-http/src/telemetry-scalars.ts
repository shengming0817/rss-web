import type { PolicyExactResourceBinding } from '@rss/api/mdm-types'
export { count, enumeration, uuid, positive, text as string } from './decode'
export function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new Error('Telemetry integer exceeds exact browser range')
  return value
}
export function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error('Invalid telemetry number')
  return value
}
/** The fixed current exact binding; no version fallback or inferred variant. */
export function exactResource(value: PolicyExactResourceBinding) {
  return {
    resource: value.id,
    version: value.version,
    variant: value.variant,
    platform: value.platform,
    architecture: value.architecture,
  }
}

export function array<V, T>(value: readonly V[], project: (v: V) => T): T[]
export function array<T>(value: unknown, project: (v: unknown) => T): T[]
export function array<T>(value: unknown, project: (v: never) => T): T[] {
  if (!Array.isArray(value) || value.length > 10000) throw new Error('Invalid list')
  return value.map((v) => project(v as never))
}
export function nullable<V, T>(value: V, project: (v: Exclude<V, null>) => T): T | null {
  return value === null ? null : project(value as Exclude<V, null>)
}
