import {
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  record,
  uuid,
} from '../../../services/decode'
import { boundedText, positive } from './compliance-model'
export const requestStates = ['pending', 'approved', 'denied', 'revoked', 'expired'] as const
export const requestDecisions = ['approve', 'deny', 'revoke'] as const
export function requestTarget(value: unknown) {
  const kind = enumeration(record(value)['kind'], [
    'compliance_exception',
    'risk_remediation',
  ] as const)
  if (kind === 'risk_remediation') {
    const v = closed(value, ['kind', 'risk', 'assessment', 'assessmentVersion', 'device'])
    return {
      kind,
      risk: uuid(v['risk']),
      assessment: uuid(v['assessment']),
      assessmentVersion: positive(v['assessmentVersion']),
      device: identifier(v['device']),
    }
  }
  const v = closed(value, ['kind', 'baseline', 'baselineRevision', 'rule', 'ruleVersion', 'device'])
  return {
    kind,
    baseline: uuid(v['baseline']),
    baselineRevision: positive(v['baselineRevision']),
    rule: uuid(v['rule']),
    ruleVersion: positive(v['ruleVersion']),
    device: identifier(v['device']),
  }
}
export type SecurityRequestTarget = ReturnType<typeof requestTarget>
export function requestDefinition(value: unknown) {
  const v = closed(value, ['target', 'reason', 'validFrom', 'validUntil'])
  const result = {
    target: requestTarget(v['target']),
    reason: boundedText(v['reason'], 512),
    validFrom: count(v['validFrom']),
    validUntil: count(v['validUntil']),
  }
  if (result.validUntil <= result.validFrom || result.validUntil - result.validFrom > 30 * 86400)
    throw new Error('Invalid request window')
  return result
}
export type SecurityRequestDefinition = ReturnType<typeof requestDefinition>
export function securityRequest(value: unknown) {
  const v = closed(value, [
    'id',
    'revision',
    'operation',
    'requester',
    'createdAt',
    'state',
    'target',
    'reason',
    'validFrom',
    'validUntil',
    'decision',
    'revocation',
  ])
  const result = {
    id: uuid(v['id']),
    revision: positive(v['revision']),
    operation: uuid(v['operation']),
    requester: uuid(v['requester']),
    createdAt: count(v['createdAt']),
    state: enumeration(v['state'], requestStates),
    ...requestDefinition({
      target: v['target'],
      reason: v['reason'],
      validFrom: v['validFrom'],
      validUntil: v['validUntil'],
    }),
    decision: nullable(v['decision'], (value) => {
      const d = closed(value, ['by', 'at', 'value'])
      return {
        by: uuid(d['by']),
        at: count(d['at']),
        value: enumeration(d['value'], ['approved', 'denied'] as const),
      }
    }),
    revocation: nullable(v['revocation'], (value) => {
      const r = closed(value, ['by', 'at'])
      return { by: uuid(r['by']), at: count(r['at']) }
    }),
  }
  if (
    result.decision?.by === result.requester ||
    (result.state === 'approved' && result.decision?.value !== 'approved') ||
    (result.state === 'denied' && result.decision?.value !== 'denied') ||
    (result.state === 'pending' && result.decision !== null) ||
    (result.state === 'revoked') !== (result.revocation !== null)
  )
    throw new Error('Invalid request decision')
  return result
}
export type SecurityRequest = ReturnType<typeof securityRequest>
