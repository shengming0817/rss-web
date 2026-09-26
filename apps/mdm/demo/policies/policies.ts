import { resourceApplicability } from './applicability'
import { createHash, randomUUID } from 'node:crypto'
import type { DomainHandler, Scenario } from '../scenario'
import type { createDeviceDemo } from '../devices/state'
import type { createScopeDemo } from './scopes'
import type { createConfigurationDemo } from './configurations'
import { validateScriptParameters } from './script-validation'
import type { createResourceDemo } from './resources'
import { closed, enumeration, identifier, record, uuid } from '../../src/services/decode'
import {
  policyDefinition,
  type PolicyDefinition,
  type PolicyRead,
} from '../../src/features/policies/clients/policies'
import type { ExecutionSummary } from '../../src/features/policies/clients/executions'
import { createReceipts, error, operation } from '../http'
import { candidate } from './http'
import type { DemoEvent } from './schedule'
interface State {
  read: PolicyRead
  current: Map<string, { fingerprint: string; execution: string; at: number }>
}
export function createPolicyDemo(
  devices: Pick<ReturnType<typeof createDeviceDemo>, 'facts'>,
  scopes: Pick<ReturnType<typeof createScopeDemo>, 'resolve'>,
  resources: Pick<ReturnType<typeof createResourceDemo>, 'read'>,
  configurations: Pick<ReturnType<typeof createConfigurationDemo>, 'read' | 'assess'> = {
    read: () => null,
    assess: () => 'resource_unavailable',
  },
) {
  const policies = new Map<string, State>(),
    runs = new Map<string, ExecutionSummary>(),
    receipts = createReceipts()
  let clock = Math.floor(Date.now() / 1000)
  function selected(def: PolicyDefinition) {
    if (def.source === 'configuration') {
      const c = configurations.read(def.resource),
        v = c?.versions.find((v) => String(v.version) === def.resourceVersion)
      return c && v?.status === 'published'
        ? {
            fingerprint: JSON.stringify(v.settings),
            digest: createHash('sha256').update(JSON.stringify(v.settings)).digest('hex'),
            platform: c.platform,
            script: false,
            native: true,
            version: null,
          }
        : null
    }
    const r = resources.read(def.resource),
      v = r?.versions.find((v) => v.id === def.resourceVersion)
    if (!r || !v || v.state !== 'active') return null
    return {
      fingerprint: JSON.stringify(v.digest),
      digest: Buffer.from(v.digest).toString('hex'),
      platform: v.configuration ? ('windows' as const) : null,
      script: r.kind === 'script',
      native: v.configuration !== null,
      version: v,
    }
  }
  function members(
    definition: PolicyDefinition,
    scenario: Scenario,
    replacedPolicy?: string,
  ): PolicyRead['members'] {
    const scope = scopes.resolve(definition.scope)
    if (!scope) return []
    const selection = selected(definition)
    return scope.members.map((device) => {
      const d = devices.facts().find((d) => d.summary.id === device)
      const applicability =
        definition.source === 'configuration'
          ? configurations.assess(
              definition.resource,
              Number(definition.resourceVersion),
              device,
              replacedPolicy,
            )
          : (() => {
              const r = resources.read(definition.resource)
              return r
                ? resourceApplicability(r, definition.resourceVersion, d)
                : ('resource_unavailable' as const)
            })()
      const reason =
        scenario === 'denied'
          ? 'authorization'
          : !definition.enabled
            ? 'disabled'
            : !selection
              ? 'resource_unavailable'
              : definition.validity &&
                  (clock < definition.validity.start || clock >= definition.validity.end)
                ? 'window'
                : applicability !== 'applicable'
                  ? applicability
                  : scenario === 'partial' && device.endsWith('01')
                    ? 'offline'
                    : 'applicable'
      return { device, reason, execution: null, cancellable: false }
    })
  }
  function cancel(id: string) {
    const run = runs.get(id)
    if (
      !run ||
      run.origin.kind !== 'policy' ||
      !['not_started', 'running', 'unknown'].includes(run.execution)
    )
      return
    run.origin.cancellation = run.dispatch === 'queued' ? 'confirmed' : 'requested'
    if (run.origin.cancellation === 'confirmed') {
      run.execution = 'cancelled'
      run.waitingReason = null
    } else run.waitingReason = 'cancel_confirmation'
  }
  function reconcile(scenario: Scenario, event?: DemoEvent) {
    if (event && event.at < clock) return
    if (event) clock = event.at
    if (event)
      for (const run of runs.values()) {
        if (
          run.origin.kind === 'policy' &&
          run.origin.cancellation === 'requested' &&
          run.execution !== 'unknown'
        ) {
          run.origin.cancellation = 'confirmed'
          run.execution = 'cancelled'
          run.waitingReason = null
        }
      }
    for (const [id, state] of policies) {
      const { read, current } = state,
        def = read.definition
      const rows = read.archived ? [] : members(def, scenario)
      for (const [device, old] of current) {
        if (!rows.some((r) => r.device === device)) {
          if (def.exitBehavior === 'cancel' || read.archived) cancel(old.execution)
          current.delete(device)
        }
      }
      for (const row of rows) {
        const old = current.get(row.device),
          run = old ? runs.get(old.execution) : null
        if (row.reason !== 'applicable') {
          if (
            ['authorization', 'resource_unavailable', 'window', 'unsupported', 'conflict'].includes(
              row.reason,
            ) ||
            (row.reason === 'disabled' && def.exitBehavior === 'cancel')
          ) {
            if (old) cancel(old.execution)
            current.delete(row.device)
          }
          row.execution = old?.execution ?? null
          continue
        }
        const d = devices.facts().find((d) => d.summary.id === row.device)!
        const selection = selected(def)
        const fingerprint = JSON.stringify([
          def.source,
          def.resource,
          def.resourceVersion,
          selection?.fingerprint,
          def.parameters,
          d.architecture,
          d.nativeWindows,
          d.summary.platform,
          d.summary.channels,
          d.registrations
            .filter((r) =>
              selection?.native ? r.source.startsWith('mdm.') : r.source === 'agent.builtin',
            )
            .map((r) => [r.registrationId, r.generation, r.status]),
        ])
        const unknown = [...runs.values()].find(
          (r) =>
            r.origin.kind === 'policy' &&
            r.origin.policy === id &&
            r.device === row.device &&
            r.execution === 'unknown',
        )
        if (unknown) {
          row.reason = 'unknown'
          row.execution = unknown.id
          continue
        }
        const due =
          def.trigger.kind === 'on_change' ||
          (def.trigger.kind === 'check_in'
            ? event?.kind === 'check_in' && event.device === row.device
            : event?.kind === 'clock' && (!old || clock - old.at >= def.trigger.seconds!))
        const changed = old?.fingerprint !== fingerprint
        if (changed && old) cancel(old.execution)
        const cancelling = [...runs.values()].find(
          (r) =>
            r.device === row.device &&
            r.origin.kind === 'policy' &&
            r.origin.policy === id &&
            r.origin.cancellation === 'requested',
        )
        if (cancelling) {
          row.reason = 'cancelling'
          row.execution = cancelling.id
          continue
        }
        if (
          (!old || changed || (def.trigger.kind !== 'on_change' && due && old.at !== clock)) &&
          due
        ) {
          const execution = randomUUID()
          runs.set(execution, {
            id: execution,
            batch: null,
            device: row.device,
            origin: {
              kind: 'policy',
              policy: id,
              revision: read.revision,
              basis: {
                source: def.source,
                resource: def.resource,
                version: def.resourceVersion,
                resourceDigest: selection!.digest,
                parameterDigest: createHash('sha256')
                  .update(JSON.stringify(def.parameters))
                  .digest('hex'),
                scope: def.scope,
                scopeRevision: scopes.resolve(def.scope)!.revision,
                registrations: d.registrations
                  .filter((r) => r.status === 'active')
                  .map((r) => ({ id: r.registrationId, generation: r.generation })),
                architecture: d.architecture ?? null,
              },
              cancellation: 'none',
              output: null,
            },
            admission: 'accepted',
            dispatch: 'queued',
            receipt: 'not_received',
            execution: 'not_started',
            effect: 'unverified',
            compliance: 'unknown',
            attempt: null,
            nativeCode: null,
            waitingReason: 'device_receipt',
          })
          current.set(row.device, { fingerprint, execution, at: clock })
        }
        row.execution = current.get(row.device)?.execution ?? null
        if (!row.execution) row.reason = 'trigger'
        if (event && run && !changed && run.execution === 'not_started') {
          run.attempt = randomUUID()
          run.dispatch = 'published'
          run.execution = scenario === 'unknown' ? 'unknown' : 'running'
        } else if (event && run?.execution === 'running') {
          run.receipt = 'received'
          run.execution =
            scenario === 'unknown' ? 'unknown' : scenario === 'partial' ? 'failed' : 'succeeded'
          run.waitingReason = 'effect_verification'
          if (run.origin.kind === 'policy')
            run.origin.output = {
              simulation: true,
              message: 'Synthetic result; no device executed this assignment.',
            }
        }
      }
      for (const row of rows) {
        const r = row.execution ? runs.get(row.execution) : undefined
        row.cancellable =
          !!r &&
          r.origin.kind === 'policy' &&
          r.origin.cancellation === 'none' &&
          ['not_started', 'running', 'unknown'].includes(r.execution)
      }
      read.members = rows
      read.computation = {
        sequence: read.computation.sequence + 1,
        at: clock,
        status: !scopes.resolve(def.scope) ? 'blocked' : rows.length ? 'ready' : 'waiting',
      }
    }
  }
  const handle: DomainHandler = (request, scenario) => {
    const match = /^\/api\/mdm-candidate\/v1\/policies\/assignments\/([^/]+)(?:\/(preview))?$/.exec(
      request.path,
    )
    if (!match) return
    try {
      if (scenario === 'denied') return error('permission_denied', 403)
      const id = identifier(decodeURIComponent(match[1]!)),
        state = policies.get(id)
      if (request.method === 'GET' && !match[2])
        return state
          ? candidate({ policy: structuredClone(state.read) })
          : error('policy_not_found', 404)
      if (request.method !== 'POST') return
      if (match[2] === 'preview') {
        const v = closed(request.body, ['definition'])
        return candidate({ members: members(policyDefinition(v['definition']), scenario, id) })
      }
      const op = operation(request.body)
      return receipts.write(request, op.operationId, () => {
        if (op.expectedRevision !== (state?.read.revision ?? 0) || state?.read.archived)
          return error('operation_conflict')
        const input = record(op.input),
          action = enumeration(input['action'], ['put', 'archive', 'cancel_run'] as const)
        if (action === 'put') {
          closed(input, ['action', 'definition'])
          const definition = policyDefinition(input['definition'])
          if (!scopes.resolve(definition.scope)) return error('scope_not_found', 404)
          const selection = selected(definition)
          if (!selection) return error('operation_conflict')
          if (selection.script)
            for (const variant of selection.version!.variants) {
              if (variant.declaration.kind === 'script')
                validateScriptParameters(variant.declaration.definition, definition.parameters)
            }
          policies.set(id, {
            read: {
              id,
              revision: (state?.read.revision ?? 0) + 1,
              archived: false,
              definition,
              computation: state?.read.computation ?? { sequence: 0, status: 'waiting', at: clock },
              members: [],
            },
            current: state?.current ?? new Map(),
          })
        } else {
          if (!state) return error('policy_not_found', 404)
          if (action === 'archive') {
            closed(input, ['action'])
            state.read.archived = true
            state.read.revision++
          } else {
            closed(input, ['action', 'execution'])
            const execution = uuid(input['execution'])
            if (
              !runs.has(execution) ||
              runs.get(execution)?.origin.kind !== 'policy' ||
              (runs.get(execution)!.origin as { policy?: string }).policy !== id
            )
              return error('operation_not_found', 404)
            const run = runs.get(execution)!
            if (
              !['not_started', 'running', 'unknown'].includes(run.execution) ||
              (run.origin.kind === 'policy' && run.origin.cancellation !== 'none')
            )
              return error('operation_conflict')
            cancel(execution)
          }
        }
        reconcile(scenario)
        return candidate({ policy: structuredClone(policies.get(id)!.read) })
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    assignedConfigurations(device: string, replacedPolicy?: string) {
      return [...policies.values()]
        .filter(({ read }) => read.id !== replacedPolicy)
        .flatMap(({ read }) => {
          const d = read.definition
          return !read.archived &&
            d.enabled &&
            d.source === 'configuration' &&
            (!d.validity || (clock >= d.validity.start && clock < d.validity.end)) &&
            scopes.resolve(d.scope)?.members.includes(device)
            ? [{ id: d.resource, version: Number(d.resourceVersion) }]
            : []
        })
    },
    reconcile,
    executions: () => structuredClone([...runs.values()]),
    references: (
      resource: string,
      version: string,
      source: 'resource' | 'configuration' = 'resource',
    ) =>
      [...policies.values()].some(
        (p) =>
          !p.read.archived &&
          p.read.definition.source === source &&
          p.read.definition.resource === resource &&
          p.read.definition.resourceVersion === version,
      ),
    list: () =>
      [...policies.values()].map((p) => ({
        id: p.read.id,
        label: p.read.id,
        revision: p.read.revision,
        status: p.read.archived
          ? ('archived' as const)
          : p.read.definition.enabled
            ? ('active' as const)
            : ('paused' as const),
      })),
    reset() {
      policies.clear()
      runs.clear()
      receipts.reset()
      clock = Math.floor(Date.now() / 1000)
    },
  }
}
