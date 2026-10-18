import type { HttpTransport } from '@rss/api/mdm'
import { jsonValue } from './resources'
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
  const materialText = (value: unknown) => {
    const text = string(value)
    if (!text || new TextEncoder().encode(text).byteLength > 1024 || /\p{Cc}/u.test(text))
      throw new Error('Invalid observed text')
    return text
  }
  if ('entryOutcome' in record(value)) {
    const v = closed(value, ['entryOutcome'], detail ? [] : ['diagnostics'])
    if ('diagnostics' in v && v['diagnostics'] !== null)
      throw new Error('Invalid enrollment diagnostics')
    return {
      kind: 'enrollment' as const,
      entryOutcome: enumeration(v['entryOutcome'], [
        'opened',
        'user_required',
        'third_party_conflict',
        'unsupported',
        'failed',
        'unknown',
      ] as const),
    }
  }
  // Native history spans immutable Policy versions, including prior script versions.
  if ('exitCode' in record(value)) {
    const v = closed(value, [
      'collectedAt',
      'receivedAt',
      'exitCode',
      'quality',
      'budgetValid',
      'outputReference',
      'schemaValid',
      'diagnostics',
      'trusted',
      ...(detail ? ['output'] : []),
    ])
    const outputReference = nullable(v['outputReference'], (value) => {
      const r = closed(value, ['bytes', 'sha256']),
        hash = string(r['sha256'])
      if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('Invalid output reference')
      return { bytes: count(r['bytes']), sha256: hash }
    })
    if (detail && outputReference !== null && v['output'] !== null)
      throw new Error('Inconsistent output reference')
    return {
      kind: 'script' as const,
      collectedAt: integer(v['collectedAt']),
      receivedAt: integer(v['receivedAt']),
      budgetValid: boolean(v['budgetValid']),
      outputReference,
      exitCode: nullable(v['exitCode'], integer),
      quality: enumeration(v['quality'], ['complete', 'partial', 'truncated', 'failed'] as const),
      schemaValid: boolean(v['schemaValid']),
      diagnostics: diagnostics(v['diagnostics'], detail),
      trusted: boolean(v['trusted']),
      ...(detail ? { output: jsonValue(v['output'], 1024 * 1024) } : {}),
    }
  }
  if ('queries' in record(value)) {
    const v = closed(
      value,
      [
        'queries',
        'planDigest',
        'outputReference',
        'trusted',
        'receivedAt',
        ...(detail ? ['native'] : []),
      ],
      detail ? [] : ['diagnostics'],
    )
    if (!detail && 'diagnostics' in v && v['diagnostics'] !== null)
      throw new Error('Invalid collection diagnostics')
    const reference = closed(v['outputReference'], ['bytes', 'sha256']),
      sha256 = string(reference['sha256'])
    if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('Invalid collection output reference')
    return {
      kind: 'collection' as const,
      queries: Object.fromEntries(
        Object.entries(record(v['queries'])).map(([id, value]) => {
          const q = closed(value, [
            'queryDigest',
            'collectedAt',
            'status',
            'enumerationComplete',
            'rowCount',
          ])
          return [
            identifier(id),
            {
              queryDigest: digest(q['queryDigest']),
              collectedAt: integer(q['collectedAt']),
              status: enumeration(q['status'], [
                'complete',
                'failed',
                'partial',
                'not_scanned',
                'source_unavailable',
                'user_absent',
                'store_unavailable',
                'unsupported',
                'denied',
                'timeout',
                'truncated',
                'missing',
                'invalid',
              ] as const),
              enumerationComplete: boolean(q['enumerationComplete']),
              rowCount: count(q['rowCount']),
            },
          ]
        }),
      ),
      planDigest: digest(v['planDigest']),
      outputReference: { bytes: count(reference['bytes']), sha256 },
      trusted: boolean(v['trusted']),
      receivedAt: integer(v['receivedAt']),
      ...(detail ? { native: jsonValue(v['native'], 16 * 1024 * 1024) } : {}),
    }
  }
  const v = closed(value, ['intent', 'definitionDigest', 'evidence', 'effect', 'effectObservedAt']),
    intent = enumeration(v['intent'], ['install', 'uninstall', 'detect'] as const),
    definitionDigest = digest(v['definitionDigest']),
    evidence = closed(v['evidence'], ['intent', 'definitionDigest', 'steps'])
  if (
    evidence['intent'] !== intent ||
    JSON.stringify(digest(evidence['definitionDigest'])) !== JSON.stringify(definitionDigest)
  )
    throw new Error('Wrong software evidence binding')
  const steps = array(evidence['steps'], (value) => {
    const step = closed(value, [
        'index',
        'stepDigest',
        'target',
        'package',
        'identity',
        'before',
        'after',
        'process',
        'rebootRequired',
        'diagnostics',
      ]),
      targetKind = enumeration(record(step['target'])['kind'], ['device', 'user'] as const),
      target = closed(
        step['target'],
        targetKind === 'device' ? ['kind'] : ['kind', 'identity', 'sessionId'],
      )
    function observation(value: unknown) {
      const state = enumeration(record(value)['state'], ['present', 'absent', 'unknown'] as const),
        v = closed(
          value,
          state === 'present'
            ? ['state', 'version', 'evidenceSha256', 'observedAt']
            : state === 'absent'
              ? ['state', 'evidenceSha256', 'observedAt']
              : ['state', 'diagnostic'],
        )
      if (state === 'unknown') return { state, diagnostic: string(v['diagnostic']) }
      return {
        state,
        evidenceSha256: digest(v['evidenceSha256']),
        observedAt: integer(v['observedAt']),
        ...(state === 'present' ? { version: materialText(v['version']) } : {}),
      }
    }
    const pk = enumeration(record(step['process'])['kind'], [
        'not_run',
        'exited',
        'failed',
      ] as const),
      process = closed(
        step['process'],
        pk === 'exited' ? ['kind', 'code'] : pk === 'failed' ? ['kind', 'failure'] : ['kind'],
      )
    return {
      index: count(step['index']),
      stepDigest: digest(step['stepDigest']),
      target:
        targetKind === 'device'
          ? { kind: targetKind }
          : {
              kind: targetKind,
              identity: identifier(target['identity']),
              sessionId: uuid(target['sessionId']),
            },
      package: materialText(step['package']),
      identity: jsonValue(step['identity'], 8192),
      before: observation(step['before']),
      after: observation(step['after']),
      process:
        pk === 'exited'
          ? { kind: pk, code: integer(process['code']) }
          : pk === 'failed'
            ? {
                kind: pk,
                failure: enumeration(process['failure'], [
                  'launch_failed',
                  'timed_out',
                  'cancelled',
                  'non_zero_exit',
                  'output_limit',
                  'capture_failed',
                ] as const),
              }
            : { kind: pk },
      rebootRequired: boolean(step['rebootRequired']),
      diagnostics: diagnostics(step['diagnostics'], detail),
    }
  })
  if (!steps.length || steps.length > 32 || steps.some((s, i) => s.index !== i))
    throw new Error('Invalid software step order')
  return {
    kind: 'software' as const,
    intent,
    definitionDigest,
    evidence: { intent, definitionDigest, steps },
    effect: enumeration(v['effect'], ['verified', 'unknown', 'waiting_reboot', 'failed'] as const),
    effectObservedAt: integer(v['effectObservedAt']),
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
function scriptAuthorization(value: unknown) {
  const kind = enumeration(record(value)['kind'], [
    'policy',
    'remote_operation',
    'self_service',
  ] as const)
  if (kind === 'remote_operation') {
    const v = closed(value, ['kind', 'operationId'])
    return { kind, operationId: uuid(v['operationId']) }
  }
  if (kind === 'policy') {
    const v = closed(value, ['kind', 'policyId', 'policyVersion'])
    return { kind, policyId: uuid(v['policyId']), policyVersion: uuid(v['policyVersion']) }
  }
  const v = closed(value, [
      'kind',
      'requestId',
      'subject',
      'source',
      'policyId',
      'policyRevision',
      'policyVersion',
      'allowAi',
      'riskLevel',
      'confirmed',
    ]),
    rawSubject = record(v['subject']),
    subjectKind = enumeration(rawSubject['kind'], ['device', 'user'] as const),
    subject =
      subjectKind === 'device'
        ? ({ kind: subjectKind, ...closed(rawSubject, ['kind']) } as { kind: 'device' })
        : {
            kind: subjectKind,
            user: (() => {
              const u = closed(closed(rawSubject, ['kind', 'user'])['user'], [
                'tenantId',
                'instanceId',
                'principalId',
              ])
              return {
                tenantId: uuid(u['tenantId']),
                instanceId: uuid(u['instanceId']),
                principalId: uuid(u['principalId']),
              }
            })(),
          },
    source = enumeration(v['source'], ['human', 'ai'] as const),
    allowAi = boolean(v['allowAi']),
    confirmed = boolean(v['confirmed']),
    riskLevel = count(v['riskLevel']),
    policyRevision = count(v['policyRevision'])
  if (
    policyRevision === 0 ||
    (riskLevel !== 1 && riskLevel !== 2) ||
    (source === 'ai' && (!allowAi || (riskLevel === 2 && !confirmed)))
  )
    throw new Error('Invalid script authorization')
  return {
    kind,
    requestId: uuid(v['requestId']),
    subject,
    source,
    policyId: uuid(v['policyId']),
    policyRevision,
    policyVersion: uuid(v['policyVersion']),
    allowAi,
    riskLevel,
    confirmed,
  }
}
export function policyRun(value: unknown, detail: boolean) {
  const v = closed(
    value,
    [
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
      ...(detail ? [] : ['occurrence']),
    ],
    ['attemptId', 'authorization', ...(detail ? ['policyId', 'operationId'] : [])],
  )
  const state = runState(v['state']),
    deadline = integer(v['deadline'])
  if (
    'attemptId' in v &&
    (state.delivery.kind === 'queued' || uuid(v['attemptId']) !== state.delivery.attempt)
  )
    throw new Error('Inconsistent run attempt')
  if (state.deadline !== deadline) throw new Error('Inconsistent run deadline')
  return {
    ...('attemptId' in v ? { attemptId: uuid(v['attemptId']) } : {}),
    ...('authorization' in v ? { authorization: scriptAuthorization(v['authorization']) } : {}),
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
    ...(detail
      ? {
          ...('policyId' in v ? { policyId: uuid(v['policyId']) } : {}),
          ...('operationId' in v ? { operationId: uuid(v['operationId']) } : {}),
        }
      : { occurrence: string(v['occurrence']) }),
  }
}
export type PolicyRun = ReturnType<typeof policyRun>
export interface RunCursor {
  availableAt: number
  taskId: string
}
export function createRunsClient(transport: HttpTransport) {
  return {
    list: (id: string, cursor?: RunCursor) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/policies/{id}/runs',
        pathParams: { id },
        query: { afterAt: cursor?.availableAt, afterId: cursor?.taskId },
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['items', 'nextCursor'])
          return {
            items: array(v['items'], (v) => policyRun(v, false)),
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
        path: '/api/v1/policies/{id}/runs/{task}',
        pathParams: { id, task },
        successStatus: 200,
        decode(value) {
          const run = policyRun(value, true)
          if (!('policyId' in run) || run.policyId !== id || run.taskId !== task)
            throw new Error('Wrong software run')
          return run
        },
      }),
  }
}
