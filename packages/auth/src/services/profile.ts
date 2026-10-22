import { object, text, number, uuid } from './decode'
export type ProfileJson =
  | null
  | boolean
  | number
  | string
  | ProfileJson[]
  | { [key: string]: ProfileJson }
/** Only ordinary attribute data is dynamic; session and identity contracts remain closed. */
export function profileJson(value: unknown): ProfileJson {
  let members = 0
  function visit(v: unknown, depth: number): ProfileJson {
    if (depth > 8) throw new Error('Profile depth exceeded')
    if (v === null || typeof v === 'boolean') return v
    if (typeof v === 'string') {
      if (v.includes('\0')) throw new Error('Invalid profile string')
      return v
    }
    if (typeof v === 'number') {
      if (!Number.isFinite(v) || (Number.isInteger(v) && !Number.isSafeInteger(v)))
        throw new Error('Invalid profile number')
      return v
    }
    if (Array.isArray(v)) {
      if (v.length > 128) throw new Error('Profile array exceeded')
      return v.map((item) => visit(item, depth + 1))
    }
    if (typeof v !== 'object' || v === undefined) throw new Error('Invalid profile value')
    const entries = Object.entries(v)
    members += entries.length
    if (members > 256 || entries.some(([key]) => key.includes('\0')))
      throw new Error('Profile members exceeded')
    return Object.fromEntries(entries.map(([key, item]) => [key, visit(item, depth + 1)]))
  }
  const result = visit(value, 0)
  if (new TextEncoder().encode(JSON.stringify(result)).length > 65536)
    throw new Error('Profile size exceeded')
  return result
}
export function profileObject(value: unknown): Record<string, ProfileJson> {
  const v = profileJson(value)
  if (v === null || typeof v !== 'object' || Array.isArray(v))
    throw new Error('Profile object required')
  return v
}
export interface LocalProfile {
  displayName: string | null
  username: string | null
  email: string | null
  extensions: Record<string, ProfileJson>
  maxAgeSeconds: number
}
export function localProfile(value: unknown): { revision: number; value: LocalProfile | null } {
  const v = object(value, ['revision', 'value'])
  if (v['value'] === null) return { revision: number(v['revision']), value: null }
  const p = object(v['value'], ['displayName', 'username', 'email', 'extensions', 'maxAgeSeconds'])
  const age = number(p['maxAgeSeconds'])
  if (age < 60 || age > 86400) throw new Error('Invalid profile lifetime')
  const nullableText = (value: unknown) => (value === null ? null : text(value, 2048))
  return {
    revision: number(v['revision']),
    value: {
      displayName: nullableText(p['displayName']),
      username: nullableText(p['username']),
      email: nullableText(p['email']),
      extensions: profileObject(p['extensions']),
      maxAgeSeconds: age,
    },
  }
}
export function profileReceipt(value: unknown, id: string) {
  if (value === null) return null
  const v = object(value, ['operationId', 'revision'])
  const revision = number(v['revision'])
  if (uuid(v['operationId']) !== id || !revision) throw new Error('Wrong profile receipt')
  return { operationId: id, revision }
}
