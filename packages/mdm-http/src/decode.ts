/** Narrow scalar projections after generated wire admission; no parallel wire schema. */
export function uuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value) ||
    /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value)
  )
    throw new Error('Invalid identifier')
  return value
}
export function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid text')
  return value
}
export function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid count')
  return value
}
export function positive(value: unknown): number {
  const result = count(value)
  if (!result) throw new Error('Invalid revision')
  return result
}
export function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Invalid boolean')
  return value
}
export function nullable<T>(value: unknown, project: (v: unknown) => T): T | null {
  return value === null ? null : project(value)
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid object')
  return value as Record<string, unknown>
}
export function list<T>(value: unknown, project: (v: unknown) => T, maximum = 1000): T[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error('Invalid list')
  return value.map(project)
}
export function enumeration<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) throw new Error('Invalid enum')
  return value as T
}
