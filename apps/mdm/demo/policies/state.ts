import type { DomainHandler, Scenario, DemoObservation } from '../scenario'
import type { createDeviceDemo } from '../devices/state'
import { uuid } from '../../src/services/decode'
import type { ExecutionSummary } from '../../src/features/policies/clients/executions'
import { targetFacts } from './targets'
import { createPages, error, ok } from '../http'
import { candidate } from './http'
import { createScopeDemo } from './scopes'
import { createResourceDemo } from './resources'
import { createNativeDemo } from './native'
import { createConfigurationPolicies } from './configuration-claims'
import { createPolicyDemo } from './policies'
import { createPolicyStore } from './store'
import { createConfigurationDemo } from './configurations'
import { createWorkflowDemo } from './workflows'
import type { DemoEvent } from './schedule'
import { createLifecycleDemo } from '../software/lifecycle'
import { createPublicationDemo } from '../software/publication'
import { createSoftwarePolicyDemo } from '../software/assignments'
import { softwareExecution } from '../../src/features/software/clients/execution'
import { createSecurityDemo } from '../security/state'
import { createOperationsDemo } from '../operations/state'
import { createAuthorizationDemo } from '../operations/authorization'
import { createAdminDemo } from '../operations/admin'
export function createAutomationDemo(devices: ReturnType<typeof createDeviceDemo>) {
  const operations = createOperationsDemo(() => security.now())
  const scopes = createScopeDemo(devices),
    native = createNativeDemo(devices, (actor, permission, device) =>
      authorization.can(actor, permission, device),
    )
  const security = createSecurityDemo(devices, operations, scopes)
  const authorization = createAuthorizationDemo(
    () => security.now(),
    operations.record,
    (id, task) => {
      const run = task
        ? software.runs.rows().find((r) => r.policy.id === id && r.value.taskId === task)
        : undefined
      return {
        definition: run?.policy.definition ?? policyStore.get(id)?.definition,
        device: run?.value.device,
      }
    },
  )
  const admin = createAdminDemo(
    () => security.now(),
    operations,
    (actor) =>
      devices
        .facts()
        .filter((d) => authorization.can(actor, 'inventory_read', d.summary.id))
        .map((d) => ({ id: d.summary.id, platform: d.summary.platform, status: d.summary.status })),
  )
  const policyStore = createPolicyStore()
  const resources = createResourceDemo(
    (id, version): boolean =>
      policies.references(id, version) ||
      workflows.references(id, version) ||
      software.references(id, version),
  )
  policyStore.register('ensure_agent_installed', () => error('action_not_supported', 501))
  policyStore.register('request_mdm_enrollment', (d) =>
    scopes.resolve(d.scope) ? undefined : error('operation_conflict'),
  )
  const lifecycle = createLifecycleDemo(resources),
    publication = createPublicationDemo(resources, lifecycle, (actor) =>
      authorization.can(actor, 'software_write'),
    ),
    software = createSoftwarePolicyDemo(
      devices,
      { resolve: scopes.freeze, snapshot: scopes.snapshot },
      resources,
      lifecycle,
      publication,
      policyStore,
    )
  const configurationPolicies = createConfigurationPolicies(devices, scopes, resources, policyStore)
  const configurations = createConfigurationDemo(
    devices,
    scopes,
    (id, version): boolean => workflows.referencesConfiguration(id, version),
    configurationPolicies.assigned,
  )
  const policies = createPolicyDemo(devices, scopes, resources, policyStore)
  const workflows = createWorkflowDemo(devices, scopes, resources, configurations),
    pages = createPages()
  function executions(): ExecutionSummary[] {
    const batches: ExecutionSummary[] = devices.batches().flatMap((batch) =>
      batch.targets.flatMap((target) =>
        target.execution
          ? [
              {
                id: target.execution,
                batch: batch.id,
                device: target.device,
                origin: { kind: 'device_batch' as const, batch: batch.id },
                admission: 'accepted' as const,
                dispatch: 'queued' as const,
                receipt: 'not_received' as const,
                execution: 'not_started' as const,
                effect: 'unverified' as const,
                compliance: 'unknown' as const,
                attempt: null,
                nativeCode: null,
                waitingReason: 'device_receipt' as const,
              },
            ]
          : [],
      ),
    )
    return [
      ...security.executions(),
      ...policies.executions(),
      ...native.executions(),
      ...workflows.executions(),
      ...batches,
      ...software.runs.rows().map((r) =>
        softwareExecution(r.policy.id, r.policy.versionId, {
          ...r.value,
          userAction: software.runs.userAction(r, software.now()),
        }),
      ),
    ]
  }
  const handle: DomainHandler = (request, scenario) => {
    try {
      const denied = authorization.guard(request, devices.batches())
      if (denied) return denied
      security.settle()
      const onboarding = /^\/api\/v1\/policies\/([^/]+)\/(assignments|runs)$/.exec(request.path)
      if (onboarding && request.method === 'GET') {
        const p = policyStore.get(onboarding[1]!)
        if (p?.definition.action.kind === 'request_mdm_enrollment') {
          if (onboarding[2] === 'runs') return ok({ items: [], nextCursor: null })
          const snapshot = scopes.snapshot(p.definition.scope)
          return ok({
            items: (snapshot?.devices ?? [])
              .filter((id) => id > (request.query.get('after') ?? ''))
              .slice(0, 20)
              .map((id) => ({
                ...targetFacts(devices, id, 'agent'),
                scopeResult: snapshot!.result,
                qualification: scopes.freeze(p.definition.scope)?.members.includes(id)
                  ? { state: 'eligible', entry: 1 }
                  : { state: 'pending' },
                taskAdmission: null,
                operationIds: [],
              })),
            nextCursor: null,
          })
        }
      }
      for (const owner of [
        authorization,
        admin,
        operations,
        security,
        scopes,
        resources,
        native,
        policyStore,
        policies,
        configurationPolicies,
        configurations,
        workflows,
        lifecycle,
        publication,
        software,
      ]) {
        const reply = owner.handle(request, scenario)
        if (reply) {
          if (owner === policyStore && request.method === 'POST' && reply.status < 300) {
            software.reconcile()
            policies.reconcile(scenario)
            configurationPolicies.reconcile()
          }
          if (
            (owner === scopes || owner === resources) &&
            request.method === 'POST' &&
            reply.status < 300
          ) {
            policies.reconcile(scenario)
            configurationPolicies.reconcile()
          }
          return reply
        }
      }
      if (request.path === '/api/v1/operations' && request.method === 'GET') {
        const all = [
          ...native.directory(),
          ...software.runs.rows().map((r) => ({
            id: r.value.taskId,
            kind: 'action_run' as const,
            device: r.value.device,
            registrationId: r.value.registrationId,
            generation: r.value.generation,
            origin: 'policy',
            policy: r.policy.id,
            deadline: r.value.deadline,
            status: r.value.state.execution,
            detailUrl: `/api/v1/policies/${r.policy.id}/runs/${r.value.taskId}`,
            evidence: { state: r.value.state, effect: r.value.effect, result: null },
          })),
        ]
          .filter(
            (i) =>
              authorization.can(request.actor.principalId, 'operation_read', i.device) &&
              (!request.query.get('policy') || i.policy === request.query.get('policy')) &&
              (!request.query.get('device') || i.device === request.query.get('device')),
          )
          .sort((a, b) => a.id.localeCompare(b.id) || a.kind.localeCompare(b.kind))
        const after = request.query.get('after'),
          afterKind = request.query.get('afterKind'),
          limit = Number(request.query.get('limit') ?? 20)
        if (!!after !== !!afterKind || !Number.isInteger(limit) || limit < 1 || limit > 1000)
          return error('malformed_request', 400)
        const items = all.filter(
            (i) => !after || i.id > after || (i.id === after && i.kind > afterKind!),
          ),
          selected = items.slice(0, limit),
          last = selected.at(-1)
        return ok({
          items: selected,
          nextCursor: items.length > limit && last ? { id: last.id, kind: last.kind } : null,
          statistics: {
            total: all.length,
            commands: all.filter((i) => i.kind === 'command').length,
            actionRuns: all.filter((i) => i.kind === 'action_run').length,
            unknown: all.filter((i) => i.status === 'unknown').length,
          },
          asOf: security.now(),
        })
      }
      const collection = /^\/api\/v1\/mdm-candidate\/policies\/(workflows|approvals)$/.exec(
        request.path,
      )
      const execution = /^\/api\/v1\/mdm-candidate\/executions(?:\/([^/]+))?$/.exec(request.path)
      if ((!collection && !execution) || request.method !== 'GET') return
      if (scenario === 'denied') return error('permission_denied', 403)
      if (collection) {
        const name = collection[1]
        const items = name === 'workflows' ? workflows.list() : workflows.approvals()
        return candidate(
          pages.page<unknown>(request.path, scenario === 'empty' ? [] : items, request.query),
        )
      }
      const items = executions()
      if (execution?.[1]) {
        const id = uuid(execution[1]),
          item = items.find((e) => e.id === id)
        return item ? candidate({ execution: item }) : error('operation_not_found', 404)
      }
      const batch = request.query.get('batch')
      if (batch !== null) uuid(batch)
      return candidate(
        pages.page(
          `${request.path}:${batch ?? ''}`,
          scenario === 'empty' ? [] : items.filter((e) => batch === null || e.batch === batch),
          request.query,
        ),
      )
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    authorization,
    now: security.now,
    operations,
    security,
    resources,
    configurationPolicies,
    scopes,
    lifecycle,
    publication,
    software,

    handle,
    observe(event: DemoObservation, scenario: Scenario) {
      operations.observe(event)
      const { method, path } = event
      if (event.status >= 300) return
      const deviceWrite =
        method !== 'GET' &&
        /^\/api\/(?:v1\/(?:devices|enrollments|groups)|v1\/mdm-candidate\/devices)(?:\/|$)/.test(
          path,
        ) &&
        !path.includes('preview')
      const groupPublished = method === 'GET' && /^\/api\/v1\/groups\/[^/]+\/tasks\//.test(path)
      if (deviceWrite || groupPublished) {
        policies.reconcile(scenario)
        configurationPolicies.reconcile()
      }
    },
    tick(event: DemoEvent, scenario: Scenario = 'normal') {
      if (!security.tick(event, scenario)) return false
      if (!event.kind.startsWith('software_')) {
        policies.reconcile(scenario, event)
        configurationPolicies.reconcile()
        workflows.tick(event)
      }
      software.tick(event, scenario)
      admin.tick(scenario)
      return true
    },
    reset() {
      for (const owner of [
        authorization,
        admin,
        operations,
        security,
        scopes,
        resources,
        native,
        policyStore,
        policies,
        configurationPolicies,
        configurations,
        workflows,
        pages,
        lifecycle,
        publication,
        software,
      ])
        owner.reset()
    },
  }
}
