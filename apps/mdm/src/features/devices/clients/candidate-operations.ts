import type { Operation } from '../../../services/useOperation'
/** Candidate devices-v1 projection, owned by rss-mdm; not a published backend contract. */
import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  unique,
  uuid,
} from '../../../services/decode'
import { cursor } from './asset-model'
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

function assignment(value: unknown, id: string, tenant: string, demo: boolean) {
  const v = envelope(value, tenant, demo, ['id', 'revision', 'owner', 'department'])
  if (identifier(v['id']) !== id) throw new Error('Wrong assignment endpoint')
  return {
    id,
    revision: count(v['revision']),
    owner: nullable(v['owner'], identifier),
    department: nullable(v['department'], identifier),
  }
}
export function createCandidateOperations(transport: HttpTransport, tenant: string, demo: boolean) {
  function batch(value: unknown, id: string) {
    const result = decodeBatch(value, tenant, demo)
    if (result.id !== id) throw new Error('Wrong batch')
    return result
  }
  return {
    assignment: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/devices/{id}/assignment',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => assignment(v, id, tenant, demo),
      }),
    assign: (id: string, body: Operation<{ owner: string | null; department: string | null }>) =>
      transport.request({
        method: 'PUT',
        path: '/api/v1/mdm-candidate/devices/{id}/assignment',
        pathParams: { id },
        body,
        successStatus: 200,
        decode: (v) => assignment(v, id, tenant, demo),
      }),
    groups: (next?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/groups',
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
        path: '/api/v1/mdm-candidate/devices/batch-previews',
        body,
        successStatus: 200,
        decode: (v) => batch(v, body.operationId),
      }),
    execute: (id: string, body: Operation<{ confirmed: true }>) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/mdm-candidate/devices/batch-previews/{id}/execute',
        pathParams: { id },
        body,
        successStatus: 202,
        decode: (v) => batch(v, id),
      }),
    cancel: (id: string, body: Operation<Record<string, never>>) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/mdm-candidate/devices/batch-previews/{id}/cancel',
        pathParams: { id },
        body,
        successStatus: 200,
        decode: (v) => batch(v, id),
      }),
    batch: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/devices/batch-previews/{id}',
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
