import type { DomainHandler } from '../scenario'
import type { createDeviceDemo } from '../devices/state'
import { uuid } from '../../src/services/decode'
import type { ExecutionSummary } from '../../src/features/policies/clients/executions'
import { createPages, error } from '../http'
import { candidate } from './http'
import { createScopeDemo } from './scopes'
import { createResourceDemo } from './resources'
import { createNativeDemo } from './native'
import { createScriptDemo } from './scripts'
import { createPolicyDemo } from './policies'
import { createConfigurationDemo } from './configurations'
import { createWorkflowDemo } from './workflows'
export function createAutomationDemo(devices: ReturnType<typeof createDeviceDemo>) {
  const scopes = createScopeDemo(devices),
    native = createNativeDemo(devices)
  const resources = createResourceDemo(
    (id, version): boolean =>
      scripts.references(id, version) ||
      policies.references(id, version) ||
      workflows.references(id, version),
  )
  const scripts = createScriptDemo(devices, resources),
    policies = createPolicyDemo(devices, scopes, resources, native)
  const configurations = createConfigurationDemo(devices, scopes, (id, version): boolean =>
    workflows.referencesConfiguration(id, version),
  )
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
    return [...native.executions(), ...scripts.executions(), ...workflows.executions(), ...batches]
  }
  const handle: DomainHandler = (request, scenario) => {
    try {
      for (const owner of [
        scopes,
        resources,
        native,
        scripts,
        policies,
        configurations,
        workflows,
      ]) {
        const reply = owner.handle(request, scenario)
        if (reply) return reply
      }
      const collection =
        /^\/api\/mdm-candidate\/v1\/policies\/(scopes|resources|policies|script-plans|workflows|approvals)$/.exec(
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
                : name === 'script-plans'
                  ? scripts.list()
                  : name === 'workflows'
                    ? workflows.list()
                    : [...scripts.approvals(), ...workflows.approvals()]
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
    reset() {
      for (const owner of [
        scopes,
        resources,
        native,
        scripts,
        policies,
        configurations,
        workflows,
        pages,
      ])
        owner.reset()
    },
  }
}
