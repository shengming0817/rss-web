import type { DomainHandler, Scenario } from '../scenario'
import type { createDeviceDemo } from '../devices/state'
import { uuid } from '../../src/services/decode'
import type { ExecutionSummary } from '../../src/features/policies/clients/executions'
import { createPages, error } from '../http'
import { candidate } from './http'
import { createScopeDemo } from './scopes'
import { createResourceDemo } from './resources'
import { createNativeDemo } from './native'
import { createPolicyDemo } from './policies'
import { createConfigurationDemo } from './configurations'
import { createWorkflowDemo } from './workflows'
import type { DemoEvent } from './schedule'
import { createAdmissionDemo } from '../software/admission'
import { createSoftwarePolicyDemo } from '../software/assignments'
import { softwareExecution } from '../../src/features/software/clients/execution'
import { createBootstrapDemo } from '../software/bootstrap'
import { createUpdatesDemo } from '../software/updates'
import { createSelfServiceDemo } from '../software/self-service'
import { createSecurityDemo } from '../security/state'
import { createOperationsDemo } from '../operations/state'
export function createAutomationDemo(devices: ReturnType<typeof createDeviceDemo>) {
  const operations = createOperationsDemo(() => security.now())
  const scopes = createScopeDemo(devices),
    native = createNativeDemo(devices)
  const security = createSecurityDemo(devices, operations, scopes)
  const resources = createResourceDemo(
    (id, version): boolean =>
      policies.references(id, version) ||
      workflows.references(id, version) ||
      software.references(id, version) ||
      selfService.references(id, version) ||
      updates.references(id, version) ||
      bootstrap.references(id, version),
  )
  const admission = createAdmissionDemo(resources),
    software = createSoftwarePolicyDemo(
      devices,
      { resolve: scopes.freeze, snapshot: scopes.snapshot },
      resources,
      admission,
    )
  const selfService = createSelfServiceDemo(devices, scopes, resources, admission, software)
  const bootstrap = createBootstrapDemo(devices, scopes, resources, admission)
  const updates = createUpdatesDemo(devices, scopes, { resources, admission, software })
  const configurations = createConfigurationDemo(
    devices,
    scopes,
    (id, version): boolean =>
      policies.references(id, String(version), 'configuration') ||
      workflows.referencesConfiguration(id, version),
    (device, replacedPolicy) => policies.assignedConfigurations(device, replacedPolicy),
  )
  const policies = createPolicyDemo(devices, scopes, resources, configurations)
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
      ...bootstrap.executions(),
      ...updates.executions(),
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
      security.settle()
      for (const owner of [
        operations,
        security,
        scopes,
        resources,
        native,
        policies,
        configurations,
        workflows,
        admission,
        software,
        selfService,
        updates,
        bootstrap,
      ]) {
        const reply = owner.handle(request, scenario)
        if (reply) {
          if (
            (owner === scopes || owner === resources) &&
            request.method === 'POST' &&
            reply.status < 300
          )
            policies.reconcile(scenario)
          return reply
        }
      }
      const collection =
        /^\/api\/mdm-candidate\/v1\/policies\/(scopes|resources|policies|workflows|approvals)$/.exec(
          request.path,
        )
      const execution = /^\/api\/mdm-candidate\/v1\/executions(?:\/([^/]+))?$/.exec(request.path)
      if ((!collection && !execution) || request.method !== 'GET') return
      if (scenario === 'denied') return error('permission_denied', 403)
      if (collection) {
        const name = collection[1]
        const items =
          name === 'scopes'
            ? scopes.list()
            : name === 'resources'
              ? resources.list()
              : name === 'policies'
                ? policies.list()
                : name === 'workflows'
                  ? workflows.list()
                  : workflows.approvals()
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
    now: security.now,
    operations,
    security,
    resources,
    scopes,
    admission,
    software,
    selfService,
    updates,
    bootstrap,
    handle,
    observe(method: string, path: string, scenario: Scenario) {
      const deviceWrite =
        method !== 'GET' &&
        /^\/api\/(?:v[23]\/(?:devices|enrollments|groups)|mdm-candidate\/v1\/devices)(?:\/|$)/.test(
          path,
        ) &&
        !path.includes('preview')
      const groupPublished = method === 'GET' && /^\/api\/v2\/groups\/[^/]+\/tasks\//.test(path)
      if (deviceWrite || groupPublished) policies.reconcile(scenario)
    },
    tick(event: DemoEvent, scenario: Scenario = 'normal') {
      if (!security.tick(event, scenario)) return false
      if (!event.kind.startsWith('software_') && !event.kind.startsWith('bootstrap_')) {
        policies.reconcile(scenario, event)
        workflows.tick(event)
      }
      bootstrap.tick(event, scenario)
      updates.tick(event, scenario)
      software.tick(event, scenario)
      selfService.tick(event)
      return true
    },
    reset() {
      for (const owner of [
        operations,
        security,
        scopes,
        resources,
        native,
        policies,
        configurations,
        workflows,
        pages,
        admission,
        software,
        selfService,
        updates,
        bootstrap,
      ])
        owner.reset()
    },
  }
}
