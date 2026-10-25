import { queryParameters, nextCursor, type DirectoryQuery } from '../../../services/directory-query'
import { jsonValue, type Json } from '../../../services/json'
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
import { decodeRunEvidence } from './runs'

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
    directory: (query: DirectoryQuery = {}) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/operations',
        query: queryParameters({ limit: 20, ...query }),
        successStatus: 200,
        decode(value) {
          const page = closed(value, ['items', 'nextCursor'])
          return {
            items: array(page['items'], (value) => {
              const row = closed(
                value,
                [
                  'id',
                  'kind',
                  'device',
                  'registrationId',
                  'generation',
                  'origin',
                  'policy',
                  'deadline',
                  'status',
                ],
                ['evidence'],
              )
              const kind = enumeration(row['kind'], ['command', 'action_run'] as const)
              const policy = nullable(row['policy'], uuid)
              if (kind === 'action_run' && policy === null) throw new Error('Missing run policy')
              if (
                (query.fields === undefined || query.fields.includes('evidence')) !==
                'evidence' in row
              )
                throw new Error('Wrong evidence projection')
              const evidence = !('evidence' in row)
                ? undefined
                : kind === 'action_run'
                  ? decodeRunEvidence(row['evidence'])
                  : (() => {
                      const raw = closed(
                        row['evidence'],
                        ['commandStatus', 'dispatchFailure'],
                        ['agentInstallation'],
                      )
                      return {
                        kind: 'command' as const,
                        commandStatus: identifier(raw['commandStatus']),
                        dispatchFailure: nullable(raw['dispatchFailure'], (v) =>
                          jsonValue(v, 16384),
                        ),
                        ...('agentInstallation' in raw
                          ? { agentInstallation: jsonValue(raw['agentInstallation'], 65536) }
                          : {}),
                      }
                    })()
              return {
                id: uuid(row['id']),
                kind,
                device: identifier(row['device']),
                policy,
                registrationId: uuid(row['registrationId']),
                generation: count(row['generation']),
                origin: enumeration(row['origin'], ['direct', 'policy'] as const),
                deadline: integer(row['deadline']),
                status: identifier(row['status']),
                evidence,
              }
            }),
            nextCursor: nextCursor(page['nextCursor']),
          }
        },
      }),
    statistics: (filter?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/operations/statistics',
        query: queryParameters({ filter }),
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['statistics', 'asOf']),
            stats = closed(v['statistics'], ['total', 'commands', 'actionRuns', 'unknown'])
          return {
            statistics: {
              total: count(stats['total']),
              commands: count(stats['commands']),
              actionRuns: count(stats['actionRuns']),
              unknown: count(stats['unknown']),
            },
            asOf: integer(v['asOf']),
          }
        },
      }),
  }
}
