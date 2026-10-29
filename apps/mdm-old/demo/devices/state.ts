import { directoryPage, filterRows } from '../directory'
import { randomUUID } from 'node:crypto'
import type { DomainHandler, DemoEvent } from '../scenario'
import { makeDevices } from './fixtures'
import { endpointProjection, endpointDetailProjection, createDeviceViewsDemo } from './views'
import type { Permission } from '../../src/features/operations/clients/authorization'
import { ok, error } from '../http'
import { createAssetDemo } from './assets'
import { createGroupDemo } from './groups'
import { createEnrollmentDemo } from './enrollment'
export function createDeviceDemo() {
  let devices = makeDevices()
  let observedAt = Math.floor(Date.now() / 1000)
  const assets = createAssetDemo(() => devices),
    groups = createGroupDemo(
      () => devices,
      () => views.objects(),
    ),
    enrollments = createEnrollmentDemo(() => devices)
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
    if (['/api/v1/devices', '/api/v1/devices/statistics'].includes(path) && method === 'GET') {
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
      const lookup = (row: (typeof items)[number], field: string) =>
        field === 'channel'
          ? row.channels.map((c) => c.channel)
          : field === 'source'
            ? row.channels.map((c) => c.source)
            : row[field as keyof typeof row]
      if (path.endsWith('/statistics')) {
        const filtered = filterRows(items, query.get('filter'), lookup)
        return ok({
          statistics: {
            total: filtered.length,
            pending: filtered.filter((d) => d.status === 'pending').length,
            active: filtered.filter((d) => d.status === 'active').length,
            revoked: filtered.filter((d) => d.status === 'revoked').length,
          },
          asOf: Math.floor(Date.now() / 1000),
        })
      }
      return ok(directoryPage(items, request, ['id'], { defaultLimit: 64, lookup }))
    }
    const endpointPath = /^\/api\/v1\/devices\/([^/]+)(?:\/(timeline))?$/.exec(path)
    if (endpointPath && method === 'GET') {
      const id = decodeURIComponent(endpointPath[1]!),
        d = devices.get(id)
      if (!d || !can(request.actor.principalId, 'inventory_read', id))
        return error('inventory_not_found', 404)
      if (!endpointPath[2]) return ok(endpointDetailProjection(d))
      return
    }
  }
  const handle: DomainHandler = (request, scenario) => {
    const mockEnrollmentTarget =
      request.method === 'GET' &&
      /^\/api\/v1\/mdm-candidate\/devices\/self-enrollments\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/target$/i.test(
        request.path,
      )
    if (
      !mockEnrollmentTarget &&
      !/^\/api\/(?:v1\/(?:asset-fields|asset-retention-policies|asset-field-layout|device-queries|devices|device-views|device-associations|saved-queries|groups)|v1\/(?:enrollments|devices|self-enrollments|registration-quotas|registration-channels))(?:\/|$)/.test(
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
        if (reply) {
          if (['POST', 'PUT', 'DELETE'].includes(request.method) && reply.status < 300)
            groups.refresh()
          return structuredClone(reply)
        }
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
    handle,
    registrationAllowed: enrollments.allowed,
    bindAuthorization: (value: typeof can) => {
      can = value
    },
    objects: () => views.objects(),
    facts: () => structuredClone([...devices.values()]),
    publishedGroup: groups.published,
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
      groups.refresh()
    },
    reset() {
      devices = makeDevices()
      observedAt = Math.floor(Date.now() / 1000)
      assets.reset()
      groups.reset()
      enrollments.reset()
      views.reset()
    },
  }
}
