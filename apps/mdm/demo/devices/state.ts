import { randomUUID } from 'node:crypto'
import type { DomainHandler } from '../scenario'
import { array, closed, enumeration, identifier, nullable } from '../../src/services/decode'
import {
  lifecycleActions,
  type Batch,
} from '../../src/features/devices/clients/candidate-operations'
import { makeDevices } from './fixtures'
import { endpointProjection, endpointDetailProjection, createDeviceViewsDemo } from './views'
import type { Permission } from '../../src/features/operations/clients/authorization'
import { ok, createPages, createReceipts, error, operation } from '../http'
import { candidate } from './http'
import { createAssetDemo } from './assets'
import { createGroupDemo } from './groups'
import { createEnrollmentDemo } from './enrollment'
import type { DemoEvent } from '../policies/schedule'
export function createDeviceDemo() {
  let devices = makeDevices()
  let observedAt = Math.floor(Date.now() / 1000)
  const assets = createAssetDemo(() => devices),
    groups = createGroupDemo(
      () => devices,
      () => views.objects(),
    ),
    enrollments = createEnrollmentDemo(() => devices)
  const pages = createPages(),
    receipts = createReceipts(),
    batches = new Map<string, Batch>()
  let can = (actor: string, permission: Permission, device?: string) => {
    void actor
    void permission
    void device
    return true
  }
  const views = createDeviceViewsDemo(
    () => devices,
    () => can,
  )
  const directory: DomainHandler = (request, scenario) => {
    const { path, method, query } = request
    if (path === '/api/v1/devices' && method === 'GET') {
      const items =
        scenario === 'empty'
          ? []
          : [...devices.values()]
              .filter((d) => can(request.actor.principalId, 'inventory_read', d.summary.id))
              .sort((a, b) => a.summary.id.localeCompare(b.summary.id))
              .map((d) => ({
                ...endpointProjection(d),
                inventoryAvailable: d.summary.inventoryAvailable,
              }))
      const selected = items.filter((d) => d.id > (query.get('after') ?? '')),
        limit = Number(query.get('limit') ?? 20)
      return ok({
        items: selected.slice(0, limit),
        statistics: {
          total: items.length,
          pending: items.filter((d) => d.status === 'pending').length,
          active: items.filter((d) => d.status === 'active').length,
          revoked: items.filter((d) => d.status === 'revoked').length,
        },
        asOf: Math.floor(Date.now() / 1000),
        nextCursor: selected.length > limit ? selected[limit - 1]!.id : null,
      })
    }
    const endpointPath = /^\/api\/v1\/devices\/([^/]+)(?:\/(timeline))?$/.exec(path)
    if (endpointPath && method === 'GET') {
      const id = decodeURIComponent(endpointPath[1]!),
        d = devices.get(id)
      if (!d || !can(request.actor.principalId, 'inventory_read', id))
        return error('inventory_not_found', 404)
      if (!endpointPath[2]) return ok(endpointDetailProjection(d))
      const page = pages.page(
        path,
        [...d.history].reverse().map((e) => ({
          source: 'mdm.business',
          eventId: e.id,
          position: 1,
          recordedAt: e.at,
          observedAt: e.at,
          actorKind: 'user',
          actor: request.actor.principalId,
          action: e.event,
          target: id,
          deviceId: id,
          operationId: e.operation,
          relatedOperationIds: [],
          requestId: null,
          registrationId: null,
          registrationRequestId: null,
          instanceId: null,
          auditOutcome: 'succeeded',
          phase: 'business',
          executionState: null,
          effect: 'unverified',
          requestWriteOutcome: null,
          supported: true,
        })),
        query,
      )
      return ok({
        items: page.items,
        nextCursor: page.nextCursor,
        coverage: { indexedThrough: 1, sourceThrough: 1, complete: true },
      })
    }
    const batchPath =
      /^\/api\/v1\/mdm-candidate\/devices\/batch-previews(?:\/([^/]+)(?:\/(execute|cancel))?)?$/.exec(
        path,
      )
    if (batchPath) {
      const id = batchPath[1],
        existing = id ? batches.get(id) : undefined
      if (method === 'GET')
        return existing ? candidate(existing) : error('operation_not_found', 404)
      if (method !== 'POST') return
      const op = operation(request.body)
      return receipts.write(request, op.operationId, () => {
        if (!id) {
          const input = closed(op.input, ['action', 'devices']),
            action = enumeration(input['action'], lifecycleActions)
          const targets = [...new Set(array(input['devices'], identifier))]
          if (!targets.length || op.expectedRevision !== 0) return error('malformed_request', 400)
          const batch: Batch = {
            id: op.operationId,
            revision: 1,
            phase: 'preview',
            action,
            targets: targets.map((id, index) => {
              const device = devices.get(id),
                registration = device?.registrations.find((r) => r.status === 'active')
              const onboarding = ['ade', 'windows_auto', 'onboard'].includes(action)
              const blocked = !device
                ? 'permission_denied'
                : (action === 'ade' && device.summary.platform !== 'macos') ||
                    (action === 'windows_auto' && device.summary.platform !== 'windows')
                  ? 'unsupported'
                  : !registration && !onboarding
                    ? 'not_registered'
                    : scenario === 'partial'
                      ? (
                          [
                            'offline',
                            'stale_generation',
                            'permission_denied',
                            'unsupported',
                            null,
                          ] as const
                        )[index % 5]!
                      : null
              return {
                device: id,
                deviceRevision: device?.summary.revision ?? null,
                registration: registration?.registrationId ?? null,
                generation: registration?.generation ?? null,
                blocked,
                execution: null,
                dispatch: 'not_requested',
                receipt: 'none',
                effect: 'unknown',
                compliance: 'unknown',
              }
            }),
          }
          batches.set(batch.id, batch)
          return candidate(batch)
        }
        if (!existing) return error('operation_not_found', 404)
        if (existing.revision !== op.expectedRevision || existing.phase !== 'preview')
          return error('operation_conflict')
        if (batchPath[2] === 'cancel') {
          closed(op.input, [])
          existing.phase = 'cancelled'
          existing.revision++
          return candidate(existing)
        }
        if (batchPath[2] !== 'execute' || closed(op.input, ['confirmed'])['confirmed'] !== true)
          return error('malformed_request', 400)
        for (const target of existing.targets) {
          const d = devices.get(target.device),
            registration = d?.registrations.find((r) => r.registrationId === target.registration)
          if (
            !target.blocked &&
            target.registration !== null &&
            (!registration ||
              registration.status !== 'active' ||
              registration.generation !== target.generation)
          )
            target.blocked = 'stale_generation'
          if (!target.blocked && (!d || d.summary.revision !== target.deviceRevision))
            target.blocked = 'conflict'
          target.dispatch = target.blocked ? 'blocked' : 'accepted'
          if (!target.blocked) {
            target.execution = randomUUID()
            target.receipt = 'pending'
            d?.history.push({
              id: randomUUID(),
              at: Math.floor(Date.now() / 1000),
              event: 'action_accepted',
              operation: op.operationId,
            })
          }
        }
        existing.phase = 'accepted'
        existing.revision++
        return candidate(existing, 202)
      })
    }
    const match = /^\/api\/v1\/mdm-candidate\/devices\/([^/]+)\/assignment$/.exec(path)
    if (!match) return
    const id = decodeURIComponent(match[1]!),
      d = devices.get(id)
    if (!d) return error('management_device_not_found', 404)
    const assignment = () => ({
      id,
      revision: d.summary.revision,
      owner: d.summary.owner,
      department: d.summary.department,
    })
    if (method === 'GET') return candidate(assignment())
    if (method !== 'PUT') return
    const op = operation(request.body)
    return receipts.write(request, op.operationId, () => {
      if (d.summary.revision !== op.expectedRevision) return error('operation_conflict')
      const input = closed(op.input, ['owner', 'department'])
      d.summary.owner = nullable(input['owner'], identifier)
      d.summary.department = nullable(input['department'], identifier)
      d.summary.revision++
      d.history.push({
        id: randomUUID(),
        at: Math.floor(Date.now() / 1000),
        event: 'assignment_changed',
        operation: op.operationId,
      })
      return candidate(assignment())
    })
  }
  const handle: DomainHandler = (request, scenario) => {
    if (
      !/^\/api\/(?:v1\/(?:asset-fields|device-queries|devices|device-views|device-associations|saved-queries|groups)|v1\/(?:enrollments|devices|self-enrollments|registration-quotas|registration-channels)|v1\/mdm-candidate\/(?:devices|groups))(?:\/|$)/.test(
        request.path,
      )
    )
      return
    if (scenario === 'denied') return error('permission_denied', 403)
    try {
      for (const handler of [
        views.handle,
        assets.handle,
        groups.handle,
        enrollments.handle,
        directory,
      ]) {
        const reply = handler(request, scenario)
        if (reply) return structuredClone(reply)
      }
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    registrationAllowed: enrollments.allowed,
    bindAuthorization: (value: typeof can) => {
      can = value
    },
    objects: () => views.objects(),
    facts: () => structuredClone([...devices.values()]),
    publishedGroup: groups.published,
    batches: () => structuredClone([...batches.values()]),
    tick(event: DemoEvent) {
      if (!['enrollment_bind', 'agent_binding'].includes(event.kind) || event.at < observedAt)
        return
      observedAt = event.at
      enrollments.tick(event)
      if (event.kind !== 'agent_binding' || typeof event.active !== 'boolean' || !event.device)
        return
      const d = devices.get(event.device),
        registrations =
          d?.registrations.filter((r) => r.source === 'agent.builtin' && r.status === 'active') ??
          []
      if (
        !d ||
        registrations.length !== 1 ||
        !d.architecture ||
        !['windows', 'macos'].includes(d.summary.platform)
      )
        return
      const r = registrations[0]!
      d.agentBindings = [
        ...(d.agentBindings ?? []).filter((b) => b.registration !== r.registrationId),
        {
          registration: r.registrationId,
          generation: r.generation,
          wireVersion: 3,
          platform: d.summary.platform as 'windows' | 'macos',
          architecture: d.architecture,
          capabilities: event.active ? ['software.execute.v3'] : [],
        },
      ]
      d.bootstrapBindings = [
        ...(d.bootstrapBindings ?? []).filter((b) => b.registration !== r.registrationId),
        ...(event.active
          ? [
              {
                registration: r.registrationId,
                generation: r.generation,
                capability: 'mdm.enroll.v1' as const,
              },
            ]
          : []),
      ]
      d.summary.revision++
      d.history.push({
        id: randomUUID(),
        at: event.at,
        event: 'agent_binding_observed',
        operation: null,
      })
    },
    reset() {
      devices = makeDevices()
      observedAt = Math.floor(Date.now() / 1000)
      assets.reset()
      groups.reset()
      enrollments.reset()
      pages.reset()
      receipts.reset()
      batches.clear()
      views.reset()
    },
  }
}
