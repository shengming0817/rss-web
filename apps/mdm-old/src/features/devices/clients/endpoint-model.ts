import * as wireSchemas from '@rss/api/mdm-schemas'
import { source, sourceKey } from '../../settings/clients/profiles'
import { resolvedField } from './asset-model'
import {
  array,
  boolean,
  count,
  enumeration,
  identifier,
  integer,
  nullable,
  string,
  unique,
  uuid,
} from '../../../services/decode'
export const channels = ['mdm', 'agent'] as const
export const endpointStatuses = [
  'active',
  'pending',
  'revoked',
  'superseded',
  'registered',
  'cancelled',
  'expired',
] as const
export function positive(value: unknown) {
  const n = count(value)
  if (!n) throw new Error('Invalid version')
  return n
}
export function member(value: unknown) {
  if (!wireSchemas.getApiV1DeviceViewsResponse.validatePrimaryRegistration(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    device: identifier(v['device']),
    channel: v['channel'],
    registrationId: uuid(v['registrationId']),
    generation: positive(v['generation']),
  }
}
export type Member = ReturnType<typeof member>

export function endpoint(value: unknown) {
  if (!wireSchemas.getApiV1DevicesResponse.validateProjection_Item(value))
    throw new Error('Invalid contract value')

  return endpointFields(value)
}
function person(value: unknown) {
  if (!wireSchemas.getApiV1DeviceViewsResponse.validateUser(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    tenantId: uuid(v['tenantId']),
    instanceId: uuid(v['instanceId']),
    principalId: uuid(v['principalId']),
  }
}
export function personDisplay(value: unknown) {
  if (!wireSchemas.getApiV1DeviceViewsResponse.validatePersonDisplay(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    login: nullable(v['login'], personText),
    profiles: unique(
      array(v['profiles'], (value) => {
        const p = value
        const status = p['status']
        const displayName = nullable(p['displayName'], personText)
        const username = nullable(p['username'], personText)
        if (status !== 'available' && (displayName !== null || username !== null))
          throw new Error('Unavailable personnel contains values')
        return { source: source(p['source']), status, displayName, username }
      }),
      (p) => sourceKey(p.source),
    ),
  }
}
function personText(value: unknown) {
  const text = string(value)
  if (!text.trim()) throw new Error('Empty personnel value')
  return text
}
export type PersonDisplay = ReturnType<typeof personDisplay>
export function viewEndpoint(value: unknown) {
  if (!wireSchemas.getApiV1DeviceViewsByKindByIdResponse.validateEndpoint(value))
    throw new Error('Invalid contract value')

  const v = value
  const p = v['platform']
  const platform = {
    state: p['state'],
    values: unique(
      array(p['values'], (x) => x),
      (x) => x,
    ),
  }
  if (
    (platform.state === 'known' && platform.values.length !== 1) ||
    (platform.state === 'unknown' && platform.values.length !== 0) ||
    (platform.state === 'conflict' && platform.values.length < 2)
  )
    throw new Error('Invalid platform summary')
  const owner = v.registrationUser ?? undefined
  const current = v.currentUser ?? undefined
  const currentUser = current
    ? {
        revision: count(current['revision']),
        state: enumeration(current['state'], ['unbound', 'active', 'invalidated'] as const),
        user: nullable(current['user'], person),
        confirmedAt: nullable(current['confirmedAt'], integer),
        display: nullable(current['display'], personDisplay),
      }
    : undefined
  if (currentUser && (currentUser.state === 'active') !== (currentUser.user !== null))
    throw new Error('Invalid current user state')
  if (
    (owner && owner['user'] === null && owner['display'] !== null) ||
    (currentUser && currentUser.user === null && currentUser.display !== null)
  )
    throw new Error('Personnel display has no related user')
  return {
    ...endpointFields(v),
    assetState: v['assetState'],
    platform,
    displayName: v['displayName'] == null ? undefined : resolvedField(v['displayName']),
    serialNumber: v['serialNumber'] == null ? undefined : resolvedField(v['serialNumber']),
    registrationUser: owner
      ? {
          revision: count(owner['revision']),
          user: nullable(owner['user'], person),
          display: nullable(owner['display'], personDisplay),
        }
      : undefined,
    currentUser,
  }
}
export type ViewEndpoint = ReturnType<typeof viewEndpoint>
export const endpointDirectoryFields = {
  id: (value: unknown) => identifier(value),
  status: (value: unknown) => enumeration(value, endpointStatuses),
  primaryMdmRegistration: (value: unknown) =>
    nullable(value, (x) => {
      if (!wireSchemas.getApiV1DevicesByDeviceResponse.validatePrimary(x))
        throw new Error('Invalid contract value')

      const p = x
      return {
        registrationId: uuid(p['registrationId']),
        generation: positive(p['generation']),
        source: enumeration(p['source'], ['mdm.windows', 'mdm.apple'] as const),
      }
    }),
  channels: (value: unknown) =>
    unique(
      array(value, (x) => {
        if (!wireSchemas.getApiV1DevicesByDeviceResponse.validateChannel(x))
          throw new Error('Invalid registration channel')
        const c = x
        return {
          registrationId: uuid(c['registrationId']),
          channel: c['channel'],
          generation: positive(c['generation']),
          status: c['status'],
          platform: nullable(c['platform'], (x) => x),
          source: c['source'],
          lastCommunicationReceivedAt: nullable(c['lastCommunicationReceivedAt'], integer),
          children: array(c['children'], (x) => {
            const s = x
            return {
              registrationId: uuid(s['registrationId']),
              purpose: enumeration(s['purpose'], ['windows_declared'] as const),
              generation: positive(s['generation']),
              status: s['status'],
              ready: s['ready'],
              parentRegistrationId: uuid(s['parentRegistrationId']),
              parentGeneration: positive(s['parentGeneration']),
            }
          }),
          userContext: nullable(c['userContext'], (x) => {
            const u = x
            return {
              id: uuid(u['id']),
              parentRegistrationId: uuid(u['parentRegistrationId']),
              parentGeneration: positive(u['parentGeneration']),
              registrationStatus: u['registrationStatus'],
            }
          }),
        }
      }),
      (c) => c.channel,
    ),
  enrollments: (value: unknown) =>
    array(value, (x) => {
      if (!wireSchemas.getApiV1DevicesByDeviceResponse.validateEnrollment(x))
        throw new Error('Invalid contract value')

      const e = x
      return {
        enrollmentId: uuid(e['enrollmentId']),
        platform: nullable(e['platform'], (x) => x),
        source: e['source'],
        status: e['status'],
        expiresAt: integer(e['expiresAt']),
      }
    }),
}
function endpointFields(
  v:
    | wireSchemas.getApiV1DevicesResponse.Projection_Item
    | wireSchemas.getApiV1DevicesByDeviceResponse.Root
    | wireSchemas.getApiV1DeviceViewsByKindByIdResponse.Endpoint,
) {
  return {
    id: endpointDirectoryFields.id(v['id']),
    status: endpointDirectoryFields.status(v['status']),
    primaryMdmRegistration: endpointDirectoryFields.primaryMdmRegistration(
      v['primaryMdmRegistration'],
    ),
    channels: endpointDirectoryFields.channels(v['channels']),
    enrollments: endpointDirectoryFields.enrollments(v['enrollments']),
  }
}
export type Endpoint = ReturnType<typeof endpoint>
function support(value: unknown) {
  if (!wireSchemas.getApiV1DevicesByDeviceResponse.validateSupport(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    state: v['state'],
    reason: nullable(v['reason'], (x) => x),
  }
}
export function endpointDetail(value: unknown, id: string) {
  if (!wireSchemas.getApiV1DevicesByDeviceResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  const result = endpointFields(v)
  if (result.id !== id) throw new Error('Wrong endpoint')
  return {
    ...result,
    inventoryAvailable: boolean(v['inventoryAvailable']),
    capabilities: array(v['capabilities'], (x) => {
      const c = x,
        p = c['permission']
      return {
        action: c['action'],
        channel: c['channel'],
        productSupport: support(c['productSupport']),
        devicePrerequisite: support(c['devicePrerequisite']),
        permission: {
          allowed: p['allowed'],
          reason: nullable(p['reason'], (x) => x),
        },
      }
    }),
  }
}
export type EndpointDetail = ReturnType<typeof endpointDetail>
export function currentMember(value: Endpoint, channel: Member['channel']): Member | undefined {
  const c = value.channels.find((c) => c.channel === channel && c.status === 'active')
  return c
    ? { device: value.id, channel, registrationId: c.registrationId, generation: c.generation }
    : undefined
}
