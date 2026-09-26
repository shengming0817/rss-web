import type { Operation } from '../../../services/useOperation'
/** Candidate devices-v1 projection, owned by rss-mdm; not a published backend contract. */
import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  identifier,
  integer,
  nullable,
  unique,
  uuid,
} from '../../../services/decode'
import { cursor, resolvedField } from './asset-model'
import { groupSummary } from './groups'
export const lifecycleActions = [
  'ade',
  'windows_auto',
  'onboard',
  'reassign',
  'lost',
  'retire',
  'wipe',
  'add_agent',
  'add_mdm',
] as const
export type LifecycleAction = (typeof lifecycleActions)[number]
function envelope(value: unknown, tenant: string, demo: boolean, keys: string[]) {
  const v = closed(value, ['contract', 'tenantId', 'source', ...keys])
  if (v['contract'] !== 'devices-v1' || uuid(v['tenantId']) !== tenant)
    throw new Error('Wrong candidate contract')
  const source = enumeration(v['source'], ['real', 'mock'] as const)
  if (!demo && source === 'mock') throw new Error('Unexpected simulated data')
  return v
}
export function deviceSummary(value: unknown) {
  const v = closed(value, [
    'id',
    'name',
    'platform',
    'status',
    'inventoryAvailable',
    'revision',
    'channels',
    'owner',
    'department',
  ])
  return {
    id: identifier(v['id']),
    name: identifier(v['name']),
    platform: enumeration(v['platform'], ['windows', 'macos', 'unknown'] as const),
    status: enumeration(v['status'], ['pending', 'registered', 'revoked', 'retired'] as const),
    inventoryAvailable: boolean(v['inventoryAvailable']),
    revision: count(v['revision']),
    channels: unique(
      array(v['channels'], (v) => enumeration(v, ['mdm', 'agent'] as const)),
      (v) => v,
    ),
    owner: nullable(v['owner'], identifier),
    department: nullable(v['department'], identifier),
  }
}
export type DeviceSummary = ReturnType<typeof deviceSummary>
export function decodeDirectory(value: unknown, tenant: string, demo: boolean) {
  const v = envelope(value, tenant, demo, ['snapshot', 'items', 'nextCursor', 'statistics'])
  const s = closed(v['statistics'], ['total', 'pending', 'windows', 'macos', 'withInventory'])
  return {
    snapshot: uuid(v['snapshot']),
    items: unique(array(v['items'], deviceSummary), (d) => d.id),
    nextCursor: cursor(v['nextCursor']),
    statistics: {
      total: count(s['total']),
      pending: count(s['pending']),
      windows: count(s['windows']),
      macos: count(s['macos']),
      withInventory: count(s['withInventory']),
    },
  }
}
export function decodeDeviceDetail(value: unknown, tenant: string, demo: boolean, id: string) {
  const v = envelope(value, tenant, demo, ['device', 'readiness', 'capabilities', 'enrollments'])
  const device = deviceSummary(v['device'])
  if (device.id !== id) throw new Error('Wrong device')
  return {
    device,
    readiness: enumeration(v['readiness'], [
      'unknown',
      'pending_token',
      'ready',
      'offline',
    ] as const),
    capabilities: array(v['capabilities'], (item) => {
      const c = closed(item, ['action', 'channel', 'support'])
      return {
        action: enumeration(c['action'], lifecycleActions),
        channel: enumeration(c['channel'], ['mdm', 'agent'] as const),
        support: enumeration(c['support'], ['supported', 'unsupported', 'unknown'] as const),
      }
    }),
    enrollments: unique(array(v['enrollments'], uuid), (v) => v),
  }
}
function batchTarget(value: unknown) {
  const v = closed(value, [
    'device',
    'deviceRevision',
    'registration',
    'generation',
    'blocked',
    'execution',
    'dispatch',
    'receipt',
    'effect',
    'compliance',
  ])
  return {
    device: identifier(v['device']),
    deviceRevision: nullable(v['deviceRevision'], count),
    registration: nullable(v['registration'], uuid),
    generation: nullable(v['generation'], count),
    blocked: nullable(v['blocked'], (v) =>
      enumeration(v, [
        'stale_generation',
        'offline',
        'permission_denied',
        'unsupported',
        'not_registered',
        'conflict',
      ] as const),
    ),
    execution: nullable(v['execution'], uuid),
    dispatch: enumeration(v['dispatch'], [
      'not_requested',
      'accepted',
      'blocked',
      'unknown',
    ] as const),
    receipt: enumeration(v['receipt'], ['none', 'pending', 'acknowledged', 'failed'] as const),
    effect: enumeration(v['effect'], ['unknown', 'not_observed', 'observed'] as const),
    compliance: enumeration(v['compliance'], ['unknown', 'compliant', 'noncompliant'] as const),
  }
}
export function decodeBatch(value: unknown, tenant: string, demo: boolean) {
  const v = envelope(value, tenant, demo, ['id', 'revision', 'action', 'phase', 'targets'])
  return {
    id: uuid(v['id']),
    revision: count(v['revision']),
    action: enumeration(v['action'], lifecycleActions),
    phase: enumeration(v['phase'], ['preview', 'accepted', 'cancelled'] as const),
    targets: unique(array(v['targets'], batchTarget), (t) => t.device),
  }
}
export type Batch = ReturnType<typeof decodeBatch>
export function createDirectoryClient(transport: HttpTransport, tenant: string, demo: boolean) {
  function batch(value: unknown, id: string) {
    const result = decodeBatch(value, tenant, demo)
    if (result.id !== id) throw new Error('Wrong batch')
    return result
  }
  return {
    list: (next?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/devices',
        query: { limit: 20, cursor: next },
        successStatus: 200,
        decode: (v) => decodeDirectory(v, tenant, demo),
      }),
    detail: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/devices/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => decodeDeviceDetail(v, tenant, demo, id),
      }),
    hardware: (id: string, next?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/devices/{id}/hardware',
        pathParams: { id },
        query: { limit: 20, cursor: next },
        successStatus: 200,
        decode: (value) => {
          const v = envelope(value, tenant, demo, ['device', 'snapshot', 'items', 'nextCursor'])
          if (v['device'] !== id) throw new Error('Wrong hardware')
          return {
            snapshot: uuid(v['snapshot']),
            items: array(v['items'], resolvedField),
            nextCursor: cursor(v['nextCursor']),
          }
        },
      }),
    software: (id: string, next?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/devices/{id}/software',
        pathParams: { id },
        query: { limit: 20, cursor: next },
        successStatus: 200,
        decode: (value) => {
          const v = envelope(value, tenant, demo, [
            'device',
            'snapshot',
            'state',
            'items',
            'nextCursor',
          ])
          if (v['device'] !== id) throw new Error('Wrong software')
          return {
            snapshot: uuid(v['snapshot']),
            state: enumeration(v['state'], ['known', 'missing', 'unsupported', 'partial'] as const),
            items: array(v['items'], (item) => {
              const s = closed(item, ['id', 'name', 'version'])
              return {
                id: identifier(s['id']),
                name: identifier(s['name']),
                version: resolvedField(s['version']),
              }
            }),
            nextCursor: cursor(v['nextCursor']),
          }
        },
      }),
    history: (id: string, next?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/devices/{id}/history',
        pathParams: { id },
        query: { limit: 20, cursor: next },
        successStatus: 200,
        decode: (value) => {
          const v = envelope(value, tenant, demo, ['device', 'snapshot', 'items', 'nextCursor'])
          if (v['device'] !== id) throw new Error('Wrong history')
          return {
            snapshot: uuid(v['snapshot']),
            items: array(v['items'], (item) => {
              const e = closed(item, ['id', 'at', 'event', 'operation'])
              return {
                id: uuid(e['id']),
                at: integer(e['at']),
                event: enumeration(e['event'], [
                  'enrollment_requested',
                  'registration_bound',
                  'credential_revoked',
                  'assignment_changed',
                  'action_accepted',
                  'action_cancelled',
                ] as const),
                operation: nullable(e['operation'], uuid),
              }
            }),
            nextCursor: cursor(v['nextCursor']),
          }
        },
      }),
    assign: (id: string, body: Operation<{ owner: string | null; department: string | null }>) =>
      transport.request({
        method: 'PUT',
        path: '/api/mdm-candidate/v1/devices/{id}/assignment',
        pathParams: { id },
        body,
        successStatus: 200,
        decode: (v) => decodeDeviceDetail(v, tenant, demo, id),
      }),
    groups: (next?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/groups',
        query: { limit: 20, cursor: next },
        successStatus: 200,
        decode: (value) => {
          const v = envelope(value, tenant, demo, ['snapshot', 'items', 'nextCursor'])
          return {
            snapshot: uuid(v['snapshot']),
            items: array(v['items'], groupSummary),
            nextCursor: cursor(v['nextCursor']),
          }
        },
      }),
    preview: (body: Operation<{ action: LifecycleAction; devices: string[] }>) =>
      transport.request({
        method: 'POST',
        path: '/api/mdm-candidate/v1/devices/batch-previews',
        body,
        successStatus: 200,
        decode: (v) => batch(v, body.operationId),
      }),
    execute: (id: string, body: Operation<{ confirmed: true }>) =>
      transport.request({
        method: 'POST',
        path: '/api/mdm-candidate/v1/devices/batch-previews/{id}/execute',
        pathParams: { id },
        body,
        successStatus: 202,
        decode: (v) => batch(v, id),
      }),
    cancel: (id: string, body: Operation<Record<string, never>>) =>
      transport.request({
        method: 'POST',
        path: '/api/mdm-candidate/v1/devices/batch-previews/{id}/cancel',
        pathParams: { id },
        body,
        successStatus: 200,
        decode: (v) => batch(v, id),
      }),
    batch: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/devices/batch-previews/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => {
          const result = decodeBatch(v, tenant, demo)
          if (result.id !== id) throw new Error('Wrong batch')
          return result
        },
      }),
  }
}
