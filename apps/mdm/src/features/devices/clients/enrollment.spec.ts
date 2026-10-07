import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createEnrollmentClient, decodeEnrollment, generateEnrollmentPassword } from './enrollment'
const operation = '11111111-1111-4111-8111-111111111111'
const id = '22222222-2222-4222-8222-222222222222'
it('generates a fresh canonical 256-bit handoff password', () => {
  const a = generateEnrollmentPassword()
  expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(atob(a.replaceAll('-', '+').replaceAll('_', '/') + '=')).toHaveLength(32)
  expect(generateEnrollmentPassword()).not.toBe(a)
})
it('keeps pending authorization separate from registration and rejects invented completion', () => {
  const response = {
    enrollmentId: id,
    status: 'pending',
    expiresAt: 300,
    registrationId: null,
    source: 'mdm.apple',
    instructions: {
      platform: 'macos',
      profileUrl: `/api/v1/enrollments/${id}/profile`,
      enrollmentMethod: 'profile_based_device_enrollment',
    },
    progress: {
      profilePrepared: 'unknown',
      certificateIssued: false,
      firstAuthenticatedCheckIn: false,
      systemConfirmation: 'unknown',
      managementReady: false,
      diagnostic: 'awaiting_system_confirmation',
    },
  }
  expect(decodeEnrollment(response, id)).toEqual(response)
  expect(() =>
    decodeEnrollment(
      { ...response, instructions: { ...response.instructions, enrollmentMethod: 'password' } },
      id,
    ),
  ).toThrow()
  expect(() => decodeEnrollment({ ...response, status: 'installed' }, id)).toThrow()
  expect(() => decodeEnrollment(response, operation)).toThrow()
})
it('uses the exact enrollment idempotency header and the snake-case revocation receipt', async () => {
  const request = vi.fn(async (o: RequestOptions<unknown>) =>
    o.decode(
      o.path.endsWith('/revoke')
        ? { operation_id: operation, registration: id }
        : {
            operationId: operation,
            enrollmentId: id,
            status: 'pending',
            expiresAt: 300,
            registrationId: null,
            source: 'mdm.windows',
          },
    ),
  )
  const client = createEnrollmentClient({ request } as unknown as HttpTransport)
  await client.create(operation, {
    deviceId: 'device-1',
    password: generateEnrollmentPassword(),
    source: 'mdm.windows',
  })
  expect(request.mock.calls[0]?.[0]).toMatchObject({
    method: 'POST',
    successStatus: 200,
    headers: { 'Idempotency-Key': operation },
  })
  expect(await client.revoke('device-1', id, operation)).toEqual({
    operationId: operation,
    registration: id,
  })
  expect(request).toHaveBeenCalledTimes(2)
})
