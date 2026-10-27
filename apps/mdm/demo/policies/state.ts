import { directoryPage, filterRows, windowPage } from '../directory'
import { createTelemetryDemo } from '../telemetry'
import type { DomainHandler, Scenario, DemoObservation, DemoEvent } from '../scenario'
import type { createDeviceDemo } from '../devices/state'
import { objectKey } from '../../src/features/devices/clients/objects'
import { error, ok } from '../http'
import { createScopeDemo } from './scopes'
import { createResourceDemo } from './resources'
import { createNativeDemo } from './native'
import { createConfigurationPolicies } from './configuration-claims'
import { createPolicyDemo } from './policies'
import { createPolicyStore } from './store'
import { createLifecycleDemo } from '../software/lifecycle'
import { createPublicationDemo } from '../software/publication'
import { createSoftwarePolicyDemo } from '../software/assignments'
import { createSecurityDemo } from '../security/state'
import { createOperationsDemo } from '../operations/state'
import { createAuthorizationDemo } from '../operations/authorization'
import { createAdminDemo } from '../operations/admin'
export function createAutomationDemo(devices: ReturnType<typeof createDeviceDemo>) {
  const operations = createOperationsDemo(() => security.now(), {
    can: (actor) => authorization.can(actor, 'audit_read'),
    binding: (actor) => JSON.stringify(authorization.effective(actor)),
    devices: () => devices.facts(),
  })
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
    (id, version): boolean => policies.references(id, version) || software.references(id, version),
  )
  for (const kind of ['native_collection', 'agent_collection'] as const)
    policyStore.register(kind, (d) => {
      if (d.action.kind !== 'native_collection' && d.action.kind !== 'agent_collection')
        return error('malformed_request', 400)
      const binding = d.action.resource
      const r = resources.read(binding.id),
        version = r?.versions.find((v) => v.id === binding.version && v.state === 'active')
      if (
        r?.kind !== kind ||
        !version?.variants.some(
          (v) =>
            v.key === binding.variant &&
            v.platform === binding.platform &&
            v.architecture === binding.architecture,
        )
      )
        return error('resource_not_found', 404)
      if (!scopes.resolve(d.scope, kind === 'native_collection' ? 'mdm' : 'agent'))
        return error('scope_not_found', 404)
      return undefined
    })
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
      { resolve: scopes.freeze, snapshot: scopes.snapshot, assignments: scopes.assignments },
      resources,
      lifecycle,
      publication,
      policyStore,
    )
  const configurationPolicies = createConfigurationPolicies(devices, scopes, resources, policyStore)
  const policies = createPolicyDemo(devices, scopes, resources, policyStore)
  const telemetry = createTelemetryDemo(devices, resources, policyStore, scopes)
  const handle: DomainHandler = (request, scenario) => {
    try {
      const denied = authorization.guard(request)
      if (denied) return denied
      security.settle()
      request = { ...request, authorization: authorization.effective(request.actor.principalId) }
      const onboarding = /^\/api\/v1\/policies\/([^/]+)\/(assignments|runs)$/.exec(request.path)
      if (onboarding && request.method === 'GET') {
        const p = policyStore.get(onboarding[1]!)
        if (
          p &&
          !['configuration', 'software'].includes(p.definition.action.kind) &&
          (onboarding[2] === 'assignments' || p.definition.action.kind === 'request_mdm_enrollment')
        ) {
          if (onboarding[2] === 'runs') return ok(windowPage([], request, () => [], p.id))
          const channel =
            p.definition.action.kind === 'native_collection' ||
            p.definition.action.kind === 'ensure_agent_installed'
              ? 'mdm'
              : 'agent'
          const page = windowPage(
            scopes.assignments(p.definition.scope, channel),
            request,
            (row) => [objectKey(row.object)],
            [p.id, p.revision, p.version, scopes.snapshot(p.definition.scope)],
          )
          return ok({
            ...page,
            items: page.items.map((row) => ({
              ...row,
              ...(!p.enabled ? { availability: 'unavailable', reason: 'policy_disabled' } : {}),
              taskAdmission: null,
              operationIds: [],
            })),
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
        telemetry,
        policyStore,
        policies,
        configurationPolicies,
        lifecycle,
        publication,
        software,
      ]) {
        const reply = owner.handle(request, scenario)
        if (reply) {
          if (
            owner === policyStore &&
            ['POST', 'DELETE'].includes(request.method) &&
            reply.status < 300
          ) {
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
      if (
        ['/api/v1/operations', '/api/v1/operations/statistics'].includes(request.path) &&
        request.method === 'GET'
      ) {
        const all = [
          ...native.directory(request.actor.principalId),
          ...policies.rows().map((r) => ({
            id: r.taskId,
            kind: 'action_run' as const,
            authorization: { state: 'not_applicable' },
            reauthorization: { state: 'not_applicable' },
            device: r.device,
            registrationId: r.registrationId,
            generation: r.generation,
            origin: 'policy',
            policy: r.policyId,
            deadline: r.deadline,
            status: r.state.execution,
            detailUrl: `/api/v1/policies/${r.policyId}/runs/${r.taskId}`,
            evidence: { state: r.state, effect: r.effect, result: r.result },
          })),
          ...software.runs.rows().map((r) => ({
            id: r.value.taskId,
            kind: 'action_run' as const,
            authorization: { state: 'not_applicable' },
            reauthorization: { state: 'not_applicable' },
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
        ].filter(
          (i) =>
            authorization.can(request.actor.principalId, 'operation_read', i.device) &&
            scenario !== 'empty',
        )
        const lookup = (row: (typeof all)[number], field: string): unknown =>
          field
            .split('.')
            .reduce<unknown>(
              (value, key) =>
                value && typeof value === 'object' ? (Reflect.get(value, key) ?? null) : null,
              row,
            )
        if (request.path.endsWith('/statistics')) {
          const items = filterRows(all, request.query.get('filter'), lookup)
          return ok({
            statistics: {
              total: items.length,
              commands: items.filter((i) => i.kind === 'command').length,
              actionRuns: items.filter((i) => i.kind === 'action_run').length,
              unknown: items.filter((i) => i.status === 'unknown').length,
            },
            asOf: security.now(),
          })
        }
        return ok(
          directoryPage(all, request, ['id', 'kind'], {
            lookup,
            binding: JSON.stringify(authorization.effective(request.actor.principalId)),
          }),
        )
      }
    } catch (e) {
      return error(
        e instanceof Error && e.message === 'Invalidated cursor'
          ? 'operation_conflict'
          : 'malformed_request',
        e instanceof Error && e.message === 'Invalidated cursor' ? 409 : 400,
      )
    }
  }
  return {
    authorization,
    telemetry,
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
        telemetry,
        policyStore,
        policies,
        configurationPolicies,
        lifecycle,
        publication,
        software,
      ])
        owner.reset()
    },
  }
}
