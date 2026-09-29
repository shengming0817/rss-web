import { randomUUID } from 'node:crypto'
import type { DomainHandler } from '../scenario'
import { createPages, createReceipts, error, operation } from '../http'
import { closed, enumeration, identifier, uuid } from '../../src/services/decode'
import {
  installationRequest,
  requestPhases,
  selfServiceDefinition,
  type InstallationRequest,
  type SelfServiceItem,
} from '../../src/features/software/clients/self-service'
import type { createDeviceDemo } from '../devices/state'
import type { createScopeDemo } from '../policies/scopes'
import type { createResourceDemo } from '../policies/resources'
import type { createAdmissionDemo } from './admission'
import type { createSoftwarePolicyDemo } from './assignments'
import type { DemoEvent } from '../policies/schedule'
import { softwareProfiles } from './runs'
import { candidate } from './catalog'
export function createSelfServiceDemo(
  devices: Pick<ReturnType<typeof createDeviceDemo>, 'facts'>,
  scopes: Pick<ReturnType<typeof createScopeDemo>, 'freeze' | 'forManagedDevices'>,
  resources: Pick<ReturnType<typeof createResourceDemo>, 'read'>,
  admission: Pick<ReturnType<typeof createAdmissionDemo>, 'isAdmitted'>,
  software: Pick<
    ReturnType<typeof createSoftwarePolicyDemo>,
    'createManagedPolicy' | 'cancelManagedPolicy' | 'runs'
  >,
) {
  const items = new Map<string, SelfServiceItem>(),
    requests = new Map<string, InstallationRequest>()
  const receipts = createReceipts(),
    pages = createPages()
  let now = Math.floor(Date.now() / 1000)
  function available(item: SelfServiceItem, device?: string) {
    const d = item.definition,
      v = resources.read(d.resource.id)?.versions.find((v) => v.id === d.resource.version),
      scope = scopes.freeze(d.scope)
    if (
      !d.enabled ||
      v?.state !== 'active' ||
      !admission.isAdmitted(d.resource.id, d.resource.version, d.admissionOperation) ||
      !scope
    )
      return false
    if (
      !Object.entries(d.resource.variants).every(([target, key]) =>
        v.variants.some(
          (v) =>
            `${v.platform}_${v.architecture}` === target &&
            v.key === key &&
            v.declaration.kind === 'software',
        ),
      )
    )
      return false
    if (!device) return true
    const profiles = softwareProfiles(devices.facts().find((d) => d.summary.id === device))
    return (
      scope.members.includes(device) &&
      profiles.length === 1 &&
      profiles[0]!.capabilities.includes('software.execute.v3') &&
      !!d.resource.variants[`${profiles[0]!.platform}_${profiles[0]!.architecture}`]
    )
  }
  function view(r: InstallationRequest): InstallationRequest {
    const latest = software.runs
      .rows()
      .filter((v) => v.policy.id === r.policy?.id)
      .at(-1)
    return installationRequest(
      { ...structuredClone(r), execution: latest?.value.taskId ?? null },
      r.id,
    )
  }
  const handle: DomainHandler = (request, scenario) => {
    const route =
      /^\/api\/mdm-candidate\/v1\/software\/self-service\/(items|requests)(?:\/([^/]+))?$/.exec(
        request.path,
      )
    if (!route) return
    if (scenario === 'denied') return error('permission_denied', 403)
    try {
      const collection = route[1],
        id = route[2] ? uuid(route[2]) : undefined
      if (!id && request.method === 'GET') {
        const phase = request.query.get('phase')
        if (phase) enumeration(phase, requestPhases)
        const values =
          collection === 'items'
            ? [...items.values()]
            : [...requests.values()].filter((r) => !phase || r.phase === phase).map(view)
        return candidate(
          pages.page<unknown>(
            `${request.path}:${phase ?? ''}`,
            scenario === 'empty' ? [] : values,
            request.query,
          ),
        )
      }
      if (!id) return error('malformed_request', 400)
      const item = items.get(id),
        current = requests.get(id)
      if (request.method === 'GET')
        return collection === 'items'
          ? item
            ? candidate({ item: structuredClone(item) })
            : error('resource_not_found', 404)
          : current
            ? candidate({ request: view(current) })
            : error('operation_not_found', 404)
      if (request.method !== 'POST') return
      const op = operation(request.body)
      return receipts.write(request, op.operationId, () => {
        if (collection === 'items') {
          if (op.expectedRevision !== (item?.revision ?? 0)) return error('operation_conflict')
          const input = closed(op.input, ['action', 'definition'])
          if (input['action'] !== 'put') return error('malformed_request', 400)
          const value: SelfServiceItem = {
            id,
            revision: op.expectedRevision + 1,
            operation: op.operationId,
            definition: selfServiceDefinition(input['definition']),
          }
          if (value.definition.enabled && !available(value)) return error('operation_conflict')
          items.set(id, value)
          return candidate({ item: structuredClone(value) })
        }
        if (!current) return error('operation_not_found', 404)
        if (op.expectedRevision !== current.revision) return error('operation_conflict')
        const input = closed(op.input, ['action', 'note']),
          action = enumeration(input['action'], ['approve', 'deny', 'cancel'] as const),
          note = identifier(input['note'])
        if (
          action === 'cancel'
            ? !['pending', 'approved'].includes(current.phase)
            : current.phase !== 'pending'
        )
          return error('operation_conflict')
        if (action === 'approve') {
          const item = items.get(current.item.id)
          if (!item || item.revision !== current.item.revision || !available(item, current.device))
            return error('operation_conflict')
          if (request.actor.principalId === current.requester)
            return error('permission_denied', 403)
          const d = item.definition
          // Both owners validate synchronously before any executable assignment exists.
          // Scope rolls back if binding fails; only this request owner can cancel the result.
          current.policy = scopes.forManagedDevices([current.device], (scope) =>
            software.createManagedPolicy({
              resource: d.resource,
              scope,
              behavior: {
                kind: 'software',
                intent: 'available_install',
                admissionOperation: d.admissionOperation,
                schedule: d.schedule,
                runLifetimeSeconds: d.runLifetimeSeconds,
                rollout: { stages: [{ scope, opensAt: now, minimumVerifiedPercent: null }] },
              },
            }),
          )
        }
        if (action === 'cancel' && current.policy) software.cancelManagedPolicy(current.policy.id)
        current.phase =
          action === 'approve' ? 'approved' : action === 'deny' ? 'denied' : 'cancelled'
        current.decisions.push({ action, note, actor: request.actor.principalId, at: now })
        current.revision++
        current.operation = op.operationId
        return candidate({ request: view(current) })
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    references: (id: string, version: string) =>
      [...items.values()].some(
        (i) => i.definition.resource.id === id && i.definition.resource.version === version,
      ),
    tick(event: DemoEvent) {
      if (event.at < now) return
      now = event.at
      if (event.kind !== 'software_request' || !event.item || !event.device) return
      const item = items.get(event.item),
        device = devices.facts().find((d) => d.summary.id === event.device)
      if (!item || !device?.summary.owner || !available(item, event.device)) return
      if (
        [...requests.values()].some(
          (r) =>
            r.item.id === item.id &&
            r.item.revision === item.revision &&
            r.device === event.device &&
            ['pending', 'approved'].includes(r.phase),
        )
      )
        return
      const id = randomUUID()
      requests.set(id, {
        id,
        revision: 1,
        operation: randomUUID(),
        requester: device.summary.owner,
        device: event.device,
        createdAt: now,
        item: {
          id: item.id,
          revision: item.revision,
          title: item.definition.title,
          resource: structuredClone(item.definition.resource),
        },
        phase: 'pending',
        decisions: [],
        policy: null,
        execution: null,
      })
    },
    reset() {
      items.clear()
      requests.clear()
      receipts.reset()
      pages.reset()
      now = Math.floor(Date.now() / 1000)
    },
  }
}
