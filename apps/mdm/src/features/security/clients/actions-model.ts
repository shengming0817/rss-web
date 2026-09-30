import { closed, count, nullable, uuid } from '../../../services/decode'
import { executionSummary } from '../../policies/clients/executions'
import { positive } from './compliance-model'
import { requestTarget } from './requests-model'
import { securitySource } from './source'
export function securityAction(value: unknown) {
  const v = closed(value, [
      'id',
      'revision',
      'operation',
      'request',
      'target',
      'source',
      'createdAt',
      'deadline',
      'resultAt',
      'detectedAt',
      'summary',
    ]),
    target = requestTarget(v['target'])
  if (target.kind !== 'risk_remediation' && target.kind !== 'material_operation')
    throw new Error('Not a device action')
  const result = {
    id: uuid(v['id']),
    revision: positive(v['revision']),
    operation: uuid(v['operation']),
    request: uuid(v['request']),
    target,
    source: securitySource(v['source']),
    createdAt: count(v['createdAt']),
    deadline: count(v['deadline']),
    resultAt: nullable(v['resultAt'], count),
    detectedAt: nullable(v['detectedAt'], count),
    summary: executionSummary(v['summary']),
  }
  if (
    result.deadline <= result.createdAt ||
    (result.resultAt !== null && result.resultAt <= result.createdAt) ||
    (result.detectedAt !== null &&
      (result.resultAt === null || result.detectedAt <= result.resultAt)) ||
    (result.summary.effect === 'verified_present') !== (result.detectedAt !== null) ||
    result.summary.id !== result.id ||
    result.summary.device !== target.device ||
    result.summary.origin.kind !== 'security' ||
    result.summary.origin.request !== result.request ||
    result.summary.attempt !== result.id ||
    result.source.source !==
      (target.kind === 'risk_remediation' || target.material === 'laps'
        ? 'agent.builtin'
        : target.material === 'bitlocker'
          ? 'mdm.windows'
          : 'mdm.apple')
  )
    throw new Error('Wrong security execution')
  return result
}
export type SecurityAction = ReturnType<typeof securityAction>
