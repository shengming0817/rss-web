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
  uuid,
} from '../../../services/decode'
import { decodeNativeObservation } from './native'
import { decodeRunEvidence } from './runs'
import { jsonValue, type Json } from './resources'
/** Facts still consumed by Security actions and explicit demo state, not an execution API envelope. */
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
export function createExecutionsClient(transport: HttpTransport) {
  return {
    directory: (
      query: {
        policy?: string | undefined
        device?: string | undefined
        kind?: 'command' | 'action_run' | undefined
        status?: string | undefined
        after?: string | undefined
        afterKind?: 'command' | 'action_run' | undefined
      } = {},
    ) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/operations',
        query: { ...query, limit: 20 },
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['items', 'nextCursor', 'statistics', 'asOf'])
          const stats = closed(v['statistics'], ['total', 'commands', 'actionRuns', 'unknown'])
          return {
            asOf: integer(v['asOf']),
            statistics: {
              total: count(stats['total']),
              commands: count(stats['commands']),
              actionRuns: count(stats['actionRuns']),
              unknown: count(stats['unknown']),
            },
            items: array(v['items'], (value) => {
              const i = closed(value, [
                'id',
                'kind',
                'device',
                'registrationId',
                'generation',
                'origin',
                'policy',
                'deadline',
                'status',
                'evidence',
                'detailUrl',
              ])
              const kind = enumeration(i['kind'], ['command', 'action_run'] as const),
                id = uuid(i['id']),
                device = identifier(i['device']),
                policy = nullable(i['policy'], uuid)
              const expected =
                kind === 'command'
                  ? `/api/v1/devices/${new URLSearchParams({ id: device }).toString().slice(3).replaceAll('+', '%20')}/operations/${id}`
                  : `/api/v1/policies/${policy}/runs/${id}`
              if ((kind === 'action_run' && !policy) || i['detailUrl'] !== expected)
                throw new Error('Wrong operation locator')
              return {
                id,
                kind,
                device,
                policy,
                registrationId: uuid(i['registrationId']),
                generation: count(i['generation']),
                origin: enumeration(i['origin'], ['direct', 'policy'] as const),
                deadline: integer(i['deadline']),
                status: identifier(i['status']),
                evidence:
                  kind === 'action_run'
                    ? decodeRunEvidence(i['evidence'])
                    : (() => {
                        const evidence = closed(
                          i['evidence'],
                          ['commandStatus', 'observation', 'dispatchFailure'],
                          ['agentInstallation'],
                        )
                        return {
                          kind: 'command' as const,
                          commandStatus: identifier(evidence['commandStatus']),
                          observation: decodeNativeObservation(evidence['observation']),
                          dispatchFailure: nullable(evidence['dispatchFailure'], (v) =>
                            jsonValue(v, 16384),
                          ),
                          agentInstallation: nullable(evidence['agentInstallation'] ?? null, (v) =>
                            jsonValue(v, 65536),
                          ),
                        }
                      })(),
              }
            }),
            nextCursor: nullable(v['nextCursor'], (value) => {
              const c = closed(value, ['id', 'kind'])
              return {
                id: uuid(c['id']),
                kind: enumeration(c['kind'], ['command', 'action_run'] as const),
              }
            }),
          }
        },
      }),
  }
}
