import { randomUUID } from 'node:crypto'
import type { DomainHandler, Scenario } from '../scenario'
import type { createDeviceDemo } from '../devices/state'
import type { createScopeDemo } from './scopes'
import type { createResourceDemo } from './resources'
import type { createConfigurationDemo } from './configurations'
import {
  workflowDefinition,
  type Workflow,
  type WorkflowRun,
} from '../../src/features/policies/clients/workflows'
import type { ExecutionSummary } from '../../src/features/policies/clients/executions'
import { closed, enumeration, record, uuid } from '../../src/services/decode'
import { evaluate } from '../devices/criteria'
import { createPages, createReceipts, error, operation } from '../http'
import { validateSchedule } from '../../src/features/policies/clients/schedule'
import { due, type DemoEvent, type Occurrence } from './schedule'
import { candidate } from './http'
interface RunState {
  approvedAt: number
  occurrence: Occurrence | null
  read: WorkflowRun
  step: number
  executions: ExecutionSummary[]
  conditions: Record<string, Record<string, 'match' | 'no_match' | 'unknown'>>
  references: { resource: string; version: string }[]
  configurations: { id: string; version: number }[]
}
export function createWorkflowDemo(
  devices: Pick<ReturnType<typeof createDeviceDemo>, 'facts'>,
  scopes: Pick<ReturnType<typeof createScopeDemo>, 'freeze'>,
  resources: Pick<ReturnType<typeof createResourceDemo>, 'read'>,
  configurations: Pick<ReturnType<typeof createConfigurationDemo>, 'read'>,
) {
  const workflows = new Map<string, Workflow>(),
    runs = new Map<string, RunState>(),
    receipts = createReceipts(),
    pages = createPages()
  let clock = Math.floor(Date.now() / 1000)
  function tick(event: DemoEvent) {
    if (event.at < clock) return
    clock = event.at
    for (const state of runs.values()) {
      const run = state.read
      if (run.state === 'cancel_requested') {
        run.state = 'cancelled'
        run.revision++
        for (const execution of state.executions) {
          if (execution.execution === 'not_started' || execution.execution === 'running')
            execution.execution = 'cancelled'
          execution.waitingReason = null
        }
        continue
      }
      if (run.state !== 'waiting' || run.approval === 'pending') continue
      if (event.kind !== 'clock' && !run.targets.includes(event.device ?? '')) continue
      state.occurrence ??= due(
        run.definition.schedule,
        state.approvedAt,
        state.approvedAt - 1,
        event,
        run.id,
      )
      const occurrence = state.occurrence
      if (
        occurrence &&
        clock >= occurrence.availableAt &&
        clock <
          Math.min(
            occurrence.windowEnd ?? run.definition.schedule.until,
            run.definition.schedule.until,
          )
      ) {
        run.state = 'running'
        run.revision++
      }
    }
  }
  function completedState(state: RunState) {
    return state.executions.some((e) => e.execution === 'failed' || e.execution === 'unknown')
      ? ('partial' as const)
      : ('completed' as const)
  }
  function advance(state: RunState, scenario: Scenario) {
    const run = state.read
    if (run.state !== 'running' || run.approval === 'pending') return
    if (
      Math.max(clock, Math.floor(Date.now() / 1000)) >=
      Math.min(
        state.occurrence?.windowEnd ?? run.definition.schedule.until,
        run.definition.schedule.until,
      )
    ) {
      run.state = 'unknown'
      run.revision++
      return
    }
    const step = run.definition.steps[state.step]
    if (!step) {
      run.state = completedState(state)
      run.revision++
      return
    }
    if (step.action.kind === 'approval') {
      state.step++
      run.approval = 'pending'
      run.state = 'waiting'
      run.revision++
      return
    }
    let failure = false
    let uncertain = false
    for (const device of run.targets) {
      const condition = state.conditions[step.id]![device]
      if (condition === 'no_match') continue
      const failed = scenario === 'partial' && device === run.targets[0]
      const unknown = condition === 'unknown' || scenario === 'unknown'
      failure ||= failed || unknown
      uncertain ||= unknown
      const id = randomUUID()
      state.executions.push({
        id,
        batch: run.id,
        device,
        origin: { kind: 'workflow', workflow: run.workflow, run: run.id, step: step.id },
        admission: unknown ? 'blocked' : 'accepted',
        dispatch: unknown ? 'not_requested' : 'published',
        receipt: unknown ? 'not_received' : 'received',
        execution: unknown ? 'unknown' : failed ? 'failed' : 'succeeded',
        effect: 'unverified',
        compliance: 'unknown',
        attempt: unknown ? null : randomUUID(),
        nativeCode: null,
        waitingReason: unknown ? 'capability' : 'effect_verification',
      })
      run.executions.push(id)
    }
    state.step++
    run.revision++
    if (uncertain) run.state = 'unknown'
    else if (failure && step.onFailure === 'stop') run.state = 'partial'
    else if (failure && step.onFailure === 'approval') {
      run.state = 'waiting'
      run.approval = 'pending'
    } else if (state.step === run.definition.steps.length) run.state = completedState(state)
  }
  const handle: DomainHandler = (request, scenario) => {
    const match =
      /^\/api\/v1\/mdm-candidate\/policies\/workflows\/([^/]+)(?:\/runs(?:\/([^/]+)(?:\/(approve|cancel|reapprove))?)?)?$/.exec(
        request.path,
      )
    if (!match) return
    try {
      if (scenario === 'denied') return error('permission_denied', 403)
      const id = uuid(match[1]),
        workflow = workflows.get(id),
        runId = match[2],
        state = runId ? runs.get(runId) : undefined,
        runPath = request.path.includes('/runs')
      if (runId && (!state || state.read.workflow !== id)) return error('operation_not_found', 404)
      if (request.method === 'GET') {
        if (!workflow) return error('resource_not_found', 404)
        if (state) {
          advance(state, scenario)
          return candidate({ run: structuredClone(state.read) })
        }
        if (runPath)
          return candidate(
            pages.page(
              request.path,
              [...runs.values()].filter((r) => r.read.workflow === id).map((r) => r.read),
              request.query,
            ),
          )
        return candidate({ workflow: structuredClone(workflow) })
      }
      if (request.method !== 'POST') return
      const op = operation(request.body)
      return receipts.write(request, op.operationId, () => {
        if (state) {
          closed(op.input, [])
          if (op.expectedRevision !== state.read.revision) return error('operation_conflict')
          if (match[3] === 'cancel') {
            if (
              ['cancel_requested', 'cancelled', 'completed', 'partial'].includes(state.read.state)
            )
              return error('operation_conflict')
            state.read.state = 'cancel_requested'
            state.read.revision++
            for (const execution of state.executions)
              execution.waitingReason = 'cancel_confirmation'
          } else if (match[3] === 'approve' || match[3] === 'reapprove') {
            if (state.read.author === request.actor.principalId)
              return error('permission_denied', 403)
            if (
              state.read.approval !== 'pending' ||
              ['cancel_requested', 'cancelled', 'completed', 'partial', 'unknown'].includes(
                state.read.state,
              )
            )
              return error('operation_conflict')
            if (
              state.references.some(
                (r) =>
                  resources.read(r.resource)?.versions.find((v) => v.id === r.version)?.state !==
                  'active',
              ) ||
              state.configurations.some(
                (r) =>
                  configurations.read(r.id)?.versions.find((v) => v.version === r.version)
                    ?.status !== 'published',
              )
            )
              return error('operation_conflict')
            state.read.approval = 'approved'
            state.read.revision++
            state.approvedAt ||= Math.max(clock, Math.floor(Date.now() / 1000))
            state.read.state = 'waiting'
            tick({ kind: 'clock', at: Math.max(clock, Math.floor(Date.now() / 1000)) })
          } else return error('malformed_request', 400)
          return candidate({ run: structuredClone(state.read) })
        }
        if (op.expectedRevision !== (workflow?.revision ?? 0)) return error('operation_conflict')
        if (runPath) {
          closed(op.input, [])
          if (!workflow || workflow.status !== 'active') return error('operation_conflict')
          const scope = scopes.freeze(workflow.definition.scope)
          if (!scope) return error('operation_conflict')
          const refs: RunState['references'] = [],
            configs: RunState['configurations'] = []
          for (const step of workflow.definition.steps) {
            const action = step.action
            if (action.kind === 'script' || action.kind === 'repair') {
              const version = resources
                .read(action.resource)
                ?.versions.find((v) => v.id === action.version)
              if (
                version?.state !== 'active' ||
                !version.variants.some(
                  (v) => v.key === action.variant && v.declaration.kind === 'script',
                )
              )
                return error('operation_conflict')
              refs.push({ resource: action.resource, version: action.version })
            } else if (action.kind === 'configuration') {
              if (
                configurations
                  .read(action.configuration)
                  ?.versions.find((v) => v.version === action.version)?.status !== 'published'
              )
                return error('operation_conflict')
              configs.push({ id: action.configuration, version: action.version })
            }
          }
          const facts = devices.facts(),
            conditions = Object.fromEntries(
              workflow.definition.steps.map((step) => [
                step.id,
                Object.fromEntries(
                  scope.members.map((id) => {
                    const d = facts.find((d) => d.summary.id === id)
                    return [
                      id,
                      d ? evaluate(step.condition, d.inventory).decision : ('unknown' as const),
                    ]
                  }),
                ),
              ]),
            )
          const read: WorkflowRun = {
            id: op.operationId,
            workflow: id,
            revision: 1,
            version: workflow.version,
            author: request.actor.principalId,
            approval: 'not_required',
            state: 'waiting',
            definition: structuredClone(workflow.definition),
            scopeRevision: scope.revision,
            targets: [...scope.members],
            executions: [],
          }
          runs.set(read.id, {
            read,
            approvedAt: Math.max(clock, Math.floor(Date.now() / 1000)),
            occurrence: null,
            step: 0,
            executions: [],
            conditions,
            references: refs,
            configurations: configs,
          })
          tick({ kind: 'clock', at: Math.max(clock, Math.floor(Date.now() / 1000)) })
          return candidate({ run: structuredClone(read) }, 202)
        }
        const input = record(op.input),
          action = enumeration(input['action'], ['put', 'archive'] as const)
        if (workflow?.status === 'archived') return error('operation_conflict')
        if (action === 'archive') {
          closed(input, ['action'])
          if (!workflow) return error('resource_not_found', 404)
          workflow.status = 'archived'
          workflow.revision++
          return candidate({ workflow: structuredClone(workflow) })
        }
        closed(input, ['action', 'definition'])
        const definition = workflowDefinition(input['definition'])
        validateSchedule(definition.schedule)
        if (!scopes.freeze(definition.scope)) return error('operation_conflict')
        const next: Workflow = {
          id,
          revision: (workflow?.revision ?? 0) + 1,
          version: (workflow?.version ?? 0) + 1,
          status: 'active',
          definition,
        }
        workflows.set(id, next)
        return candidate({ workflow: structuredClone(next) })
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    tick,
    references: (resource: string, version: string) =>
      [...runs.values()].some(
        (r) =>
          !['completed', 'cancelled', 'partial'].includes(r.read.state) &&
          r.references.some((v) => v.resource === resource && v.version === version),
      ),
    referencesConfiguration: (id: string, version: number) =>
      [...runs.values()].some(
        (r) =>
          !['completed', 'cancelled', 'partial'].includes(r.read.state) &&
          r.configurations.some((v) => v.id === id && v.version === version),
      ),
    list: () =>
      [...workflows.values()].map((w) => ({
        id: w.id,
        label: w.definition.name,
        revision: w.revision,
        status: w.status,
      })),
    approvals: () =>
      [...runs.values()]
        .filter((r) => r.read.approval === 'pending' && r.read.state === 'waiting')
        .map((r) => ({
          kind: 'workflow' as const,
          id: r.read.workflow,
          run: r.read.id,
          revision: r.read.revision,
          author: r.read.author,
          label: r.read.definition.name,
        })),
    executions: () => structuredClone([...runs.values()].flatMap((r) => r.executions)),
    reset() {
      clock = Math.floor(Date.now() / 1000)
      workflows.clear()
      runs.clear()
      receipts.reset()
      pages.reset()
    },
  }
}
