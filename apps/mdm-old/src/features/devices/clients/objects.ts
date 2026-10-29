import * as wireSchemas from '@rss/api/mdm-schemas'
import { array, count, identifier, nullable, unique, uuid } from '../../../services/decode'

export const channels = ['mdm', 'agent'] as const
export type Channel = (typeof channels)[number]
export function objectRef(value: unknown) {
  if (!wireSchemas.getApiV1DeviceViewsByKindByIdResponse.validateObjectRef(value))
    throw new Error('Invalid contract value')

  const v = value
  const kind = v['kind']
  return { kind, id: kind === 'association' ? uuid(v['id']) : identifier(v['id']) }
}
export type ObjectRef = ReturnType<typeof objectRef>
export const objectKey = (v: ObjectRef) => `${v.kind}:${v.id}`
export function primaryRegistration(value: unknown) {
  if (!wireSchemas.getApiV1DeviceViewsResponse.validatePrimaryRegistration(value))
    throw new Error('Invalid contract value')

  const v = value
  const generation = count(v['generation'])
  if (!generation) throw new Error('Invalid registration generation')
  return {
    device: identifier(v['device']),
    channel: v['channel'],
    registrationId: uuid(v['registrationId']),
    generation,
  }
}
export function deviceObject(value: unknown) {
  if (!wireSchemas.getApiV1DeviceRetirementsByIdResponse.validateDeviceObject(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    object: objectRef(v['object']),
    associationVersion: nullable(v['associationVersion'], count),
    verified: v['verified'],
    members: unique(
      array(v['members'], primaryRegistration),
      (m) => `${m.channel}:${m.registrationId}:${m.generation}`,
    ),
  }
}
