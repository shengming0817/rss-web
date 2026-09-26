import { randomUUID } from 'node:crypto'
import type { DomainHandler } from '../scenario'
import { array, closed, enumeration, identifier, nullable } from '../../src/services/decode'
import { lifecycleActions, type Batch } from '../../src/features/devices/clients/directory'
import { makeDevices, fact } from './fixtures'
import { candidate } from './http'
import { createPages, createReceipts, error, operation } from '../http'
import { createAssetDemo } from './assets'
import { createGroupDemo } from './groups'
import { createEnrollmentDemo } from './enrollment'
export function createDeviceDemo() {
  let devices = makeDevices()
  const assets = createAssetDemo(() => devices),
    groups = createGroupDemo(() => devices),
    enrollments = createEnrollmentDemo(() => devices)
  const pages = createPages(),
    receipts = createReceipts(),
    batches = new Map<string, Batch>()
  const statistics = new Map<
    string,
    { total: number; pending: number; windows: number; macos: number; withInventory: number }
  >()
  function detail(id: string, offline = false) {
    const d = devices.get(id)!
    return {
      device: d.summary,
      readiness: offline
        ? 'offline'
        : d.summary.status === 'pending' || !d.summary.channels.length
          ? 'unknown'
          : d.summary.platform === 'macos'
            ? 'pending_token'
            : 'ready',
      capabilities: lifecycleActions.map((action) => ({
        action,
        channel: action === 'add_agent' ? 'mdm' : 'agent',
        support: 'unknown',
      })),
      enrollments: d.enrollments,
    }
  }
  const directory: DomainHandler = (request, scenario) => {
    const { path, method, query } = request
    if (path === '/api/mdm-candidate/v1/devices' && method === 'GET') {
      const items = scenario === 'empty' ? [] : [...devices.values()].map((d) => d.summary)
      const page = pages.page(path, items, query)
      if (!statistics.has(page.snapshot))
        statistics.set(page.snapshot, {
          total: items.length,
          pending: items.filter((d) => d.status === 'pending').length,
          windows: items.filter((d) => d.platform === 'windows').length,
          macos: items.filter((d) => d.platform === 'macos').length,
          withInventory: items.filter((d) => d.inventoryAvailable).length,
        })
      return candidate({
        ...page,
        statistics: statistics.get(page.snapshot),
      })
    }
    const batchPath =
      /^\/api\/mdm-candidate\/v1\/devices\/batch-previews(?:\/([^/]+)(?:\/(execute|cancel))?)?$/.exec(
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
    const match =
      /^\/api\/mdm-candidate\/v1\/devices\/([^/]+)(?:\/(hardware|software|history|assignment))?$/.exec(
        path,
      )
    if (!match) return
    const id = decodeURIComponent(match[1]!),
      d = devices.get(id)
    if (!d) return error('management_device_not_found', 404)
    if (method === 'PUT' && match[2] === 'assignment') {
      const op = operation(request.body)
      return receipts.write(request, op.operationId, () => {
        if (d.summary.revision !== op.expectedRevision) return error('operation_conflict')
        const v = closed(op.input, ['owner', 'department'])
        d.summary.owner = nullable(v['owner'], identifier)
        d.summary.department = nullable(v['department'], identifier)
        d.summary.revision++
        d.history.push({
          id: randomUUID(),
          at: Math.floor(Date.now() / 1000),
          event: 'assignment_changed',
          operation: op.operationId,
        })
        return candidate(detail(id))
      })
    }
    if (method !== 'GET') return
    if (match[2] === 'hardware')
      return candidate({
        device: id,
        ...pages.page(
          path,
          d.summary.inventoryAvailable
            ? [
                d.inventory.fields['device.model']!,
                fact(
                  'device.memory.bytes',
                  { kind: 'integer', value: 17179869184 },
                  'agent.builtin',
                ),
              ]
            : [],
          query,
        ),
      })
    if (match[2] === 'software')
      return candidate({
        device: id,
        state: d.summary.inventoryAvailable
          ? scenario === 'partial'
            ? 'partial'
            : 'known'
          : 'missing',
        ...pages.page(
          path,
          d.summary.inventoryAvailable
            ? [
                {
                  id: 'browser',
                  name: 'Enterprise Browser',
                  version: fact(
                    'custom.software.browser.version',
                    { kind: 'string', value: '128.0' },
                    'agent.builtin',
                  ),
                },
              ]
            : [],
          query,
        ),
      })
    if (match[2] === 'history')
      return candidate({ device: id, ...pages.page(path, [...d.history].reverse(), query) })
    return candidate(detail(id))
  }
  const handle: DomainHandler = (request, scenario) => {
    if (
      !/^\/api\/(?:v2\/(?:asset-fields|device-queries|devices|saved-queries|groups)|v3\/(?:enrollments|devices)|mdm-candidate\/v1\/(?:devices|groups))(?:\/|$)/.test(
        request.path,
      )
    )
      return
    if (scenario === 'denied') return error('permission_denied', 403)
    try {
      for (const handler of [assets.handle, groups.handle, enrollments.handle, directory]) {
        const reply = handler(request, scenario)
        if (reply) return structuredClone(reply)
      }
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    facts: () => structuredClone([...devices.values()]),
    publishedGroup: groups.published,
    batches: () => structuredClone([...batches.values()]),
    reset() {
      devices = makeDevices()
      assets.reset()
      groups.reset()
      enrollments.reset()
      pages.reset()
      receipts.reset()
      batches.clear()
      statistics.clear()
    },
  }
}
