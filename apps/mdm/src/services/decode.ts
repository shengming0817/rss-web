export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid response')
  return value as Record<string, unknown>
}
export function string(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 4096 ||
    [...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    throw new Error('Invalid string')
  return value
}
export function enumeration<const T extends readonly string[]>(
  value: unknown,
  values: T,
): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) throw new Error('Invalid enum')
  return value as T[number]
}
export function array<T>(value: unknown, decode: (item: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > 1000) throw new Error('Invalid list')
  return value.map(decode)
}
export function uuid(value: unknown): string {
  const result = string(value)
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(result) ||
    /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(result)
  )
    throw new Error('Invalid identifier')
  return result
}
