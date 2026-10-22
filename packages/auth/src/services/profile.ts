import { object, text, number, uuid } from './decode'
import { profileObject, type ProfileJson } from '../profile-json'
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
