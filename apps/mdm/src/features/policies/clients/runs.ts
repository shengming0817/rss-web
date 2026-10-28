import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import { windowParameters, windowPage, type WindowQuery } from '@rss/api/mdm-query'
import { subject } from '../../security/clients/credentials'
import { jsonValue } from '../../../services/json'
import type { HttpTransport } from '@rss/api/mdm'

import {
  array,
  count,
  digest,
  enumeration,
  identifier,
  integer,
  nullable,
  string,
  uuid,
} from '../../../services/decode'
function diagnostics(value: unknown, detail: boolean) {
  if (detail) {
    if (!wireSchemas.getApiV1PoliciesByIdRunsByTaskResponse.validateTaskDiagnostics(value))
      throw new Error('Invalid diagnostics')
  } else if (!wireSchemas.getApiV1PoliciesByIdRunsResponse.validateDiagnosticsSummary(value))
    throw new Error('Invalid diagnostics')
  const d = value
  function stream(v: unknown) {
    if (typeof v !== 'string' || new TextEncoder().encode(v).byteLength > 16384)
      throw new Error('Invalid diagnostics')
    return v
  }
  return {
    durationMs: count(d['durationMs']),
    executedAt: integer(d['executedAt']),
    failure: nullable(d['failure'], (v) => v),
    ...('stdout' in d && 'stderr' in d
      ? { stdout: stream(d.stdout), stderr: stream(d.stderr) }
      : {}),
  }
}
function result(value: unknown, detail: boolean) {
  if (detail) {
    if (!wireSchemas.getApiV1PoliciesByIdRunsByTaskResponse.validateRunResult(value))
      throw new Error('Invalid run result')
  } else if (!wireSchemas.getApiV1PoliciesByIdRunsResponse.validateSummaryResult(value))
    throw new Error('Invalid run result')
  const materialText = (value: unknown) => {
    const text = string(value)
    if (!text || new TextEncoder().encode(text).byteLength > 1024 || /\p{Cc}/u.test(text))
      throw new Error('Invalid observed text')
    return text
  }
  if ('entryOutcome' in value) {
    const v = value
    if ('diagnostics' in v && v['diagnostics'] !== null)
      throw new Error('Invalid enrollment diagnostics')
    return {
      kind: 'enrollment' as const,
      entryOutcome: v['entryOutcome'],
    }
  }
  if ('recoveredByTask' in value) {
    const v = value
    if ('diagnostics' in v && v['diagnostics'] !== null)
      throw new Error('Invalid recovery diagnostics')
    return {
      kind: 'credential_recovery' as const,
      effect: v['effect'],
      recoveredByTask: uuid(v['recoveredByTask']),
      recoveredByAttempt: nullable(v['recoveredByAttempt'], uuid),
    }
  }
  if ('complete' in value && 'items' in value) {
    const v = value
    if ('diagnostics' in v && v['diagnostics'] !== null)
      throw new Error('Invalid credential diagnostics')
    return {
      kind: 'credential' as const,
      recovery: nullable(v['recovery'], (x) => x),
      failure: nullable(v['failure'], (x) => x),
      definitionDigest: digest(v['definitionDigest']),
      complete: v['complete'],
      items: array(v['items'], (value) => {
        const i = value,
          target = subject(i['subject'])
        if (!['rss_login', 'bitlocker', 'local_administrator'].includes(target.kind))
          throw new Error('Wrong credential subject')
        return {
          subject: target,
          outcome: i['outcome'],
        }
      }),
    }
  }
  // Native history spans immutable Policy versions, including prior script versions.
  if ('exitCode' in value) {
    const v = value
    const outputReference = nullable(v['outputReference'], (value) => {
      const r = value,
        hash = string(r['sha256'])
      if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('Invalid output reference')
      return { bytes: count(r['bytes']), sha256: hash }
    })
    if ('output' in v && outputReference !== null && v.output !== null)
      throw new Error('Inconsistent output reference')
    return {
      kind: 'script' as const,
      collectedAt: integer(v['collectedAt']),
      receivedAt: integer(v['receivedAt']),
      budgetValid: v['budgetValid'],
      outputReference,
      exitCode: nullable(v['exitCode'], integer),
      quality: v['quality'],
      schemaValid: v['schemaValid'],
      diagnostics: diagnostics(v['diagnostics'], detail),
      trusted: v['trusted'],
      ...('output' in v ? { output: jsonValue(v.output, 1024 * 1024) } : {}),
    }
  }
  if ('queries' in value) {
    const v = value
    if (!detail && 'diagnostics' in v && v['diagnostics'] !== null)
      throw new Error('Invalid collection diagnostics')
    const reference = v['outputReference'],
      sha256 = string(reference['sha256'])
    if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('Invalid collection output reference')
    return {
      kind: 'collection' as const,
      queries: Object.fromEntries(
        Object.entries(v['queries']).map(([id, value]) => {
          const q = value
          return [
            identifier(id),
            {
              queryDigest: digest(q['queryDigest']),
              collectedAt: integer(q['collectedAt']),
              status: q['status'],
              enumerationComplete: q['enumerationComplete'],
              rowCount: count(q['rowCount']),
            },
          ]
        }),
      ),
      planDigest: digest(v['planDigest']),
      outputReference: { bytes: count(reference['bytes']), sha256 },
      trusted: v['trusted'],
      receivedAt: integer(v['receivedAt']),
      ...('native' in v ? { native: jsonValue(v.native, 16 * 1024 * 1024) } : {}),
    }
  }
  if ('bindingId' in value) return { kind: 'access' as const, evidence: value }
  if ('unmanageOutcome' in value) return { kind: 'unmanage' as const, evidence: value }
  if ('operation' in value) return { kind: 'native_software' as const, evidence: value }
  if (!('intent' in value) || !('evidence' in value)) throw new Error('Unsupported run result')
  const v = value,
    intent = v.intent,
    definitionDigest = digest(v['definitionDigest']),
    evidence = v['evidence']
  if (
    evidence['intent'] !== intent ||
    JSON.stringify(digest(evidence['definitionDigest'])) !== JSON.stringify(definitionDigest)
  )
    throw new Error('Wrong software evidence binding')
  const steps = array(evidence['steps'], (value) => {
    const step = value,
      target = step['target'],
      targetKind = target.kind
    function observation(value: unknown) {
      if (
        !wireSchemas.getApiV1PoliciesByIdRunsByTaskResponse.validateSoftwareDetectionObservation(
          value,
        )
      )
        throw new Error('Invalid detection evidence')
      return value.state === 'present' ? { ...value, version: materialText(value.version) } : value
    }
    const process = step['process'],
      pk = process.kind
    return {
      stepId: digest(step.stepId),
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
                failure: process['failure'],
              }
            : { kind: pk },
      rebootRequired: step['rebootRequired'],
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
    effect: v['effect'],
    effectObservedAt: nullable(v['effectObservedAt'], integer),
  }
}
export function runState(value: unknown) {
  if (!wireSchemas.getApiV1OperationsResponse.validateRunState(value))
    throw new Error('Invalid contract value')

  const v = value,
    d = v['delivery'],
    kind = d.kind
  return {
    delivery:
      kind === 'queued'
        ? { kind }
        : { kind, attempt: uuid(d['attempt']), leaseUntil: integer(d['leaseUntil']) },
    execution: v['execution'],
    cancellation: v['cancellation'],
    deadline: integer(v['deadline']),
    startedAt: nullable(v['startedAt'], integer),
  }
}
function scriptAuthorization(value: unknown) {
  if (!wireSchemas.getApiV1PoliciesByIdRunsByTaskResponse.validateTaskAuthorization(value))
    throw new Error('Invalid contract value')

  const kind = value['kind']
  if (kind === 'policy') {
    const v = value
    return { kind, policyId: uuid(v['policyId']), policyVersion: uuid(v['policyVersion']) }
  }
  const v = value,
    rawSubject = v['subject'],
    subjectKind = rawSubject['kind'],
    subject =
      subjectKind === 'device'
        ? ({ ...rawSubject } as { kind: 'device' })
        : {
            kind: subjectKind,
            user: (() => {
              const u = rawSubject['user']
              return {
                tenantId: uuid(u['tenantId']),
                instanceId: uuid(u['instanceId']),
                principalId: uuid(u['principalId']),
              }
            })(),
          },
    source = v['source'],
    allowAi = v['allowAi'],
    confirmed = v['confirmed'],
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
export function decodeRunEvidence(value: unknown) {
  if (!wireSchemas.getApiV1OperationsResponse.validateRunEvidence(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    kind: 'action_run' as const,
    state: runState(v['state']),
    effect: enumeration(v['effect'], [
      'not_attempted',
      'unchanged',
      'applied',
      'unverified',
      'verified',
      'unknown',
      'waiting_reboot',
      'failed',
    ] as const),
    result: nullable(v['result'], (value) => result(value, false)),
  }
}
export function policyRun(value: unknown, detail: boolean) {
  if (
    !wireSchemas.getApiV1PoliciesByIdRunsByTaskResponse.validateRoot(value) &&
    !wireSchemas.getApiV1PoliciesByIdRunsResponse.validateRunSummary(value)
  )
    throw new Error('Invalid contract value')
  if (detail !== 'nodes' in value) throw new Error('Wrong run representation')

  const v = value
  const state = runState(v['state']),
    deadline = integer(v['deadline'])
  if (
    'attemptId' in v &&
    v.attemptId !== null &&
    (state.delivery.kind === 'queued' || uuid(v['attemptId']) !== state.delivery.attempt)
  )
    throw new Error('Inconsistent run attempt')
  if (state.deadline !== deadline) throw new Error('Inconsistent run deadline')
  return {
    ...('attemptId' in v && v.attemptId !== null ? { attemptId: uuid(v['attemptId']) } : {}),
    ...('authorization' in v && v.authorization !== null
      ? { authorization: scriptAuthorization(v['authorization']) }
      : {}),
    taskId: uuid(v['taskId']),
    device: identifier(v['device']),
    registrationId: uuid(v['registrationId']),
    generation: count(v['generation']),
    availableAt: integer(v['availableAt']),
    deadline,
    state,
    effect: enumeration(v['effect'], [
      'not_attempted',
      'unchanged',
      'applied',
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
          ...('policyId' in v && v.policyId !== null ? { policyId: uuid(v['policyId']) } : {}),
          ...('operationId' in v && v.operationId !== null
            ? { operationId: uuid(v['operationId']) }
            : {}),
        }
      : { occurrence: 'occurrence' in v ? string(v.occurrence) : '' }),
  }
}
export type PolicyRun = ReturnType<typeof policyRun>
export function createRunsClient(transport: HttpTransport) {
  return {
    list: (id: string, page: WindowQuery = {}) =>
      api.getApiV1PoliciesByIdRuns(
        transport,
        { pathParams: { id }, query: windowParameters({ limit: 20, ...page }, 1000) },
        (value) => windowPage(value, (v) => policyRun(v, false)),
      ),
    read: (id: string, task: string) =>
      api.getApiV1PoliciesByIdRunsByTask(transport, { pathParams: { id, task } }, (value) => {
        const run = policyRun(value, true)
        if (!('policyId' in run) || run.policyId !== id || run.taskId !== task)
          throw new Error('Wrong software run')
        return run
      }),
  }
}
