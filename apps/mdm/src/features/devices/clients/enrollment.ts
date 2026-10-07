import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  closed,
  count,
  boolean,
  identifier,
  string,
  enumeration,
  integer,
  nullable,
  unique,
  uuid,
} from '../../../services/decode'
export const enrollmentSources = ['mdm.windows', 'mdm.apple', 'agent.builtin'] as const
export type EnrollmentSource = (typeof enrollmentSources)[number]
export interface EnrollmentInput {
  deviceId: string
  password: string
  source: 'mdm.windows' | 'mdm.apple'
  windowsProfile?: 'Full' | 'Device'
}
const statusKeys = ['enrollmentId', 'status', 'expiresAt', 'registrationId', 'source']
function status(value: Record<string, unknown>) {
  return {
    enrollmentId: uuid(value['enrollmentId']),
    status: enumeration(value['status'], ['pending', 'bound', 'cancelled'] as const),
    expiresAt: integer(value['expiresAt']),
    registrationId: nullable(value['registrationId'], uuid),
    source: enumeration(value['source'], enrollmentSources),
  }
}
export function decodeEnrollmentReceipt(value: unknown, id: string) {
  const result = status(closed(value, statusKeys))
  if (result.enrollmentId !== id) throw new Error('Wrong enrollment')
  return result
}
export function decodeEnrollment(value: unknown, id: string) {
  const v = closed(value, [...statusKeys, 'instructions', 'progress'])
  const result = {
    enrollmentId: uuid(v['enrollmentId']),
    status: enumeration(v['status'], ['pending', 'bound', 'cancelled', 'expired'] as const),
    expiresAt: integer(v['expiresAt']),
    registrationId: nullable(v['registrationId'], uuid),
    source: enumeration(v['source'], ['mdm.windows', 'mdm.apple'] as const),
  }
  if (result.enrollmentId !== id) throw new Error('Wrong enrollment')
  const i = closed(
    v['instructions'],
    ['platform'],
    [
      'server',
      'discoveryUrl',
      'username',
      'windowsProfile',
      'requiresLocalAdministrator',
      'profileUrl',
      'managedAccount',
      'enrollmentMethod',
    ],
  )
  const platform = enumeration(i['platform'], [
    'windows',
    'windows_entra',
    'macos',
    'macos_account',
    'macos_ade',
    'unavailable',
  ] as const)
  function https(value: unknown) {
    const raw = string(value),
      url = new URL(raw)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      throw new Error('Invalid native URL')
    return raw
  }
  function instructions() {
    if (platform === 'windows') {
      closed(i, [
        'platform',
        'server',
        'discoveryUrl',
        'username',
        'windowsProfile',
        'requiresLocalAdministrator',
      ])
      return {
        platform,
        server: identifier(i['server']),
        discoveryUrl: https(i['discoveryUrl']),
        username: identifier(i['username']),
        windowsProfile: enumeration(i['windowsProfile'], ['Full', 'Device'] as const),
        requiresLocalAdministrator: boolean(i['requiresLocalAdministrator']),
      }
    }
    if (platform === 'windows_entra') {
      closed(i, ['platform', 'discoveryUrl', 'windowsProfile', 'enrollmentMethod'])
      return {
        platform,
        discoveryUrl: https(i['discoveryUrl']),
        windowsProfile: enumeration(i['windowsProfile'], ['Full', 'Device'] as const),
        enrollmentMethod: enumeration(i['enrollmentMethod'], ['entra_user_credential'] as const),
      }
    }
    if (platform === 'macos') {
      closed(i, ['platform', 'profileUrl', 'enrollmentMethod'])
      const profileUrl = string(i['profileUrl'])
      if (profileUrl !== `/api/v1/enrollments/${id}/profile`)
        throw new Error('Wrong profile locator')
      return {
        platform,
        profileUrl,
        enrollmentMethod: enumeration(i['enrollmentMethod'], [
          'profile_based_device_enrollment',
        ] as const),
      }
    }
    if (platform === 'macos_account') {
      closed(i, ['platform', 'managedAccount', 'enrollmentMethod'])
      return {
        platform,
        managedAccount: identifier(i['managedAccount']),
        enrollmentMethod: enumeration(i['enrollmentMethod'], [
          'account_driven_device_enrollment',
        ] as const),
      }
    }
    if (platform === 'macos_ade') {
      closed(i, ['platform', 'enrollmentMethod'])
      return {
        platform,
        enrollmentMethod: enumeration(i['enrollmentMethod'], [
          'automated_device_enrollment',
        ] as const),
      }
    }
    closed(i, ['platform'])
    return { platform }
  }
  const p = closed(v['progress'], [
    'profilePrepared',
    'certificateIssued',
    'firstAuthenticatedCheckIn',
    'systemConfirmation',
    'managementReady',
    'diagnostic',
  ])
  const observation = (v: unknown) =>
    enumeration(v, ['observed', 'unknown', 'not_applicable'] as const)
  return {
    ...result,
    instructions: instructions(),
    progress: {
      profilePrepared: observation(p['profilePrepared']),
      certificateIssued: boolean(p['certificateIssued']),
      firstAuthenticatedCheckIn: boolean(p['firstAuthenticatedCheckIn']),
      systemConfirmation: observation(p['systemConfirmation']),
      managementReady: boolean(p['managementReady']),
      diagnostic: enumeration(p['diagnostic'], [
        'awaiting_system_confirmation',
        'awaiting_certificate',
        'awaiting_first_check_in',
        'awaiting_device_token',
        'reauthentication_required',
        'expired',
        'cancelled',
        'revoked',
        'superseded',
        'credential_unavailable',
        'channel_unavailable',
        'ready',
      ] as const),
    },
  }
}
function receipt(value: unknown, operationId: string, id?: string) {
  const v = closed(value, ['operationId', ...statusKeys])
  const result = status(v)
  if (uuid(v['operationId']) !== operationId || (id !== undefined && result.enrollmentId !== id))
    throw new Error('Wrong enrollment receipt')
  return { operationId, ...result }
}
export function registration(value: unknown) {
  const v = closed(
    value,
    ['registrationId', 'enrollmentId', 'agentGrantId', 'source', 'generation', 'status'],
    ['userContextId'],
  )
  return {
    registrationId: uuid(v['registrationId']),
    enrollmentId: nullable(v['enrollmentId'], uuid),
    agentGrantId: nullable(v['agentGrantId'], uuid),
    userContextId: v['userContextId'] === undefined ? null : nullable(v['userContextId'], uuid),
    source: enumeration(v['source'], enrollmentSources),
    generation: count(v['generation']),
    status: enumeration(v['status'], ['active', 'superseded', 'revoked'] as const),
  }
}
export function generateEnrollmentPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  try {
    return btoa(String.fromCharCode(...bytes))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '')
  } finally {
    bytes.fill(0)
  }
}
export function createEnrollmentClient(transport: HttpTransport) {
  return {
    create: (operation: string, body: EnrollmentInput) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/enrollments',
        headers: { 'Idempotency-Key': operation },
        body,
        successStatus: 200,
        decode: (v) => {
          const result = receipt(v, operation)
          if (result.source !== body.source) throw new Error('Wrong enrollment source')
          return result
        },
      }),
    status: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/enrollments/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => decodeEnrollment(v, id),
      }),
    resume: (id: string, operation: string, password: string) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/enrollments/{id}/resume',
        pathParams: { id },
        headers: { 'Idempotency-Key': operation },
        body: { password },
        successStatus: 200,
        decode: (v) => receipt(v, operation, id),
      }),
    cancel: (id: string, operation: string) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/enrollments/{id}/cancel',
        pathParams: { id },
        headers: { 'Idempotency-Key': operation },
        body: {},
        successStatus: 200,
        decode: (v) => receipt(v, operation, id),
      }),
    registrations: (device: string, after?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/devices/{device}/registrations',
        pathParams: { device },
        query: { after },
        successStatus: 200,
        decode: (value) => {
          const v = closed(value, ['items', 'nextCursor'])
          return {
            items: unique(array(v['items'], registration), (r) => r.registrationId),
            nextCursor: nullable(v['nextCursor'], uuid),
          }
        },
      }),
    revoke: (device: string, registration: string, operation: string) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/devices/{device}/registrations/{registration}/revoke',
        pathParams: { device, registration },
        headers: { 'Idempotency-Key': operation },
        body: {},
        successStatus: 200,
        decode: (value) => {
          // DeviceService's published receipt deliberately has no camelCase serde rename.
          const v = closed(value, ['operation_id', 'registration'])
          if (uuid(v['operation_id']) !== operation || uuid(v['registration']) !== registration)
            throw new Error('Wrong revocation receipt')
          return { operationId: operation, registration }
        },
      }),
  }
}
