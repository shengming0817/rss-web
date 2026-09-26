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
export function createAutomationDemo(devices: ReturnType<typeof createDeviceDemo>) {
  const scopes = createScopeDemo(devices),
    native = createNativeDemo(devices)
  const resources = createResourceDemo(
    (id, version): boolean => policies.references(id, version) || workflows.references(id, version),
  )
  const configurations = createConfigurationDemo(
    devices,
    scopes,
    (id, version): boolean =>
      policies.references(id, String(version), 'configuration') ||
      workflows.referencesConfiguration(id, version),
    (device) => policies.assignedConfigurations(device),
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
    return [...policies.executions(), ...native.executions(), ...workflows.executions(), ...batches]
  }
  const handle: DomainHandler = (request, scenario) => {
    try {
      for (const owner of [scopes, resources, native, policies, configurations, workflows]) {
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
      policies.reconcile(scenario, event)
      workflows.tick(event)
    },
    reset() {
      for (const owner of [scopes, resources, native, policies, configurations, workflows, pages])
        owner.reset()
    },
  }
}
