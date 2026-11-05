import { revision } from '@rss/mdm-inventory'

export function positive(value: number): number {
  if (!revision(value)) throw new Error('Positive revision required')
  return value
}
export function text(value: string, maximum: number, required = false): string {
  if (
    typeof value !== 'string' ||
    value.includes('\0') ||
    new TextEncoder().encode(value).length > maximum ||
    (required && !value.trim())
  )
    throw new Error('Invalid certificate text')
  return value
}
export function fingerprint(value: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid certificate fingerprint')
  return value
}
export function encoded(value: string, maximumBytes: number): string {
  if (
    !value ||
    value.length > Math.ceil(maximumBytes / 3) * 4 ||
    value.length % 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw new Error('Invalid encoded certificate material')
  const bytes = atob(value)
  if (bytes.length > maximumBytes || btoa(bytes) !== value)
    throw new Error('Invalid encoded certificate material')
  return value
}
export function filename(value: string, maximum = 128): string {
  text(value, maximum, true)
  if (/[\\/\p{Cc}]/u.test(value) || value === '.' || value === '..')
    throw new Error('Invalid material filename')
  return value
}
/** Ordinary metadata is retained as a complete bounded JSON document, never merged implicitly. */
export function document(value: unknown, maximum: number): void {
  let nodes = 0
  function visit(node: unknown, depth: number): void {
    if (++nodes > 4096 || depth > 16)
      throw new Error('Certificate metadata exceeds structural budget')
    if (node && typeof node === 'object') {
      if (
        !Array.isArray(node) &&
        Object.getPrototypeOf(node) !== Object.prototype &&
        Object.getPrototypeOf(node) !== null
      )
        throw new Error('Invalid metadata object')
      for (const [key, child] of Object.entries(node)) {
        if (key.includes('\0') || ['__proto__', 'prototype', 'constructor'].includes(key))
          throw new Error('Invalid metadata key')
        visit(child, depth + 1)
      }
    } else if (node !== null && !['string', 'number', 'boolean'].includes(typeof node))
      throw new Error('Invalid metadata value')
    else if (typeof node === 'number' && !Number.isFinite(node))
      throw new Error('Invalid metadata number')
    else if (typeof node === 'string' && node.includes('\0'))
      throw new Error('Invalid metadata text')
  }
  visit(value, 0)
  if (new TextEncoder().encode(JSON.stringify(value)).length > maximum)
    throw new Error('Certificate metadata exceeds byte budget')
}
