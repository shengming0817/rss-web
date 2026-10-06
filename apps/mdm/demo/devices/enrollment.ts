import { createRegistrationDemo } from './registration'
import { randomUUID } from 'node:crypto'
import type { DomainHandler } from '../scenario'
import { closed, enumeration, identifier, string, uuid } from '../../src/services/decode'
import { type EnrollmentSource } from '../../src/features/devices/clients/enrollment'
import type { DemoDevice } from './fixtures'
import type { DemoEvent } from '../policies/schedule'
import { createReceipts, error, ok } from '../http'
export interface Enrollment {
  actor?: string
  selfService?: boolean
  enrollmentId: string
  device: string
  status: 'pending' | 'bound' | 'cancelled'
  expiresAt: number
  registrationId: string | null
  source: EnrollmentSource
}
export function createEnrollmentDemo(devices: () => Map<string, DemoDevice>) {
  const enrollments = new Map<string, Enrollment>(),
    receipts = createReceipts()
  function reset() {
    enrollments.clear()
    receipts.reset()
    for (const d of devices().values())
      for (const r of d.registrations) {
        if (r.enrollmentId === null) continue
        enrollments.set(r.enrollmentId, {
          device: d.summary.id,
          enrollmentId: r.enrollmentId,
          status: 'bound',
          expiresAt: 1780000300,
          registrationId: r.registrationId,
          source: r.source,
        })
      }
  }
  reset()
  const view = ({
    device: _device,
    actor: _actor,
    selfService: _selfService,
    ...value
  }: Enrollment) => value
  function password(value: unknown) {
    const result = string(value)
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(result) ||
      Buffer.from(result, 'base64url').toString('base64url') !== result
    )
      throw new Error('Invalid password')
  }
  const handle: DomainHandler = (request) => {
    const { path, method, query } = request
    const enrollmentPath = /^\/api\/v1\/enrollments(?:\/([^/]+)(?:\/(resume|cancel))?)?$/.exec(path)
    const registrations = /^\/api\/v1\/devices\/([^/]+)\/registrations(?:\/([^/]+)\/revoke)?$/.exec(
      path,
    )
    if (!enrollmentPath && !registrations) return registration.handle(request, 'normal')
    if (method === 'GET') {
      if (enrollmentPath?.[1]) {
        const e = enrollments.get(enrollmentPath[1])
        return e && (!e.selfService || e.actor === request.actor.principalId)
          ? ok({
              ...view(e),
              status:
                e.status === 'pending' && e.expiresAt <= Math.floor(Date.now() / 1000)
                  ? 'expired'
                  : e.status,
              instructions:
                e.source === 'mdm.windows'
                  ? {
                      platform: 'windows',
                      server: 'native.demo.invalid',
                      discoveryUrl: 'https://native.demo.invalid/EnrollmentServer/Discovery.svc',
                      username: `${e.enrollmentId}@native.demo.invalid`,
                      windowsProfile: 'Device',
                      requiresLocalAdministrator: false,
                    }
                  : {
                      platform: 'macos',
                      profileUrl: `/api/v1/enrollments/${e.enrollmentId}/profile`,
                      enrollmentMethod: 'profile_based_device_enrollment',
                    },
              progress: {
                profilePrepared: 'unknown',
                certificateIssued: e.status === 'bound',
                firstAuthenticatedCheckIn: false,
                systemConfirmation: 'unknown',
                managementReady: false,
                diagnostic:
                  e.status === 'cancelled'
                    ? 'cancelled'
                    : e.status === 'bound'
                      ? 'awaiting_first_check_in'
                      : e.expiresAt <= Math.floor(Date.now() / 1000)
                        ? 'expired'
                        : 'awaiting_system_confirmation',
              },
            })
          : error('permission_denied', 403)
      }
      if (registrations) {
        const device = devices().get(decodeURIComponent(registrations[1]!))
        if (!device) return error('permission_denied', 403)
        const after = query.get('after')
        const items = device.registrations
          .filter((r) => !after || r.registrationId > after)
          .sort((a, b) => a.registrationId.localeCompare(b.registrationId))
        return ok({
          items: items
            .slice(0, 100)
            .map(({ userContextId, ...r }) => (userContextId ? { ...r, userContextId } : r)),
          nextCursor: items.length > 100 ? items[99]!.registrationId : null,
        })
      }
      return error('malformed_request', 400)
    }
    if (method !== 'POST') return error('malformed_request', 400)
    const operationId = uuid(request.headers['idempotency-key'])
    return receipts.write(request, operationId, () => {
      if (registrations) {
        closed(request.body, [])
        const device = devices().get(decodeURIComponent(registrations[1]!)),
          id = uuid(registrations[2])
        const registration = device?.registrations.find((r) => r.registrationId === id)
        if (!device || !registration) return error('permission_denied', 403)
        registration.status = 'revoked'
        device.summary.channels = [
          ...new Set(
            device.registrations
              .filter((r) => r.status === 'active')
              .map((r) => (r.source === 'agent.builtin' ? ('agent' as const) : ('mdm' as const))),
          ),
        ]
        device.inventory.channels = device.summary.channels
        if (!device.summary.channels.length) device.summary.status = 'revoked'
        device.summary.revision++
        device.history.push({
          id: randomUUID(),
          at: Math.floor(Date.now() / 1000),
          event: 'credential_revoked',
          operation: operationId,
        })
        return ok({ operation_id: operationId, registration: id })
      }
      const id = enrollmentPath?.[1],
        action = enrollmentPath?.[2]
      if (!id) {
        const body = closed(request.body, ['deviceId', 'password', 'source'], ['windowsProfile'])
        const deviceId = identifier(body['deviceId']),
          source = enumeration(body['source'], ['mdm.windows', 'mdm.apple'] as const)
        password(body['password'])
        const enrollmentId = randomUUID()
        let device = devices().get(deviceId)
        if (!device) {
          device = {
            summary: {
              id: deviceId,
              name: deviceId,
              platform:
                source === 'mdm.apple' ? 'macos' : source === 'mdm.windows' ? 'windows' : 'unknown',
              status: 'pending',
              inventoryAvailable: false,
              revision: 1,
              channels: [],
              owner: null,
              department: null,
            },
            inventory: { device: deviceId, channels: [], fields: {}, quality: [], revisions: {} },
            registrations: [],
            enrollments: [],
            history: [],
          }
          devices().set(deviceId, device)
        }
        const enrollment: Enrollment = {
          device: deviceId,
          enrollmentId,
          status: 'pending',
          expiresAt: Math.floor(Date.now() / 1000) + 300,
          registrationId: null,
          source,
        }
        enrollments.set(enrollmentId, enrollment)
        device.enrollments.push(enrollmentId)
        device.history.push({
          id: randomUUID(),
          at: Math.floor(Date.now() / 1000),
          event: 'enrollment_requested',
          operation: operationId,
        })
        return ok({ operationId, ...view(enrollment) })
      }
      const enrollment = enrollments.get(id)
      if (!enrollment || (enrollment.selfService && enrollment.actor !== request.actor.principalId))
        return error('permission_denied', 403)
      if (action === 'resume') {
        if (enrollment.status === 'cancelled') return error('operation_conflict')
        const body = closed(request.body, ['password'])
        password(body['password'])
        if (
          enrollment.selfService &&
          enrollment.status === 'pending' &&
          enrollment.expiresAt <= Math.floor(Date.now() / 1000) &&
          !registration.admit(
            request.actor.principalId,
            enrollment.source === 'mdm.windows' ? 'windows_mdm' : 'macos_mdm',
          )
        )
          return error('registration_limit', 429)
        enrollment.expiresAt = Math.floor(Date.now() / 1000) + 300
      } else if (action === 'cancel') {
        if (enrollment.status !== 'pending') return error('operation_conflict')
        closed(request.body, [])
        enrollment.status = 'cancelled'
      } else return error('malformed_request', 400)
      return ok({ operationId, ...view(enrollment) })
    })
  }
  const registration = createRegistrationDemo(enrollments, devices, handle)
  return {
    handle,
    reset() {
      reset()
      registration.reset()
    },
    tick(event: DemoEvent) {
      if (event.kind !== 'enrollment_bind' || !event.enrollment) return
      const e = enrollments.get(event.enrollment),
        d = e ? devices().get(e.device) : undefined
      if (
        !e ||
        !d ||
        e.device !== event.device ||
        e.status !== 'pending' ||
        event.at >= e.expiresAt ||
        event.at < e.expiresAt - 300
      )
        return
      const generation =
        Math.max(
          0,
          ...d.registrations.filter((r) => r.source === e.source).map((r) => r.generation),
        ) + 1
      for (const r of d.registrations)
        if (r.source === e.source && r.status === 'active') r.status = 'superseded'
      const registrationId = randomUUID()
      d.registrations.push({
        registrationId,
        enrollmentId: e.enrollmentId,
        agentGrantId: null,
        userContextId: null,
        source: e.source,
        generation,
        status: 'active',
      })
      e.status = 'bound'
      e.registrationId = registrationId
      d.summary.channels = [
        ...new Set(
          d.registrations
            .filter((r) => r.status === 'active')
            .map((r) => (r.source === 'agent.builtin' ? ('agent' as const) : ('mdm' as const))),
        ),
      ]
      d.inventory.channels = [...d.summary.channels]
      d.summary.status = 'registered'
      d.summary.revision++
      d.history.push({
        id: randomUUID(),
        at: event.at,
        event: 'registration_bound',
        operation: null,
      })
      // Registration does not invent an Agent wire binding or executable capability.
    },
  }
}
