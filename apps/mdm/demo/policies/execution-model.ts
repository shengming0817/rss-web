import type { Json } from '../../src/services/json'
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
  uuid,
} from '../../src/services/decode'
import { jsonValue } from '../../src/services/json'
/** Explicit demo execution facts; never a production endpoint DTO. */
export type ExecutionOrigin =
  | {
      kind: 'policy'
      policy: string
      revision: number
      basis: {
        source: 'resource' | 'configuration'
        resource: string
        version: string
        resourceDigest: string
        parameterDigest: string
        scope: string
        scopeRevision: number
        registrations: { id: string; generation: number }[]
        architecture: string | null
      }
      cancellation: 'none' | 'requested' | 'confirmed'
      output: Json
    }
  | { kind: 'native'; operation: string }
  | { kind: 'software'; policy: string; versionId: string; task: string }
  | { kind: 'security'; request: string }
function basis(value: unknown) {
  const b = closed(value, [
    'source',
    'resource',
    'version',
    'resourceDigest',
    'parameterDigest',
    'scope',
    'scopeRevision',
    'registrations',
    'architecture',
  ])
  return {
    source: enumeration(b['source'], ['resource', 'configuration'] as const),
    resource: identifier(b['resource']),
    version: identifier(b['version']),
    resourceDigest: identifier(b['resourceDigest']),
    parameterDigest: identifier(b['parameterDigest']),
    scope: uuid(b['scope']),
    scopeRevision: count(b['scopeRevision']),
    registrations: array(b['registrations'], (value) => {
      const r = closed(value, ['id', 'generation'])
      return { id: uuid(r['id']), generation: count(r['generation']) }
    }),
    architecture: nullable(b['architecture'], identifier),
  }
}
function origin(value: unknown): ExecutionOrigin {
  const kind = enumeration(record(value)['kind'], [
    'policy',
    'native',
    'software',
    'security',
  ] as const)
  if (kind === 'security') {
    const v = closed(value, ['kind', 'request'])
    return { kind, request: uuid(v['request']) }
  }
  if (kind === 'policy') {
    const v = closed(value, ['kind', 'policy', 'revision', 'basis', 'cancellation', 'output'])
    return {
      kind,
      policy: identifier(v['policy']),
      revision: count(v['revision']),
      basis: basis(v['basis']),
      cancellation: enumeration(v['cancellation'], ['none', 'requested', 'confirmed'] as const),
      output: jsonValue(v['output'], 65536),
    }
  }
  if (kind === 'native') {
    const v = closed(value, ['kind', 'operation'])
    return { kind, operation: uuid(v['operation']) }
  }
  if (kind === 'software') {
    const v = closed(value, ['kind', 'policy', 'versionId', 'task'])
    return {
      kind,
      policy: uuid(v['policy']),
      versionId: uuid(v['versionId']),
      task: uuid(v['task']),
    }
  }
  throw new Error('Unknown execution origin')
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
      'waiting_reboot',
      'unknown',
    ] as const),
    effect: enumeration(v['effect'], [
      'unverified',
      'verified_present',
      'verified_absent',
      'waiting_reboot',
      'failed',
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
        'offline',
        'maintenance_window',
        'trigger',
        'capability',
        'authorization',
        'device_receipt',
        'effect_verification',
        'cancel_confirmation',
        'user_action',
        'reboot',
      ] as const),
    ),
  }
}
export type ExecutionSummary = ReturnType<typeof executionSummary>
