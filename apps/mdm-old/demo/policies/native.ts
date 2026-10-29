import type { DomainHandler } from '../scenario'
import type { createDeviceDemo } from '../devices/state'
import { closed, count, uuid } from '../../src/services/decode'
import {
  decodeNativeOperation,
  deviceControlAction,
  type NativeOperation,
} from '../../src/features/policies/clients/native'
import type { Permission } from '../../src/features/operations/clients/authorization'
import { createReceipts, error, ok } from '../http'
export function createNativeDemo(
  devices: Pick<ReturnType<typeof createDeviceDemo>, 'facts'>,
  can: (actor: string, permission: Permission, device: string) => boolean,
) {
  const operations = new Map<
      string,
      {
        device: string
        read: NativeOperation
        registration: string
        generation: number
        dangerous: boolean
        permission: Permission
        reads: number
      }
    >(),
    receipts = createReceipts()
  function currentAuthorization(
    s: NonNullable<ReturnType<typeof operations.get>>,
  ): NativeOperation['authorization'] {
    const reg = devices
      .facts()
      .find((d) => d.summary.id === s.device)
      ?.registrations.find((r) => r.status === 'active' && r.source !== 'agent.builtin')
    return reg?.registrationId === s.registration && reg.generation === s.generation
      ? { state: 'authorized' }
      : { state: 'blocked', reason: 'registration_changed' }
  }
  function eligibility(
    s: NonNullable<ReturnType<typeof operations.get>>,
    actor: string,
  ): NativeOperation['reauthorization'] {
    const reg = devices
      .facts()
      .find((d) => d.summary.id === s.device)
      ?.registrations.find((r) => r.status === 'active' && r.source !== 'agent.builtin')
    const reason = !can(actor, s.permission, s.device)
      ? 'permission_denied'
      : ['cancelled', 'applied', 'rejected', 'timed_out', 'superseded'].includes(
            s.read.commandStatus,
          )
        ? 'terminal'
        : s.read.commandStatus === 'received'
          ? 'already_received'
          : Math.floor(Date.now() / 1000) >= s.read.deadline
            ? 'expired'
            : reg?.registrationId !== s.registration || reg?.generation !== s.generation
              ? 'registration_changed'
              : null
    return reason
      ? { state: 'unavailable', reason }
      : { state: 'available', confirmationRequired: s.dangerous }
  }
  const handle: DomainHandler = (request, scenario) => {
    const m =
      /^\/api\/v1\/devices\/([^/]+)\/operations(?:\/([^/]+)(?:\/(reauthorize|cancel))?)?$/.exec(
        request.path,
      )
    if (!m) return
    try {
      if (scenario === 'denied') return error('permission_denied', 403)
      const device = decodeURIComponent(m[1]!),
        d = devices.facts().find((d) => d.summary.id === device),
        reg = d?.registrations.find((r) => r.status === 'active' && r.source !== 'agent.builtin')
      if (!d || (!reg && !m[2])) return error('management_device_not_found', 404)
      if (!m[2] && request.method === 'POST') {
        if (!reg) return error('management_device_not_found', 404)
        const b = closed(request.body, ['operationId', 'action', 'deadline']),
          id = uuid(b['operationId']),
          a = deviceControlAction(b['action']),
          deadline = count(b['deadline'])
        const permission = a.kind === 'wipe' ? 'device_wipe' : 'device_control'
        if (!can(request.actor.principalId, permission, device))
          return error('permission_denied', 403)
        return receipts.write(request, id, () => {
          if (operations.has(id) || deadline <= Math.floor(Date.now() / 1000))
            return error('operation_conflict')
          if (a.kind === 'lock' && d.summary.platform === 'windows')
            return error('action_not_supported', 501)
          if (
            a.kind !== 'restart' &&
            (a.expectedRegistrationId !== reg.registrationId ||
              a.expectedGeneration !== reg.generation)
          )
            return error('operation_conflict')
          const read = decodeNativeOperation(
            {
              operationId: id,
              commandId: id,
              revision: 1,
              task: {
                platform: d.summary.platform,
                kind: d.summary.platform === 'windows' ? 'sync_ml' : 'command',
                name:
                  d.summary.platform === 'windows'
                    ? 'SyncML'
                    : (
                        {
                          restart: 'RestartDevice',
                          lock: 'DeviceLock',
                          wipe: 'EraseDevice',
                        } as const
                      )[a.kind],
                objects:
                  d.summary.platform === 'windows'
                    ? [
                        a.kind === 'restart'
                          ? './Device/Vendor/MSFT/Reboot/RebootNow'
                          : './Device/Vendor/MSFT/RemoteWipe/doWipe',
                      ]
                    : [],
              },
              target: { kind: 'device' },
              inputVersion: 'device-control-v1',
              deadline,
              dispatchFailure: null,
              authorization: { state: 'authorized' },
              reauthorization: { state: 'available', confirmationRequired: a.kind !== 'restart' },
              commandStatus: 'queued',
              agentInstallation: null,
              observation: {
                protocol: d.summary.platform === 'windows' ? 'syncml' : 'mdm.apple',
                observationScope:
                  d.summary.platform === 'windows' ? 'native_objects' : 'native_command',
                receipts: [],
                progress: 'queued',
                effect: d.summary.platform === 'windows' ? 'waiting' : 'unverified',
              },
            },
            id,
          )
          operations.set(id, {
            device,
            read,
            registration: reg.registrationId,
            generation: reg.generation,
            dangerous: a.kind !== 'restart',
            permission,
            reads: 0,
          })
          return ok({ operationId: id, commandId: id, revision: 1, accepted: true }, 202)
        })
      }
      const id = uuid(m[2]),
        s = operations.get(id)
      if (!s || s.device !== device) return error('operation_not_found', 404)
      const permission =
        request.method === 'GET'
          ? 'operation_read'
          : m[3] === 'cancel'
            ? 'operation_cancel'
            : s.permission
      if (!can(request.actor.principalId, permission, device))
        return error('permission_denied', 403)
      if (request.method === 'GET' && !m[3]) {
        s.read.authorization = currentAuthorization(s)
        if (
          s.read.authorization.state === 'authorized' &&
          ['queued', 'published'].includes(s.read.commandStatus)
        ) {
          s.read.commandStatus = s.reads++ === 0 ? 'published' : 'received'
          if (s.read.commandStatus === 'received')
            s.read.observation.progress = scenario === 'partial' ? 'failed' : 'succeeded'
        }
        s.read.reauthorization = eligibility(s, request.actor.principalId)
        return ok(structuredClone(s.read))
      }
      if (request.method !== 'POST' || !m[3]) return
      const b = closed(
        request.body,
        ['requestId', 'expectedRevision'],
        m[3] === 'reauthorize' ? ['confirmation'] : [],
      )
      return receipts.write(request, uuid(b['requestId']), () => {
        if (
          count(b['expectedRevision']) !== s.read.revision ||
          ['cancelled', 'applied', 'rejected', 'timed_out', 'superseded'].includes(
            s.read.commandStatus,
          ) ||
          (m[3] === 'reauthorize' && s.read.commandStatus === 'received') ||
          Math.floor(Date.now() / 1000) >= s.read.deadline
        )
          return error('operation_conflict')
        if (m[3] === 'cancel') s.read.commandStatus = 'cancelled'
        else {
          if (
            s.registration !== reg?.registrationId ||
            s.generation !== reg?.generation ||
            ['applied', 'received', 'rejected', 'timed_out', 'superseded'].includes(
              s.read.commandStatus,
            )
          )
            return error('operation_conflict')
          if (s.dangerous) {
            const c = closed(b['confirmation'], [
              'confirmed',
              'expectedRegistrationId',
              'expectedGeneration',
            ])
            if (
              c['confirmed'] !== true ||
              c['expectedRegistrationId'] !== s.registration ||
              c['expectedGeneration'] !== s.generation
            )
              return error('operation_conflict')
          }
          s.read.authorization = { state: 'authorized' }
        }
        s.read.revision++
        return ok({ operationId: id, revision: s.read.revision })
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    directory(actor: string) {
      return [...operations.values()].map((s) => ({
        id: s.read.operationId,
        kind: 'command' as const,
        device: s.device,
        registrationId: s.registration,
        generation: s.generation,
        origin: 'direct',
        policy: null,
        deadline: s.read.deadline,
        authorization: currentAuthorization(s),
        reauthorization: eligibility(s, actor),
        status: s.read.commandStatus,
        detailUrl: `/api/v1/devices/${encodeURIComponent(s.device)}/operations/${s.read.operationId}`,
        evidence: {
          commandStatus: s.read.commandStatus,
          observation: s.read.observation,
          dispatchFailure: s.read.dispatchFailure,
          agentInstallation: s.read.agentInstallation,
        },
      }))
    },
    reset() {
      operations.clear()
      receipts.reset()
    },
  }
}
