import { randomUUID } from 'node:crypto'
import type { DomainHandler, Scenario } from '../scenario'
import type { createDeviceDemo } from '../devices/state'
import { closed, count, uuid } from '../../src/services/decode'
import {
  decodeNativeOperation,
  type NativeTask,
  decodeNativeTask,
  type NativeOperation,
} from '../../src/features/policies/clients/native'
import type { ExecutionSummary } from '../../src/features/policies/clients/executions'
import { createReceipts, error, ok } from '../http'
export function createNativeDemo(devices: Pick<ReturnType<typeof createDeviceDemo>, 'facts'>) {
  const operations = new Map<string, { device: string; read: NativeOperation; reads: number }>(),
    receipts = createReceipts()
  function validateAdmission(device: string, id: string, task: NativeTask, deadline: number) {
    if (deadline <= Math.floor(Date.now() / 1000)) return error('malformed_request', 400)
    const d = devices.facts().find((d) => d.summary.id === device)
    if (!d) return error('management_device_not_found', 404)
    if (
      !d.summary.channels.includes('mdm') ||
      !d.registrations.some(
        (r) =>
          r.status === 'active' &&
          r.source === (d.summary.platform === 'windows' ? 'mdm.windows' : 'mdm.apple'),
      ) ||
      (d.summary.platform === 'windows' && task.kind.startsWith('profile_')) ||
      (d.summary.platform === 'macos' && !task.kind.startsWith('profile_'))
    )
      return error('action_not_supported', 501)
    if (operations.has(id)) return error('operation_conflict')
    return null
  }
  function admit(
    device: string,
    id: string,
    task: NativeTask,
    deadline: number,
    scenario: Scenario,
  ) {
    const rejected = validateAdmission(device, id, task, deadline)
    if (rejected) return rejected
    const d = devices.facts().find((d) => d.summary.id === device)!
    const read = decodeNativeOperation(
      {
        operationId: id,
        commandId: id,
        revision: 1,
        task,
        deadline,
        authorization: scenario === 'denied' ? 'blocked' : 'approved',
        commandStatus: 'queued',
        observation:
          d.summary.platform === 'macos'
            ? {
                protocol: 'mdm.apple',
                result: 'unknown',
                effect: 'unknown',
                progress: 'unknown',
                observationScope: 'profile_presence',
              }
            : {
                protocol: 'mdm.windows',
                result: 'unknown',
                effect: 'unknown',
                progress: 'unknown',
                receiptAccepted: false,
                writeStatus: null,
              },
      },
      id,
    )
    operations.set(id, { device, read, reads: 0 })
    return ok({ operationId: id, commandId: id, revision: 1, accepted: true }, 202)
  }
  const handle: DomainHandler = (request, scenario) => {
    const match =
      /^\/api\/v1\/devices\/([^/]+)\/operations(?:\/([^/]+)(?:\/(approve|cancel))?)?$/.exec(
        request.path,
      )
    if (!match) return
    try {
      if (scenario === 'denied') return error('permission_denied', 403)
      const device = decodeURIComponent(match[1]!)
      if (!match[2] && request.method === 'POST') {
        const body = closed(request.body, ['operationId', 'task', 'deadline']),
          id = uuid(body['operationId'])
        return receipts.write(request, id, () =>
          admit(device, id, decodeNativeTask(body['task']), count(body['deadline']), scenario),
        )
      }
      const id = uuid(match[2]),
        state = operations.get(id)
      if (!state || state.device !== device) return error('operation_not_found', 404)
      if (request.method === 'GET' && !match[3]) {
        const r = state.read
        if (r.authorization === 'approved' && ['queued', 'published'].includes(r.commandStatus)) {
          r.commandStatus = state.reads++ === 0 ? 'published' : 'received'
          if (r.commandStatus === 'received') {
            const common = {
              result: 'matched' as const,
              effect: 'unknown' as const,
              progress: scenario === 'partial' ? ('failed' as const) : ('succeeded' as const),
              receivedAt: Math.floor(Date.now() / 1000),
            }
            r.observation =
              r.observation.protocol === 'mdm.apple'
                ? {
                    ...common,
                    protocol: 'mdm.apple',
                    observationScope: 'profile_presence',
                    nativeStatus: scenario === 'partial' ? 'Error' : 'Acknowledged',
                  }
                : {
                    ...common,
                    protocol: 'mdm.windows',
                    receiptAccepted: true,
                    writeStatus: scenario === 'partial' ? 500 : 200,
                    attemptId: randomUUID(),
                    attempt: 1,
                    nativeStatus: scenario === 'partial' ? 500 : 200,
                  }
          }
        }
        return ok(structuredClone(r))
      }
      if (request.method !== 'POST' || !match[3]) return
      const body = closed(request.body, ['requestId', 'expectedRevision'])
      return receipts.write(request, uuid(body['requestId']), () => {
        if (count(body['expectedRevision']) !== state.read.revision)
          return error('operation_conflict')
        if (state.read.commandStatus === 'cancelled') return error('operation_conflict')
        if (match[3] === 'cancel') state.read.commandStatus = 'cancelled'
        else state.read.authorization = 'approved'
        state.read.revision++
        return ok({ operationId: id, revision: state.read.revision })
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    admit,
    validateAdmission,
    executions(): ExecutionSummary[] {
      return [...operations.values()].map(({ device, read: r, reads }) => ({
        id: r.operationId,
        batch: null,
        device,
        origin: { kind: 'native', operation: r.operationId },
        admission: r.authorization === 'approved' ? 'accepted' : 'blocked',
        dispatch: reads
          ? 'published'
          : r.commandStatus === 'cancelled'
            ? 'not_requested'
            : 'queued',
        receipt: 'receivedAt' in r.observation ? 'received' : 'not_received',
        execution:
          r.commandStatus === 'cancelled'
            ? 'cancelled'
            : r.observation.progress === 'unknown'
              ? 'not_started'
              : r.observation.progress,
        effect: r.observation.effect === 'verified_present' ? 'verified_present' : 'unverified',
        compliance: 'unknown',
        attempt: 'attemptId' in r.observation ? (r.observation.attemptId ?? null) : null,
        nativeCode: 'nativeStatus' in r.observation ? (r.observation.nativeStatus ?? null) : null,
        waitingReason:
          r.authorization === 'blocked'
            ? 'authorization'
            : r.commandStatus === 'cancelled'
              ? null
              : 'device_receipt',
      }))
    },
    reset() {
      operations.clear()
      receipts.reset()
    },
  }
}
