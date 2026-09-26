import { randomUUID } from 'node:crypto'
import type { DomainHandler } from '../scenario'
import type { createDeviceDemo } from '../devices/state'
import type { createResourceDemo } from './resources'
import { closed, record, uuid } from '../../src/services/decode'
import {
  decodeScriptPlan,
  type ScriptPlan,
  type ScriptRun,
} from '../../src/features/policies/clients/scripts'
import type { ExecutionSummary } from '../../src/features/policies/clients/executions'
import { createReceipts, error, ok } from '../http'
export function createScriptDemo(
  devices: Pick<ReturnType<typeof createDeviceDemo>, 'facts'>,
  resources: Pick<ReturnType<typeof createResourceDemo>, 'read'>,
) {
  const plans = new Map<
      string,
      { author: string; read: ScriptPlan; runs: ScriptRun[]; reads: Map<string, number> }
    >(),
    receipts = createReceipts()
  const handle: DomainHandler = (request, scenario) => {
    const match =
      /^\/api\/v3\/script-plans(?:\/([^/]+)(?:\/(approve|cancel|runs)(?:\/([^/]+))?)?)?$/.exec(
        request.path,
      )
    if (!match) return
    try {
      if (scenario === 'denied') return error('permission_denied', 403)
      if (!match[1] && request.method === 'POST') {
        const body = record(request.body),
          operationId = uuid(body['operationId'])
        return receipts.write(request, operationId, () => {
          const resource =
            typeof body['resource'] === 'string' ? resources.read(body['resource']) : null
          const version = resource?.versions.find((v) => v.id === body['version']),
            variant = version?.variants.find(
              (v) =>
                v.key === body['variant'] &&
                v.platform === body['platform'] &&
                v.architecture === body['architecture'],
            )
          if (!version || version.state !== 'active' || variant?.declaration.kind !== 'script')
            return error('operation_conflict')
          const id = randomUUID(),
            artifact = variant.declaration.artifact
          const read = decodeScriptPlan(
            {
              planId: id,
              revision: 1,
              active: true,
              approved: false,
              definition: {
                input: body,
                definition: variant.declaration.definition,
                resourceDigest: version.digest,
                artifactReference: artifact.reference,
                content: { length: artifact.length, sha256: artifact.sha256 },
              },
              runsUrl: `/api/v3/script-plans/${id}/runs`,
            },
            id,
          )
          const input = read.definition.input,
            facts = devices.facts(),
            schedule = input.schedule
          if (
            !input.devices.length ||
            input.runLifetimeSeconds < 1 ||
            input.runLifetimeSeconds > 86400 ||
            schedule.until <= schedule.notBefore ||
            schedule.jitterSeconds > 3600
          )
            return error('malformed_request', 400)
          const trigger = schedule.trigger
          if (
            (trigger.kind === 'interval' && trigger.seconds < 1) ||
            (trigger.kind === 'weekly' && (trigger.weekday > 6 || trigger.minute > 1439)) ||
            (trigger.kind === 'check_in' && trigger.minimumSeconds < 1)
          )
            return error('malformed_request', 400)
          if (
            schedule.window &&
            (!schedule.window.weekdays.length ||
              schedule.window.weekdays.some((d) => d > 6) ||
              schedule.window.startMinute > 1439 ||
              schedule.window.endMinute > 1440 ||
              schedule.window.startMinute === schedule.window.endMinute)
          )
            return error('malformed_request', 400)
          for (const device of input.devices) {
            const d = facts.find((d) => d.summary.id === device)
            if (
              !d ||
              d.summary.platform !== input.platform ||
              !d.registrations.some((r) => r.status === 'active')
            )
              return error('operation_conflict')
          }
          plans.set(id, { author: request.actor.principalId, read, runs: [], reads: new Map() })
          return ok(
            {
              operationId,
              planId: id,
              revision: 1,
              authorization: 'pending_review',
              targetCount: input.devices.length,
              nextStage: 'review',
            },
            202,
          )
        })
      }
      const id = uuid(match[1]),
        state = plans.get(id)
      if (!state) return error('operation_not_found', 404)
      if (request.method === 'GET') {
        if (!match[2]) return ok(structuredClone(state.read))
        if (match[2] !== 'runs') return
        if (match[3]) {
          const run = state.runs.find((r) => r.taskId === match[3])
          if (!run) return error('operation_not_found', 404)
          if (run.state.cancellation === 'none' && run.result === null) {
            const reads = state.reads.get(run.taskId) ?? 0
            state.reads.set(run.taskId, reads + 1)
            const now = Math.floor(Date.now() / 1000)
            if (run.state.delivery.kind === 'queued')
              run.state.delivery = { kind: 'claimed', attempt: randomUUID(), leaseUntil: now + 60 }
            run.state.execution = 'running'
            run.state.startedAt ??= now
            if (reads > 0) {
              run.state.delivery.kind = 'received'
              run.state.execution = scenario === 'partial' ? 'failed' : 'succeeded'
              run.result = {
                exitCode: scenario === 'partial' ? 1 : 0,
                quality: scenario === 'partial' ? 'failed' : 'complete',
                schemaValid: false,
                trusted: false,
                output:
                  state.read.definition.definition.profile === 'osquery_info_v1'
                    ? [{ version: '5.12.1' }]
                    : { simulation: true },
                diagnostics: {
                  durationMs: 25,
                  executedAt: now,
                  failure: scenario === 'partial' ? 'non_zero_exit' : null,
                  stdout: 'Synthetic demo output; no device executed this script.\n',
                  stderr: scenario === 'partial' ? 'Synthetic execution failure.\n' : '',
                },
              }
            }
          }
          return ok(structuredClone(run))
        }
        const afterAt = request.query.get('afterAt'),
          afterId = request.query.get('afterId')
        if ((afterAt === null) !== (afterId === null)) return error('malformed_request', 400)
        const sorted = [...state.runs].sort(
          (a, b) => a.availableAt - b.availableAt || a.taskId.localeCompare(b.taskId),
        )
        const index =
          afterId === null
            ? -1
            : sorted.findIndex((r) => r.taskId === afterId && r.availableAt === Number(afterAt))
        if (afterId !== null && index < 0) return error('malformed_request', 400)
        const page = sorted.slice(index + 1, index + 21),
          last = page.at(-1)
        const items = page.map((r) => {
          const { planId, ...item } = r
          if (planId !== id) throw new Error('Wrong run owner')
          const result =
            r.result === null
              ? null
              : {
                  exitCode: r.result.exitCode,
                  quality: r.result.quality,
                  schemaValid: r.result.schemaValid,
                  trusted: r.result.trusted,
                  diagnostics: {
                    durationMs: r.result.diagnostics.durationMs,
                    executedAt: r.result.diagnostics.executedAt,
                    failure: r.result.diagnostics.failure,
                  },
                }
          return { ...item, occurrence: 1, result }
        })
        return ok({
          items,
          nextCursor: last ? { availableAt: last.availableAt, taskId: last.taskId } : null,
        })
      }
      if (request.method !== 'POST' || !['approve', 'cancel'].includes(match[2] ?? '')) return
      const body = closed(request.body, ['operationId'])
      return receipts.write(request, uuid(body['operationId']), () => {
        if (match[2] === 'approve') {
          if (state.author === request.actor.principalId) return error('permission_denied', 403)
          if (!state.read.active || state.read.approved) return error('operation_conflict')
          const input = state.read.definition.input,
            facts = devices.facts()
          const targets = input.devices.map((id) => facts.find((d) => d.summary.id === id))
          if (targets.some((d) => !d?.registrations.some((r) => r.status === 'active')))
            return error('operation_conflict')
          state.read.approved = true
          // Synthetic server admits manual occurrences. Calendar/device triggers remain waiting;
          // the browser never runs a scheduler or manufactures device receipts.
          if (input.schedule.trigger.kind === 'manual' && !input.schedule.window) {
            const now = Math.floor(Date.now() / 1000)
            state.runs = targets.map((d) => {
              const registration = d!.registrations.find((r) => r.status === 'active')!
              const deadline = now + input.runLifetimeSeconds
              return {
                taskId: randomUUID(),
                planId: id,
                device: d!.summary.id,
                registrationId: registration.registrationId,
                generation: registration.generation,
                availableAt: now,
                deadline,
                state: {
                  delivery: { kind: 'queued' },
                  execution: 'not_started',
                  cancellation: 'none',
                  deadline,
                  startedAt: null,
                },
                effect: 'unverified',
                result: null,
              }
            })
          }
          return ok({ planId: id, revision: 1, authorization: 'approved' })
        }
        state.read.active = false
        for (const run of state.runs) run.state.cancellation = 'requested'
        return ok({ planId: id, cancelRequested: true })
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    references: (resource: string, version: string) =>
      [...plans.values()].some(
        (p) =>
          p.read.active &&
          p.read.definition.input.resource === resource &&
          p.read.definition.input.version === version,
      ),
    list: () =>
      [...plans.values()].map((p) => ({
        id: p.read.planId,
        label: p.read.definition.input.resource,
        revision: 1,
        status: !p.read.active
          ? ('cancelled' as const)
          : p.read.approved
            ? ('approved' as const)
            : ('pending_review' as const),
      })),
    approvals: () =>
      [...plans.values()]
        .filter((p) => p.read.active && !p.read.approved)
        .map((p) => ({
          kind: 'script' as const,
          id: p.read.planId,
          run: null,
          revision: 1,
          author: p.author,
          label: p.read.definition.input.resource,
        })),
    executions(): ExecutionSummary[] {
      return [...plans.values()].flatMap((p) =>
        p.runs.map((r) => ({
          id: r.taskId,
          batch: p.read.planId,
          device: r.device,
          origin: { kind: 'script', plan: p.read.planId, task: r.taskId },
          admission: 'accepted',
          dispatch: r.state.delivery.kind === 'queued' ? 'queued' : 'published',
          receipt: r.state.delivery.kind === 'received' ? 'received' : 'not_received',
          execution: r.state.execution,
          effect: r.effect,
          compliance: 'unknown',
          attempt: r.state.delivery.kind === 'queued' ? null : r.state.delivery.attempt,
          nativeCode: r.result?.exitCode ?? null,
          waitingReason:
            r.state.cancellation === 'requested' ? 'cancel_confirmation' : 'device_receipt',
        })),
      )
    },
    reset() {
      plans.clear()
      receipts.reset()
    },
  }
}
