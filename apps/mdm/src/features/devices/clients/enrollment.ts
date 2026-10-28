import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import { windowParameters, windowPage, type WindowQuery } from '../../../services/directory-query'
import type { HttpTransport } from '@rss/api/mdm'
import {
  count,
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
type EnrollmentStatusWire = Pick<
  wireSchemas.postApiV1EnrollmentsResponse.Root,
  'enrollmentId' | 'status' | 'expiresAt' | 'registrationId'
> & {
  source: NonNullable<
    wireSchemas.getApiV1DevicesByDeviceRegistrationsResponse.Projection_Row['source']
  >
}
function status(value: EnrollmentStatusWire) {
  return {
    enrollmentId: uuid(value['enrollmentId']),
    status: enumeration(value['status'], ['pending', 'bound', 'cancelled'] as const),
    expiresAt: integer(value['expiresAt']),
    registrationId: nullable(value['registrationId'], uuid),
    source: value['source'],
  }
}
export function decodeEnrollmentReceipt(value: EnrollmentStatusWire, id: string) {
  const result = status(value)
  if (result.enrollmentId !== id) throw new Error('Wrong enrollment')
  return result
}
export function decodeEnrollment(value: unknown, id: string) {
  if (!wireSchemas.getApiV1EnrollmentsByIdResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  const result = {
    enrollmentId: uuid(v['enrollmentId']),
    status: v['status'],
    expiresAt: integer(v['expiresAt']),
    registrationId: nullable(v['registrationId'], uuid),
    source: enumeration(v['source'], ['mdm.windows', 'mdm.apple'] as const),
  }
  if (result.enrollmentId !== id) throw new Error('Wrong enrollment')
  const i = v['instructions']
  const platform = i['platform']
  function https(value: unknown) {
    const raw = string(value),
      url = new URL(raw)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      throw new Error('Invalid native URL')
    return raw
  }
  function instructions() {
    if (platform === 'windows') {
      return {
        platform,
        server: identifier(i['server']),
        discoveryUrl: https(i['discoveryUrl']),
        username: identifier(i['username']),
        windowsProfile: i['windowsProfile'],
        requiresLocalAdministrator: i['requiresLocalAdministrator'],
      }
    }
    if (platform === 'windows_entra') {
      return {
        platform,
        discoveryUrl: https(i['discoveryUrl']),
        windowsProfile: i['windowsProfile'],
        enrollmentMethod: enumeration(i['enrollmentMethod'], ['entra_user_credential'] as const),
      }
    }
    if (platform === 'macos') {
      const profileUrl = string(i['profileUrl'])
      if (profileUrl !== api.postApiV1EnrollmentsByIdProfile.url({ id }))
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
      return {
        platform,
        managedAccount: identifier(i['managedAccount']),
        enrollmentMethod: enumeration(i['enrollmentMethod'], [
          'account_driven_device_enrollment',
        ] as const),
      }
    }
    if (platform === 'macos_ade') {
      return {
        platform,
        enrollmentMethod: enumeration(i['enrollmentMethod'], [
          'automated_device_enrollment',
        ] as const),
      }
    }

    return { platform }
  }
  const p = v['progress']
  const observation = (v: unknown) =>
    enumeration(v, ['observed', 'unknown', 'not_applicable'] as const)
  return {
    ...result,
    instructions: instructions(),
    progress: {
      profilePrepared: observation(p['profilePrepared']),
      certificateIssued: p['certificateIssued'],
      firstAuthenticatedCheckIn: p['firstAuthenticatedCheckIn'],
      systemConfirmation: observation(p['systemConfirmation']),
      managementReady: p['managementReady'],
      diagnostic: p['diagnostic'],
    },
  }
}
function receipt(value: unknown, operationId: string, id?: string) {
  if (!wireSchemas.postApiV1EnrollmentsResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  const result = status(v)
  if (uuid(v['operationId']) !== operationId || (id !== undefined && result.enrollmentId !== id))
    throw new Error('Wrong enrollment receipt')
  return { operationId, ...result }
}
export function registration(value: unknown) {
  if (!wireSchemas.getApiV1DevicesByDeviceRegistrationsResponse.validateProjection_Row(value))
    throw new Error('Invalid contract value')

  const v = value
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
/** Microsoft native handoff: use only the server-issued protocol identity, never a login hint. */
export function windowsEnrollmentLink(instructions: {
  platform: string
  username?: string
  discoveryUrl?: string
  server?: string
  windowsProfile?: string
}): string | undefined {
  if (
    instructions.platform !== 'windows' ||
    instructions.windowsProfile !== 'Full' ||
    !instructions.username ||
    !instructions.server
  )
    return undefined
  const server = new URL(instructions.server)
  if (
    server.protocol !== 'https:' ||
    server.username ||
    server.password ||
    server.search ||
    server.hash ||
    server.pathname !== '/'
  )
    throw new Error('Invalid native URL')
  return `ms-device-enrollment:?${new URLSearchParams({
    mode: 'mdm',
    username: instructions.username,
    servername: instructions.server,
  })}`
}
export function createEnrollmentClient(transport: HttpTransport) {
  return {
    create: (operation: string, body: EnrollmentInput) =>
      api.postApiV1Enrollments(
        transport,
        { headers: { 'Idempotency-Key': operation }, body },
        (v) => {
          const result = receipt(v, operation)
          if (result.source !== body.source) throw new Error('Wrong enrollment source')
          return result
        },
      ),
    status: (id: string) =>
      api.getApiV1EnrollmentsById(transport, { pathParams: { id } }, (v) =>
        decodeEnrollment(v, id),
      ),
    resume: (id: string, operation: string, password: string) =>
      api.postApiV1EnrollmentsByIdResume(
        transport,
        { pathParams: { id }, headers: { 'Idempotency-Key': operation }, body: { password } },
        (v) => receipt(v, operation, id),
      ),
    cancel: (id: string, operation: string) =>
      api.postApiV1EnrollmentsByIdCancel(
        transport,
        { pathParams: { id }, headers: { 'Idempotency-Key': operation }, body: {} },
        (v) => receipt(v, operation, id),
      ),
    registrations: (device: string, page: WindowQuery = {}) =>
      api.getApiV1DevicesByDeviceRegistrations(
        transport,
        { pathParams: { device }, query: windowParameters({ limit: 20, ...page }, 1000) },
        (value) => {
          const page = windowPage(value, registration)
          return { ...page, items: unique(page.items, (r) => r.registrationId) }
        },
      ),
    revoke: (device: string, registration: string, operation: string) =>
      api.postApiV1DevicesByDeviceRegistrationsByRegistrationRevoke(
        transport,
        {
          pathParams: { device, registration },
          headers: { 'Idempotency-Key': operation },
          body: {},
        },
        (value) => {
          // DeviceService's published receipt deliberately has no camelCase serde rename.
          const v = value
          if (uuid(v['operation_id']) !== operation || uuid(v['registration']) !== registration)
            throw new Error('Wrong revocation receipt')
          return { operationId: operation, registration }
        },
      ),
  }
}
