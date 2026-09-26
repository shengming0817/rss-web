import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  closed,
  count,
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
  source: EnrollmentSource
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
export function decodeEnrollment(value: unknown, id: string) {
  const result = status(closed(value, statusKeys))
  if (result.enrollmentId !== id) throw new Error('Wrong enrollment')
  return result
}
function receipt(value: unknown, operationId: string, id?: string) {
  const v = closed(value, ['operationId', ...statusKeys])
  const result = status(v)
  if (uuid(v['operationId']) !== operationId || (id !== undefined && result.enrollmentId !== id))
    throw new Error('Wrong enrollment receipt')
  return { operationId, ...result }
}
export function registration(value: unknown) {
  const v = closed(value, ['registrationId', 'enrollmentId', 'source', 'generation', 'status'])
  return {
    registrationId: uuid(v['registrationId']),
    enrollmentId: uuid(v['enrollmentId']),
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
        path: '/api/v3/enrollments',
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
        path: '/api/v3/enrollments/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => decodeEnrollment(v, id),
      }),
    resume: (id: string, operation: string, password: string) =>
      transport.request({
        method: 'POST',
        path: '/api/v3/enrollments/{id}/resume',
        pathParams: { id },
        headers: { 'Idempotency-Key': operation },
        body: { password },
        successStatus: 200,
        decode: (v) => receipt(v, operation, id),
      }),
    cancel: (id: string, operation: string) =>
      transport.request({
        method: 'POST',
        path: '/api/v3/enrollments/{id}/cancel',
        pathParams: { id },
        headers: { 'Idempotency-Key': operation },
        body: {},
        successStatus: 200,
        decode: (v) => receipt(v, operation, id),
      }),
    registrations: (device: string, after?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v3/devices/{device}/registrations',
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
        path: '/api/v3/devices/{device}/registrations/{registration}/revoke',
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
