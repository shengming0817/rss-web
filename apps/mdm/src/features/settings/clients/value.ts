import { count, string } from '../../../services/decode'

/** Public PEM/CSR may contain newlines; never use this decoder for private material output. */
export function publicText(value: unknown, max = 262144): string {
  if (
    typeof value !== 'string' ||
    new TextEncoder().encode(value).byteLength > max ||
    Array.from(value).some((c) => {
      const n = c.charCodeAt(0)
      return (n < 32 && ![9, 10, 13].includes(n)) || n === 127
    })
  )
    throw new Error('Invalid public material')
  return value
}
export function sha256(value: unknown) {
  const digest = string(value)
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error('Invalid digest')
  return digest
}
export function positive(value: unknown) {
  const n = count(value)
  if (!n) throw new Error('Invalid revision')
  return n
}
export function origin(value: unknown) {
  const s = string(value),
    url = new URL(s)
  if (url.protocol !== 'https:' || url.origin !== s || url.username || url.password)
    throw new Error('Invalid origin')
  return s
}

export function operationReceipt<T extends { operationId: string }>(
  id: string,
  decode: (value: unknown) => T,
) {
  return (value: unknown) => {
    const result = decode(value)
    if (result.operationId !== id) throw new Error('Wrong original operation')
    return result
  }
}

/** Comparison identity only; raw imported files never enter shared operation metadata. */
export async function inputDigest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
