export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
/** Validate current product JSON without projecting away unknown keys. */
function decode(value: unknown, maxBytes: number, extension: boolean): Json {
  let nodes = 0
  const ancestors = new Set<object>()
  function visit(value: unknown, depth: number): Json {
    if ((extension && depth > 0 && ++nodes > 4096) || depth > 16)
      throw new Error('JSON budget exceeded')
    if (value === null || typeof value === 'boolean') return value
    if (typeof value === 'string') {
      if (extension && value.includes('\0')) throw new Error('Invalid JSON string')
      return value
    }
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (!value || typeof value !== 'object' || ancestors.has(value)) throw new Error('Invalid JSON')
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      throw new Error('Invalid JSON object')
    ancestors.add(value)
    let result: Json
    if (Array.isArray(value)) result = value.map((item) => visit(item, depth + 1))
    else
      result = Object.fromEntries(
        Object.entries(value).map(([key, item]) => {
          if (
            extension &&
            (!key || new TextEncoder().encode(key).byteLength > 256 || /\p{Cc}/u.test(key))
          )
            throw new Error('Invalid JSON key')
          return [key, visit(item, depth + 1)]
        }),
      )
    ancestors.delete(value)
    return result
  }
  const result = visit(value, 0)
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > maxBytes)
    throw new Error('JSON too large')
  return result
}
export function jsonValue(value: unknown, maxBytes: number): Json {
  return decode(value, maxBytes, false)
}
export function jsonObject(value: unknown, maxBytes: number): { [key: string]: Json } {
  const result = decode(value, maxBytes, true)
  if (result === null || typeof result !== 'object' || Array.isArray(result))
    throw new Error('Expected JSON object')
  return result
}
