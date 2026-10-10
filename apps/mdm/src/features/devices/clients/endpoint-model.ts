import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  identifier,
  integer,
  nullable,
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
export function endpoint(value: unknown) {
  const v = closed(
    value,
    ['id', 'status', 'primaryMdmRegistration', 'channels', 'enrollments'],
    ['inventoryAvailable', 'capabilities'],
  )
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
          'children',
          'userContext',
        ])
        return {
          registrationId: uuid(c['registrationId']),
          channel: enumeration(c['channel'], channels),
          generation: positive(c['generation']),
          status: enumeration(c['status'], ['active', 'revoked', 'superseded'] as const),
          source: enumeration(c['source'], ['mdm.windows', 'mdm.apple', 'agent.builtin'] as const),
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
      const e = closed(x, ['enrollmentId', 'source', 'status', 'expiresAt'])
      return {
        enrollmentId: uuid(e['enrollmentId']),
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
  const result = endpoint(v)
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
