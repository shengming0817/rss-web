import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  nullable,
  unique,
  uuid,
  identifier,
} from '../../../services/decode'
import { boundedText, positive, currentCompliance, currentStatuses } from './compliance-model'
export function baselineDefinition(value: unknown) {
  const v = closed(value, ['name', 'enabled', 'scope', 'rules', 'graceUntil'])
  const rules = unique(
    array(v['rules'], (value) => {
      const r = closed(value, ['id', 'revision'])
      return { id: uuid(r['id']), revision: positive(r['revision']) }
    }),
    (r) => r.id,
  )
  if (!rules.length || rules.length > 100) throw new Error('Invalid baseline rules')
  return {
    name: boundedText(v['name'], 128),
    enabled: boolean(v['enabled']),
    scope: uuid(v['scope']),
    rules,
    graceUntil: nullable(v['graceUntil'], count),
  }
}
export type BaselineDefinition = ReturnType<typeof baselineDefinition>
export function baseline(value: unknown) {
  const v = closed(value, [
    'id',
    'revision',
    'operation',
    'createdAt',
    'scopeRevision',
    'definition',
  ])
  return {
    id: uuid(v['id']),
    revision: positive(v['revision']),
    operation: uuid(v['operation']),
    createdAt: count(v['createdAt']),
    scopeRevision: positive(v['scopeRevision']),
    definition: baselineDefinition(v['definition']),
  }
}
export type Baseline = ReturnType<typeof baseline>
export function baselineDevice(value: unknown) {
  const v = closed(value, ['device', 'native', 'rules']),
    device = identifier(v['device']),
    native = currentCompliance(v['native'], device)
  return {
    device,
    native,
    rules: unique(
      array(v['rules'], (value) => {
        const r = closed(value, [
          'ruleId',
          'ruleVersion',
          'nativeStatus',
          'drift',
          'governance',
          'request',
        ])
        const result = {
          ruleId: uuid(r['ruleId']),
          ruleVersion: positive(r['ruleVersion']),
          nativeStatus: enumeration(r['nativeStatus'], currentStatuses),
          drift: enumeration(r['drift'], [
            'none',
            'rule_changed',
            'rule_disabled',
            'missing_rule',
            'pending_assessment',
            'scope_changed',
            'scope_unavailable',
            'baseline_disabled',
          ] as const),
          governance: enumeration(r['governance'], [
            'not_needed',
            'grace',
            'exempt',
            'action_required',
            'unknown',
            'not_applicable',
            'inactive',
          ] as const),
          request: nullable(r['request'], uuid),
        }
        if ((result.governance === 'exempt') !== (result.request !== null))
          throw new Error('Invalid exemption reference')
        const original = native.rules.find((r) => r.ruleId === result.ruleId)
        if (
          result.nativeStatus !== (original?.status ?? 'unknown') ||
          (result.drift === 'none' &&
            (!original ||
              original.ruleVersion !== result.ruleVersion ||
              original.status === 'pending')) ||
          (result.drift === 'baseline_disabled'
            ? result.governance !== 'inactive'
            : result.drift !== 'none' && result.governance !== 'unknown')
        )
          throw new Error('Contradictory native evidence')
        if (
          (['grace', 'exempt', 'action_required'].includes(result.governance) &&
            (result.nativeStatus !== 'non_compliant' || result.drift !== 'none')) ||
          (result.governance === 'not_needed' && result.nativeStatus !== 'compliant') ||
          (result.governance === 'not_applicable' && result.nativeStatus !== 'not_applicable')
        )
          throw new Error('Invalid governance conclusion')
        return result
      }),
      (r) => r.ruleId,
    ),
  }
}
export type BaselineDevice = ReturnType<typeof baselineDevice>
