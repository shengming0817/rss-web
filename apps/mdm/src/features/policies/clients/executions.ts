import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  closed,
  count,
  enumeration,
  identifier,
  integer,
  nullable,
  record,
  string,
  unique,
  uuid,
} from '../../../services/decode'
import { jsonValue, type Json } from './resources'
import { candidate } from './candidate'
export type ExecutionOrigin =
  | {
      kind: 'policy'
      policy: string
      revision: number
      cancellation: 'none' | 'requested' | 'confirmed'
      output: Json
    }
  | { kind: 'native'; operation: string }
  | { kind: 'workflow'; workflow: string; run: string; step: string }
  | { kind: 'device_batch'; batch: string }
function origin(value: unknown): ExecutionOrigin {
  const kind = enumeration(record(value)['kind'], [
    'policy',
    'native',
    'workflow',
    'device_batch',
  ] as const)
  if (kind === 'policy') {
    const v = closed(value, ['kind', 'policy', 'revision', 'cancellation', 'output'])
    return {
      kind,
      policy: identifier(v['policy']),
      revision: count(v['revision']),
      cancellation: enumeration(v['cancellation'], ['none', 'requested', 'confirmed'] as const),
      output: jsonValue(v['output'], 65536),
    }
  }
  if (kind === 'native') {
    const v = closed(value, ['kind', 'operation'])
    return { kind, operation: uuid(v['operation']) }
  }
  if (kind === 'device_batch') {
    const v = closed(value, ['kind', 'batch'])
    return { kind, batch: uuid(v['batch']) }
  }
  const v = closed(value, ['kind', 'workflow', 'run', 'step'])
  return { kind, workflow: uuid(v['workflow']), run: uuid(v['run']), step: uuid(v['step']) }
}
export function executionSummary(value: unknown) {
  const v = closed(value, [
    'id',
    'batch',
    'device',
    'origin',
    'admission',
    'dispatch',
    'receipt',
    'execution',
    'effect',
    'compliance',
    'attempt',
    'nativeCode',
    'waitingReason',
  ])
  return {
    id: uuid(v['id']),
    batch: nullable(v['batch'], uuid),
    device: identifier(v['device']),
    origin: origin(v['origin']),
    admission: enumeration(v['admission'], ['accepted', 'blocked', 'unknown'] as const),
    dispatch: enumeration(v['dispatch'], [
      'not_requested',
      'queued',
      'published',
      'unknown',
    ] as const),
    receipt: enumeration(v['receipt'], ['not_received', 'received', 'unknown'] as const),
    execution: enumeration(v['execution'], [
      'not_started',
      'running',
      'succeeded',
      'failed',
      'cancelled',
      'unknown',
    ] as const),
    effect: enumeration(v['effect'], [
      'unverified',
      'verified_present',
      'verified_absent',
      'unknown',
    ] as const),
    compliance: enumeration(v['compliance'], ['unknown'] as const),
    attempt: nullable(v['attempt'], uuid),
    nativeCode:
      v['nativeCode'] === null
        ? null
        : typeof v['nativeCode'] === 'number'
          ? integer(v['nativeCode'])
          : string(v['nativeCode']),
    waitingReason: nullable(v['waitingReason'], (value) =>
      enumeration(value, [
        'approval',
        'offline',
        'maintenance_window',
        'trigger',
        'capability',
        'authorization',
        'device_receipt',
        'effect_verification',
        'cancel_confirmation',
      ] as const),
    ),
  }
}
export type ExecutionSummary = ReturnType<typeof executionSummary>
export function createExecutionsClient(transport: HttpTransport, tenant: string, demo: boolean) {
  return {
    list: (cursor?: string, batch?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/executions',
        query: { limit: 20, cursor, batch },
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, ['snapshot', 'items', 'nextCursor'])
          return {
            snapshot: uuid(v['snapshot']),
            items: unique(array(v['items'], executionSummary), (e) => e.id),
            nextCursor: nullable(v['nextCursor'], string),
          }
        },
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/executions/{id}',
        pathParams: { id },
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, ['execution'])
          const e = executionSummary(v['execution'])
          if (e.id !== id) throw new Error('Wrong execution')
          return e
        },
      }),
  }
}
