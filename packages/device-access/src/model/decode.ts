export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid object')
  return value as Record<string, unknown>
}
export function closed(value: unknown, keys: readonly string[], optional: readonly string[] = []) {
  const v = object(value)
  if (
    keys.some((k) => !(k in v)) ||
    Object.keys(v).some((k) => !keys.includes(k) && !optional.includes(k))
  )
    throw new Error('Invalid fields')
  return v
}
export function text(v: unknown, max = 1024): string {
  if (
    typeof v !== 'string' ||
    !v.trim() ||
    v.length > max ||
    [...v].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    throw new Error('Invalid text')
  return v
}
export function count(v: unknown): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw new Error('Invalid count')
  return v
}
export function bool(v: unknown): boolean {
  if (typeof v !== 'boolean') throw new Error('Invalid boolean')
  return v
}
export function uuid(v: unknown): string {
  const s = text(v, 36)
  if (
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(s) ||
    /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(s)
  )
    throw new Error('Invalid UUID')
  return s
}
export function choice<T extends string>(v: unknown, values: readonly T[]): T {
  if (typeof v !== 'string' || !values.includes(v as T)) throw new Error('Invalid enum')
  return v as T
}
export function nullable<V, T>(v: V, decode: (v: Exclude<V, null>) => T): T | null
export function nullable<T>(v: unknown, decode: (v: never) => T): T | null {
  return v === null ? null : decode(v as never)
}
export function list<V, T>(v: readonly V[], decode: (v: V) => T, max?: number): T[]
export function list<T>(v: unknown, decode: (v: unknown) => T, max?: number): T[]
export function list<T>(v: unknown, decode: (v: never) => T, max = 1000): T[] {
  if (!Array.isArray(v) || v.length > max) throw new Error('Invalid list')
  return v.map((x) => decode(x as never))
}
export function page<V, T>(
  value: { items: readonly V[]; nextCursor: string | null },
  decode: (v: V) => T,
): { items: T[]; nextCursor: string | null }
export function page<T>(
  value: unknown,
  decode: (v: unknown) => T,
): { items: T[]; nextCursor: string | null }
export function page<T>(value: unknown, decode: (v: never) => T) {
  const v = closed(value, ['items', 'nextCursor'])
  return {
    items: list(v['items'], (item) => decode(item as never)),
    nextCursor: nullable(v['nextCursor'], (v) => text(v, 4096)),
  }
}
export function unique<T>(values: T[], key: (v: T) => string) {
  if (new Set(values.map(key)).size !== values.length) throw new Error('Duplicate identity')
  return values
}
export function same(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error('Mismatched context')
}
