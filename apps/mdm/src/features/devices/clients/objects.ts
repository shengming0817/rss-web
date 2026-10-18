import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  unique,
  uuid,
} from '../../../services/decode'

export const channels = ['mdm', 'agent'] as const
export type Channel = (typeof channels)[number]
export function objectRef(value: unknown) {
  const v = closed(value, ['kind', 'id'])
  const kind = enumeration(v['kind'], ['endpoint', 'association'] as const)
  return { kind, id: kind === 'association' ? uuid(v['id']) : identifier(v['id']) }
}
export type ObjectRef = ReturnType<typeof objectRef>
export const objectKey = (v: ObjectRef) => `${v.kind}:${v.id}`
export function primaryRegistration(value: unknown) {
  const v = closed(value, ['device', 'channel', 'registrationId', 'generation'])
  const generation = count(v['generation'])
  if (!generation) throw new Error('Invalid registration generation')
  return {
    device: identifier(v['device']),
    channel: enumeration(v['channel'], channels),
    registrationId: uuid(v['registrationId']),
    generation,
  }
}
export function deviceObject(value: unknown) {
  const v = closed(value, ['object', 'associationVersion', 'verified', 'members'])
  return {
    object: objectRef(v['object']),
    associationVersion: nullable(v['associationVersion'], count),
    verified: boolean(v['verified']),
    members: unique(
      array(v['members'], primaryRegistration),
      (m) => `${m.channel}:${m.registrationId}:${m.generation}`,
    ),
  }
}
