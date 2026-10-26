import { windowPage } from '../directory'
import { createHash, randomUUID } from 'node:crypto'
import type { DomainHandler, Scenario, DemoEvent } from '../scenario'
import type { createDeviceDemo } from '../devices/state'
import type { createScopeDemo } from './scopes'
import type { createResourceDemo } from './resources'
import type { ExecutionSummary } from '../../src/features/policies/clients/executions'
import type { ExecutionDefinition } from '../../src/features/policies/clients/model'
import { createPolicyStore } from './store'
import { error, ok } from '../http'
import { resourceApplicability } from './applicability'
import { validateParameterSources } from './script-validation'
import { nativeDue } from '../software/schedule'
/** Script execution state consumes the shared authored Policy store; publication never admits a run. */
export function createPolicyDemo(
  devices: Pick<ReturnType<typeof createDeviceDemo>, 'facts'>,
  scopes: Pick<ReturnType<typeof createScopeDemo>, 'resolve'>,
  resources: Pick<ReturnType<typeof createResourceDemo>, 'read'>,
  store = createPolicyStore(),
) {
  const runs = new Map<string, ExecutionSummary>(),
    admissions = new Map<string, string>(),
    lastAdmissions = new Map<string, number>(),
    versions = new Map<string, string>(),
    entries = new Map<string, number>()
  const metadata = new Map<
    string,
    {
      policyId: string
      registrationId: string
      generation: number
      availableAt: number
      deadline: number
    }
  >()
  function rows() {
    return [...runs.values()].flatMap((run) => {
      const m = metadata.get(run.id)
      if (!m || run.origin.kind !== 'policy') return []
      return [
        {
          ...m,
          taskId: run.id,
          device: run.device,
          state: {
            delivery: !run.attempt
              ? { kind: 'queued' as const }
              : {
                  kind: run.receipt === 'received' ? ('received' as const) : ('claimed' as const),
                  attempt: run.attempt,
                  leaseUntil: m.deadline,
                },
            execution: run.execution === 'cancelled' ? ('not_started' as const) : run.execution,
            cancellation: run.origin.cancellation,
            deadline: m.deadline,
            startedAt: run.execution === 'not_started' ? null : m.availableAt,
          },
          effect: 'unverified' as const,
          userAction: null,
          result: null,
          occurrence: 'script',
        },
      ]
    })
  }
  let members = new Set<string>()
  function selected(d: ExecutionDefinition) {
    const b = d.action.resource,
      r = resources.read(b.id),
      version = r?.versions.find((v) => v.id === b.version && v.state === 'active'),
      variant = version?.variants.find(
        (v) =>
          v.key === b.variant &&
          v.platform === b.platform &&
          v.architecture === b.architecture &&
          v.declaration.kind === 'script',
      )
    return r?.kind === 'script' && variant?.declaration.kind === 'script'
      ? { resource: r, version: version!, variant, spec: variant.declaration.definition }
      : null
  }
  store.register('execution', (raw) => {
    if (raw.action.kind !== 'execution') return error('malformed_request', 400)
    const d = { ...raw, action: raw.action },
      selection = selected(d)
    if (!scopes.resolve(d.scope, 'agent')) return error('scope_not_found', 404)
    if (!selection) return error('resource_not_found', 404)
    validateParameterSources(selection.spec, d.action.parameters)
    return undefined
  })
  function reconcile(scenario: Scenario, event?: DemoEvent) {
    const next = new Set<string>()
    for (const p of store.values()) {
      if (p.definition.action.kind !== 'execution') continue
      for (const device of scopes.resolve(p.definition.scope, 'agent')?.members ?? []) {
        const key = JSON.stringify([p.id, device])
        next.add(key)
        if (!members.has(key)) entries.set(key, (entries.get(key) ?? 0) + 1)
      }
    }
    members = next
    for (const run of runs.values()) {
      if (run.origin.kind !== 'policy') continue
      const p = store.get(run.origin.policy),
        d = p?.definition
      const device = devices.facts().find((v) => v.summary.id === run.device)
      const identity = device?.registrations
        .filter((r) => r.status === 'active')
        .map((r) => ({ id: r.registrationId, generation: r.generation }))
      const valid =
        p?.enabled &&
        d?.action.kind === 'execution' &&
        p.versionId === versions.get(run.id) &&
        !!selected({ ...d, action: d.action }) &&
        !!device &&
        device.summary.platform === d.action.resource.platform &&
        device.architecture === d.action.resource.architecture &&
        resourceApplicability(
          resources.read(d.action.resource.id)!,
          d.action.resource.version,
          device,
        ) === 'applicable' &&
        scopes.resolve(d.scope, 'agent')?.members.includes(run.device) &&
        JSON.stringify(identity) === JSON.stringify(run.origin.basis.registrations)
      if (!valid && run.execution === 'not_started') {
        run.execution = 'cancelled'
        run.origin.cancellation = 'confirmed'
      }
      if (!valid && run.execution === 'running') run.origin.cancellation = 'requested'
      if (!valid || run.execution === 'unknown') continue
      if (event?.kind !== 'check_in' || event.device !== run.device) continue
      if (run.execution === 'not_started') {
        run.dispatch = 'published'
        run.attempt = randomUUID()
        run.execution = scenario === 'unknown' ? 'unknown' : 'running'
      } else if (run.execution === 'running') {
        run.receipt = 'received'
        run.execution =
          scenario === 'unknown' ? 'unknown' : scenario === 'partial' ? 'failed' : 'succeeded'
        run.waitingReason = 'effect_verification'
        run.origin.output = {
          simulation: true,
          message: 'Synthetic result; no device executed this script.',
        }
      }
    }
    if (event?.kind !== 'check_in' || !event.device) return
    const device = devices.facts().find((v) => v.summary.id === event.device)
    if (!device || scenario === 'denied' || scenario === 'unsupported') return
    for (const p of store.values()) {
      if (!p.enabled || p.definition.action.kind !== 'execution') continue
      const d = { ...p.definition, action: p.definition.action },
        a = d.action,
        selection = selected(d)
      if (
        !selection ||
        !scopes.resolve(d.scope, 'agent')?.members.includes(event.device) ||
        resourceApplicability(selection.resource, a.resource.version, device) !== 'applicable' ||
        device.summary.platform !== a.resource.platform ||
        device.architecture !== a.resource.architecture
      )
        continue
      const due = nativeDue(a.schedule, event.at, event.device)
      if (
        !due ||
        due.availableAt > event.at ||
        Object.values(a.parameters).some((v) => v.kind === 'input')
      )
        continue
      const pending = [...runs.values()].some(
        (r) =>
          r.device === event.device &&
          r.origin.kind === 'policy' &&
          r.origin.policy === p.id &&
          ['not_started', 'running', 'unknown'].includes(r.execution),
      )
      if (pending) continue
      const registrations = device.registrations
        .filter((r) => r.status === 'active')
        .map((r) => ({ id: r.registrationId, generation: r.generation }))
      const admissionBasis = JSON.stringify([p.id, p.versionId, event.device, registrations]),
        previous = lastAdmissions.get(admissionBasis)
      if (
        a.schedule.trigger.kind === 'check_in' &&
        previous !== undefined &&
        event.at - previous < a.schedule.trigger.minimumSeconds
      )
        continue
      const key = JSON.stringify([
        p.id,
        p.versionId,
        registrations,
        a.frequency === 'once_per_entry'
          ? entries.get(JSON.stringify([p.id, event.device]))
          : a.frequency === 'every_trigger'
            ? due.coordinate
            : null,
      ])
      if (admissions.has(key)) continue
      const id = randomUUID()
      runs.set(id, {
        id,
        batch: null,
        device: event.device,
        origin: {
          kind: 'policy',
          policy: p.id,
          revision: p.revision,
          basis: {
            source: 'resource',
            resource: a.resource.id,
            version: a.resource.version,
            resourceDigest: Buffer.from(selection.version.digest).toString('hex'),
            parameterDigest: createHash('sha256')
              .update(JSON.stringify(a.parameters))
              .digest('hex'),
            scope: d.scope,
            scopeRevision: scopes.resolve(d.scope, 'agent')!.revision,
            registrations,
            architecture: device.architecture ?? null,
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
      const registration = device.registrations.find(
        (r) => r.source === 'agent.builtin' && r.status === 'active',
      )!
      metadata.set(id, {
        policyId: p.id,
        registrationId: registration.registrationId,
        generation: registration.generation,
        availableAt: event.at,
        deadline: event.at + a.runLifetimeSeconds,
      })
      versions.set(id, p.versionId)
      admissions.set(key, id)
      lastAdmissions.set(admissionBasis, event.at)
    }
  }
  const handle: DomainHandler = (request, scenario) => {
    const match = /^\/api\/v1\/policies\/([^/]+)\/runs(?:\/([^/]+))?$/.exec(request.path)
    if (
      match &&
      request.method === 'GET' &&
      store.get(match[1]!)?.definition.action.kind === 'execution'
    ) {
      const items = rows().filter((r) => r.policyId === match[1])
      if (match[2]) {
        const row = items.find((r) => r.taskId === match[2])
        if (!row) return error('operation_not_found', 404)
        const { occurrence: _occurrence, ...detail } = row
        void _occurrence
        return ok(detail)
      }
      return ok(windowPage(items, request, (row) => [row.availableAt, row.taskId], match[1], true))
    }
    return store.handle(request, scenario)
  }
  return {
    handle,
    rows,
    reconcile,
    references: (resource: string, version: string) =>
      store
        .values()
        .some(
          (p) =>
            'resource' in p.definition.action &&
            p.definition.action.resource.id === resource &&
            p.definition.action.resource.version === version,
        ),
    executions: () => structuredClone([...runs.values()]),
    reset() {
      metadata.clear()
      runs.clear()
      admissions.clear()
      lastAdmissions.clear()
      versions.clear()
      entries.clear()
      members.clear()
      store.reset()
    },
  }
}
