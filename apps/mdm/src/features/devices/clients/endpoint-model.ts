import { source, sourceKey } from '../../settings/clients/profiles'
import { resolvedField } from './asset-model'
import {
  array,
  boolean,
  closed,
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
  const v = closed(value, ['device', 'channel', 'registrationId', 'generation'])
  return {
    device: identifier(v['device']),
    channel: enumeration(v['channel'], channels),
    registrationId: uuid(v['registrationId']),
    generation: positive(v['generation']),
  }
}
export type Member = ReturnType<typeof member>
const endpointKeys = ['id', 'status', 'primaryMdmRegistration', 'channels', 'enrollments']
export function endpoint(value: unknown) {
  return endpointFields(closed(value, endpointKeys, ['inventoryAvailable', 'capabilities']))
}
function person(value: unknown) {
  const v = closed(value, ['tenantId', 'instanceId', 'principalId'])
  return {
    tenantId: uuid(v['tenantId']),
    instanceId: uuid(v['instanceId']),
    principalId: uuid(v['principalId']),
  }
}
export function personDisplay(value: unknown) {
  const v = closed(value, ['login', 'profiles'])
  return {
    login: nullable(v['login'], personText),
    profiles: unique(
      array(v['profiles'], (value) => {
        const p = closed(value, ['source', 'status', 'displayName', 'username'])
        const status = enumeration(p['status'], [
          'available',
          'missing',
          'expired',
          'unavailable',
        ] as const)
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
  const v = closed(
    value,
    [...endpointKeys, 'assetState', 'platform'],
    ['displayName', 'serialNumber', 'registrationUser', 'currentUser'],
  )
  const p = closed(v['platform'], ['state', 'values'])
  const platform = {
    state: enumeration(p['state'], ['known', 'unknown', 'conflict'] as const),
    values: unique(
      array(p['values'], (x) => enumeration(x, ['windows', 'macos'] as const)),
      (x) => x,
    ),
  }
  if (
    (platform.state === 'known' && platform.values.length !== 1) ||
    (platform.state === 'unknown' && platform.values.length !== 0) ||
    (platform.state === 'conflict' && platform.values.length < 2)
  )
    throw new Error('Invalid platform summary')
  const owner =
    v['registrationUser'] === undefined
      ? undefined
      : closed(v['registrationUser'], ['revision', 'user', 'display'])
  const current =
    v['currentUser'] === undefined
      ? undefined
      : closed(v['currentUser'], ['revision', 'state', 'user', 'confirmedAt', 'display'])
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
    assetState: enumeration(v['assetState'], ['active', 'archived', 'deleted'] as const),
    platform,
    displayName: v['displayName'] === undefined ? undefined : resolvedField(v['displayName']),
    serialNumber: v['serialNumber'] === undefined ? undefined : resolvedField(v['serialNumber']),
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
function endpointFields(v: Record<string, unknown>) {
  return {
    id: identifier(v['id']),
    status: enumeration(v['status'], endpointStatuses),
    primaryMdmRegistration: nullable(v['primaryMdmRegistration'], (x) => {
      const p = closed(x, ['registrationId', 'generation', 'source'])
      return {
        registrationId: uuid(p['registrationId']),
        generation: positive(p['generation']),
        source: enumeration(p['source'], ['mdm.windows', 'mdm.apple'] as const),
      }
    }),
    channels: unique(
      array(v['channels'], (x) => {
        const c = closed(x, [
          'registrationId',
          'channel',
          'generation',
          'status',
          'source',
          'platform',
          'lastCommunicationReceivedAt',
          'children',
          'userContext',
        ])
        return {
          registrationId: uuid(c['registrationId']),
          channel: enumeration(c['channel'], channels),
          generation: positive(c['generation']),
          status: enumeration(c['status'], ['active', 'revoked', 'superseded'] as const),
          platform: nullable(c['platform'], (x) => enumeration(x, ['windows', 'macos'] as const)),
          source: enumeration(c['source'], ['mdm.windows', 'mdm.apple', 'agent.builtin'] as const),
          lastCommunicationReceivedAt: nullable(c['lastCommunicationReceivedAt'], integer),
          children: array(c['children'], (x) => {
            const s = closed(x, [
              'registrationId',
              'purpose',
              'generation',
              'status',
              'ready',
              'parentRegistrationId',
              'parentGeneration',
            ])
            return {
              registrationId: uuid(s['registrationId']),
              purpose: enumeration(s['purpose'], ['windows_declared'] as const),
              generation: positive(s['generation']),
              status: enumeration(s['status'], ['active', 'revoked', 'superseded'] as const),
              ready: boolean(s['ready']),
              parentRegistrationId: uuid(s['parentRegistrationId']),
              parentGeneration: positive(s['parentGeneration']),
            }
          }),
          userContext: nullable(c['userContext'], (x) => {
            const u = closed(x, [
              'id',
              'parentRegistrationId',
              'parentGeneration',
              'registrationStatus',
            ])
            return {
              id: uuid(u['id']),
              parentRegistrationId: uuid(u['parentRegistrationId']),
              parentGeneration: positive(u['parentGeneration']),
              registrationStatus: enumeration(u['registrationStatus'], [
                'active',
                'revoked',
                'superseded',
              ] as const),
            }
          }),
        }
      }),
      (c) => c.channel,
    ),
    enrollments: array(v['enrollments'], (x) => {
      const e = closed(x, ['enrollmentId', 'source', 'status', 'expiresAt', 'platform'])
      return {
        enrollmentId: uuid(e['enrollmentId']),
        platform: nullable(e['platform'], (x) => enumeration(x, ['windows', 'macos'] as const)),
        source: enumeration(e['source'], ['mdm.windows', 'mdm.apple', 'agent.builtin'] as const),
        status: enumeration(e['status'], ['pending', 'bound', 'cancelled', 'expired'] as const),
        expiresAt: integer(e['expiresAt']),
      }
    }),
  }
}
export type Endpoint = ReturnType<typeof endpoint>
function support(value: unknown) {
  const v = closed(value, ['state', 'reason'])
  return {
    state: enumeration(v['state'], [
      'supported',
      'unsupported',
      'blocked',
      'unknown',
      'ready',
    ] as const),
    reason: nullable(v['reason'], (x) =>
      enumeration(x, [
        'product_not_configured',
        'not_registered',
        'capability_unknown',
        'capability_not_supported',
        'permission_denied',
      ] as const),
    ),
  }
}
export function endpointDetail(value: unknown, id: string) {
  const v = closed(value, [
    'id',
    'status',
    'primaryMdmRegistration',
    'channels',
    'enrollments',
    'inventoryAvailable',
    'capabilities',
  ])
  const result = endpointFields(v)
  if (result.id !== id) throw new Error('Wrong endpoint')
  return {
    ...result,
    inventoryAvailable: boolean(v['inventoryAvailable']),
    capabilities: array(v['capabilities'], (x) => {
      const c = closed(x, [
          'action',
          'channel',
          'productSupport',
          'devicePrerequisite',
          'permission',
        ]),
        p = closed(c['permission'], ['allowed', 'reason'])
      return {
        action: enumeration(c['action'], ['script', 'software', 'configuration'] as const),
        channel: enumeration(c['channel'], channels),
        productSupport: support(c['productSupport']),
        devicePrerequisite: support(c['devicePrerequisite']),
        permission: {
          allowed: boolean(p['allowed']),
          reason: nullable(p['reason'], (x) =>
            enumeration(x, [
              'product_not_configured',
              'not_registered',
              'capability_unknown',
              'capability_not_supported',
              'permission_denied',
            ] as const),
          ),
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
