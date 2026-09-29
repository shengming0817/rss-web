import type { HttpTransport } from '@rss/api/mdm'
import { jsonValue } from '../../policies/clients/resources'
import {
  array,
  boolean,
  closed,
  count,
  digest,
  enumeration,
  identifier,
  integer,
  nullable,
  record,
  string,
  uuid,
} from '../../../services/decode'
function diagnostics(value: unknown, detail: boolean) {
  const d = closed(
    value,
    detail
      ? ['stdout', 'stderr', 'durationMs', 'executedAt', 'failure']
      : ['durationMs', 'executedAt', 'failure'],
  )
  function stream(v: unknown) {
    if (typeof v !== 'string' || new TextEncoder().encode(v).byteLength > 16384)
      throw new Error('Invalid diagnostics')
    return v
  }
  return {
    durationMs: count(d['durationMs']),
    executedAt: integer(d['executedAt']),
    failure: nullable(d['failure'], (v) =>
      enumeration(v, [
        'launch_failed',
        'timed_out',
        'cancelled',
        'non_zero_exit',
        'output_limit',
        'capture_failed',
      ] as const),
    ),
    ...(detail ? { stdout: stream(d['stdout']), stderr: stream(d['stderr']) } : {}),
  }
}
function result(value: unknown, detail: boolean) {
  // Native history spans immutable Policy versions, including prior script versions.
  if ('exitCode' in record(value)) {
    const v = closed(value, [
      'exitCode',
      'quality',
      'schemaValid',
      'diagnostics',
      'trusted',
      ...(detail ? ['output'] : []),
    ])
    return {
      kind: 'script' as const,
      exitCode: nullable(v['exitCode'], integer),
      quality: enumeration(v['quality'], ['complete', 'partial', 'truncated', 'failed'] as const),
      schemaValid: boolean(v['schemaValid']),
      diagnostics: diagnostics(v['diagnostics'], detail),
      trusted: boolean(v['trusted']),
      ...(detail ? { output: jsonValue(v['output'], 65536) } : {}),
    }
  }
  const v = closed(value, [
    'intent',
    'installerExitCode',
    'detection',
    'definitionDigest',
    'observedVersion',
    'evidenceDigest',
    'rebootRequired',
    'diagnostics',
    'effect',
  ])
  return {
    kind: 'software' as const,
    intent: enumeration(v['intent'], ['install', 'uninstall', 'detect'] as const),
    installerExitCode: nullable(v['installerExitCode'], integer),
    detection: enumeration(v['detection'], ['present', 'absent', 'unknown'] as const),
    definitionDigest: digest(v['definitionDigest']),
    observedVersion: nullable(v['observedVersion'], (value) => {
      const v = string(value)
      if (!v || new TextEncoder().encode(v).byteLength > 1024)
        throw new Error('Invalid observed version')
      return v
    }),
    evidenceDigest: digest(v['evidenceDigest']),
    rebootRequired: boolean(v['rebootRequired']),
    diagnostics: diagnostics(v['diagnostics'], detail),
    effect: enumeration(v['effect'], ['verified', 'unknown', 'waiting_reboot', 'failed'] as const),
  }
}
export function runState(value: unknown) {
  const v = closed(value, ['delivery', 'execution', 'cancellation', 'deadline', 'startedAt']),
    kind = enumeration(record(v['delivery'])['kind'], ['queued', 'claimed', 'received'] as const),
    d = closed(v['delivery'], kind === 'queued' ? ['kind'] : ['kind', 'attempt', 'leaseUntil'])
  return {
    delivery:
      kind === 'queued'
        ? { kind }
        : { kind, attempt: uuid(d['attempt']), leaseUntil: integer(d['leaseUntil']) },
    execution: enumeration(v['execution'], [
      'not_started',
      'running',
      'succeeded',
      'failed',
      'waiting_reboot',
      'unknown',
    ] as const),
    cancellation: enumeration(v['cancellation'], ['none', 'requested', 'confirmed'] as const),
    deadline: integer(v['deadline']),
    startedAt: nullable(v['startedAt'], integer),
  }
}
export function softwareRun(value: unknown, detail: boolean) {
  const v = closed(value, [
    'taskId',
    'device',
    'registrationId',
    'generation',
    'availableAt',
    'deadline',
    'state',
    'effect',
    'userAction',
    'result',
    ...(detail ? ['policyId'] : ['occurrence']),
  ])
  const state = runState(v['state']),
    deadline = integer(v['deadline'])
  if (state.deadline !== deadline) throw new Error('Inconsistent run deadline')
  return {
    taskId: uuid(v['taskId']),
    device: identifier(v['device']),
    registrationId: uuid(v['registrationId']),
    generation: count(v['generation']),
    availableAt: integer(v['availableAt']),
    deadline,
    state,
    effect: enumeration(v['effect'], [
      'unverified',
      'verified',
      'unknown',
      'waiting_reboot',
      'failed',
    ] as const),
    userAction: nullable(v['userAction'], (v) => enumeration(v, ['waiting_user'] as const)),
    result: nullable(v['result'], (v) => result(v, detail)),
    ...(detail ? { policyId: uuid(v['policyId']) } : { occurrence: string(v['occurrence']) }),
  }
}
export type SoftwareRun = ReturnType<typeof softwareRun>
export interface RunCursor {
  availableAt: number
  taskId: string
}
export function createRunsClient(transport: HttpTransport) {
  return {
    list: (id: string, cursor?: RunCursor) =>
      transport.request({
        method: 'GET',
        path: '/api/v2/policies/{id}/runs',
        pathParams: { id },
        query: { afterAt: cursor?.availableAt, afterId: cursor?.taskId },
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['items', 'nextCursor'])
          return {
            items: array(v['items'], (v) => softwareRun(v, false)),
            nextCursor: nullable(v['nextCursor'], (value) => {
              const c = closed(value, ['availableAt', 'taskId'])
              return { availableAt: integer(c['availableAt']), taskId: uuid(c['taskId']) }
            }),
          }
        },
      }),
    read: (id: string, task: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v2/policies/{id}/runs/{task}',
        pathParams: { id, task },
        successStatus: 200,
        decode(value) {
          const run = softwareRun(value, true)
          if (!('policyId' in run) || run.policyId !== id || run.taskId !== task)
            throw new Error('Wrong software run')
          return run
        },
      }),
  }
}
