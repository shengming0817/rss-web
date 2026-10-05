import { closed, count, enumeration, identifier, nullable, uuid } from '../../../services/decode'
export const auditActions = [
  'authorization_changed',
  'user_group_changed',
  'management_changed',
  'job_accepted',
  'job_observed',
  'request_succeeded',
  'request_failed',
  'identity_session_created',
  'compliance_saved',
  'compliance_recomputed',
  'compliance_evaluated',
  'alert_closed',
  'alert_opened',
  'alert_resolved',
  'alert_acknowledged',
  'baseline_saved',
  'request_created',
  'request_approved',
  'request_denied',
  'request_revoked',
  'request_expired',
  'request_decision_denied',
  'request_consumed',
  'risk_assessed',
  'security_dispatched',
  'security_result',
  'security_detected',
  'certificate_requested',
  'certificate_issued',
  'certificate_observed',
  'support_consent',
  'support_observed',
] as const
export const alertStates = ['open', 'resolved'] as const
export function candidate(value: unknown, tenant: string, demo: boolean, keys: string[]) {
  const v = closed(value, ['contract', 'tenantId', 'source', ...keys])
  if (v['contract'] !== 'operations-v1' || uuid(v['tenantId']) !== tenant)
    throw new Error('Wrong operations contract')
  const source = enumeration(v['source'], ['real', 'mock'] as const)
  if (!demo && source === 'mock') throw new Error('Unexpected simulated data')
  return v
}
export function reference(value: unknown) {
  const v = closed(value, ['kind', 'id', 'device', 'revision'])
  return {
    kind: enumeration(v['kind'], [
      'identity_principal',
      'alert_rule',
      'authorization_rule',
      'user_group',
      'delegation',
      'report',
      'connector',
      'settings',
      'job',
      'device',
      'policy',
      'workflow',
      'compliance_rule',
      'baseline',
      'security_request',
      'risk',
      'security_action',
      'certificate',
    ] as const),
    id: identifier(v['id']),
    device: nullable(v['device'], identifier),
    revision: nullable(v['revision'], count),
  }
}
export type OperationsReference = ReturnType<typeof reference>
export function auditEntry(value: unknown) {
  const v = closed(value, [
    'id',
    'at',
    'actor',
    'action',
    'target',
    'operation',
    'outcome',
    'stream',
    'stage',
    'status',
  ])
  return {
    id: uuid(v['id']),
    at: count(v['at']),
    stream: enumeration(v['stream'], ['mdm_business', 'identity_security'] as const),
    stage: enumeration(v['stage'], ['request', 'business', 'delivery'] as const),
    status: nullable(v['status'], count),
    actor: nullable(v['actor'], uuid),
    action: enumeration(v['action'], auditActions),
    target: nullable(v['target'], reference),
    operation: nullable(v['operation'], uuid),
    outcome: enumeration(v['outcome'], [
      'accepted',
      'denied',
      'failed',
      'unknown',
      'observed',
    ] as const),
  }
}
export type AuditEntry = ReturnType<typeof auditEntry>
export function alert(value: unknown) {
  const v = closed(value, [
    'id',
    'revision',
    'code',
    'severity',
    'target',
    'state',
    'openedAt',
    'updatedAt',
    'resolvedAt',
    'evidence',
    'acknowledgment',
    'operation',
  ])
  const e = closed(v['evidence'], ['id', 'version', 'at', 'state'])
  const result = {
    id: uuid(v['id']),
    revision: count(v['revision']),
    code: enumeration(v['code'], [
      'projection_backlog',
      'connector_failure',
      'agent_health',
      'compliance_noncompliant',
      'risk_affected',
      'certificate_expiry',
    ] as const),
    severity: enumeration(v['severity'], ['low', 'medium', 'high', 'critical'] as const),
    target: reference(v['target']),
    state: enumeration(v['state'], alertStates),
    openedAt: count(v['openedAt']),
    updatedAt: count(v['updatedAt']),
    resolvedAt: nullable(v['resolvedAt'], count),
    evidence: {
      id: uuid(e['id']),
      version: count(e['version']),
      at: count(e['at']),
      state: enumeration(e['state'], ['active', 'cleared', 'unknown'] as const),
    },
    acknowledgment: nullable(v['acknowledgment'], (value) => {
      const a = closed(value, ['actor', 'at'])
      return { actor: uuid(a['actor']), at: count(a['at']) }
    }),
    operation: nullable(v['operation'], uuid),
  }
  if (
    (['compliance_noncompliant', 'risk_affected', 'certificate_expiry'].includes(result.code) &&
      (result.target.kind !==
        (result.code === 'risk_affected'
          ? 'risk'
          : result.code === 'certificate_expiry'
            ? 'certificate'
            : 'compliance_rule') ||
        result.target.device === null)) ||
    (['projection_backlog', 'connector_failure', 'agent_health'].includes(result.code) &&
      !['settings', 'alert_rule'].includes(result.target.kind)) ||
    !result.revision ||
    !result.evidence.version ||
    (result.state === 'resolved') !== (result.resolvedAt !== null) ||
    result.updatedAt < result.openedAt ||
    (result.resolvedAt !== null && result.resolvedAt < result.openedAt) ||
    (result.state === 'open' && result.evidence.state === 'cleared') ||
    (result.state === 'resolved' && result.evidence.state === 'active') ||
    (result.acknowledgment === null) !== (result.operation === null)
  )
    throw new Error('Invalid alert evidence')
  return result
}
export type Alert = ReturnType<typeof alert>
