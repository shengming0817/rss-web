import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  string,
  unique,
  uuid,
} from '../../../services/decode'
import { criteria, evidence } from '../../devices/clients/asset-model'

export const complianceStatuses = [
  'compliant',
  'non_compliant',
  'unknown',
  'not_applicable',
] as const
export const currentStatuses = [...complianceStatuses, 'pending'] as const
export const severities = ['low', 'medium', 'high', 'critical'] as const
export const platforms = ['all', 'windows', 'macos'] as const
const decisions = ['match', 'no_match', 'unknown'] as const
export function positive(value: unknown) {
  const n = count(value)
  if (!n) throw new Error('Expected positive revision')
  return n
}
export function boundedText(value: unknown, maximum = 256) {
  const v = string(value)
  if (!v.trim() || [...v].length > maximum) throw new Error('Invalid text')
  return v
}
export function complianceDefinition(value: unknown) {
  const v = closed(value, ['name', 'severity', 'enabled', 'platform', 'target', 'criteria'])
  const target = closed(v['target'], ['kind'], ['ids'])
  const kind = enumeration(target['kind'], ['all', 'groups'] as const)
  const ids = kind === 'groups' ? unique(array(target['ids'], uuid), (v) => v) : []
  if (kind === 'all' ? 'ids' in target : !ids.length || ids.length > 16)
    throw new Error('Invalid compliance target')
  return {
    name: boundedText(v['name'], 128),
    severity: enumeration(v['severity'], severities),
    enabled: boolean(v['enabled']),
    platform: enumeration(v['platform'], platforms),
    target: kind === 'all' ? { kind } : { kind, ids },
    criteria: criteria(v['criteria']),
  }
}
export type ComplianceDefinition = ReturnType<typeof complianceDefinition>
export function complianceRule(value: unknown, id?: string, revision?: number) {
  const v = closed(value, ['id', 'revision', 'definition'])
  const result = {
    id: uuid(v['id']),
    revision: positive(v['revision']),
    definition: complianceDefinition(v['definition']),
  }
  if ((id && result.id !== id) || (revision !== undefined && result.revision !== revision))
    throw new Error('Wrong compliance rule')
  return result
}
export type ComplianceRule = ReturnType<typeof complianceRule>
export function groupInput(value: unknown) {
  const v = closed(value, [
    'id',
    'revision',
    'memberSet',
    'memberVersion',
    'assetWatermark',
    'ready',
  ])
  return {
    id: uuid(v['id']),
    revision: positive(v['revision']),
    memberSet: nullable(v['memberSet'], uuid),
    memberVersion: count(v['memberVersion']),
    assetWatermark: nullable(v['assetWatermark'], count),
    ready: boolean(v['ready']),
  }
}
export function complianceAssessment(value: unknown) {
  const v = closed(value, [
    'ruleId',
    'ruleVersion',
    'dictionaryVersion',
    'factWatermark',
    'evaluatedAt',
    'groups',
    'status',
    'reason',
    'condition',
    'applicability',
    'explanations',
    'evidence',
  ])
  const a = closed(v['applicability'], ['platform', 'platformDecision', 'sources', 'groups'])
  const rawExplanations = v['explanations']
  if (!Array.isArray(rawExplanations) || rawExplanations.length > 1024)
    throw new Error('Invalid explanations')
  const result = {
    ruleId: uuid(v['ruleId']),
    ruleVersion: positive(v['ruleVersion']),
    dictionaryVersion: identifier(v['dictionaryVersion']),
    factWatermark: count(v['factWatermark']),
    evaluatedAt: count(v['evaluatedAt']),
    groups: unique(array(v['groups'], groupInput), (g) => g.id),
    status: enumeration(v['status'], complianceStatuses),
    reason: enumeration(v['reason'], [
      'platform_not_applicable',
      'group_not_applicable',
      'platform_unknown',
      'group_unknown',
      'rule_satisfied',
      'rule_failed',
      'facts_unknown',
    ] as const),
    condition: enumeration(v['condition'], decisions),
    applicability: {
      platform: enumeration(a['platform'], platforms),
      platformDecision: enumeration(a['platformDecision'], decisions),
      sources: array(a['sources'], (value) => {
        const s = closed(value, ['source', 'registration', 'generation', 'epoch'])
        return {
          source: identifier(s['source']),
          registration: identifier(s['registration']),
          generation: identifier(s['generation']),
          epoch: identifier(s['epoch']),
        }
      }),
      groups: unique(
        array(a['groups'], (value) => {
          const g = closed(value, ['id', 'memberSet', 'decision'])
          return {
            id: uuid(g['id']),
            memberSet: nullable(g['memberSet'], uuid),
            decision: enumeration(g['decision'], decisions),
          }
        }),
        (g) => g.id,
      ),
    },
    explanations: rawExplanations.map((value) => {
      const e = closed(value, ['path', 'outcome'])
      return {
        path: array(e['path'], count),
        outcome: enumeration(e['outcome'], [
          'match',
          'no_match',
          'null',
          'missing',
          'deleted',
          'unsupported',
          'conflict',
        ] as const),
      }
    }),
    evidence: unique(
      array(v['evidence'], (value) => {
        const e = closed(value, ['field', 'sources'])
        const sources = unique(array(e['sources'], evidence), (s) => s.source)
        if (sources.length > 2) throw new Error('Invalid fact references')
        return { field: identifier(e['field']), sources }
      }),
      (e) => e.field,
    ),
  }
  const reasons: Record<typeof result.status, readonly string[]> = {
    compliant: ['rule_satisfied'],
    non_compliant: ['rule_failed'],
    unknown: ['platform_unknown', 'group_unknown', 'facts_unknown'],
    not_applicable: ['platform_not_applicable', 'group_not_applicable'],
  }
  if (
    !reasons[result.status].includes(result.reason) ||
    result.groups.length > 16 ||
    result.evidence.length > 256 ||
    result.groups.some((g) => !g.ready) ||
    result.groups.length !== result.applicability.groups.length ||
    result.groups.some(
      (g, i) =>
        g.id !== result.applicability.groups[i]!.id ||
        g.memberSet !== result.applicability.groups[i]!.memberSet,
    )
  )
    throw new Error('Invalid assessment evidence')
  return result
}
export type ComplianceAssessment = ReturnType<typeof complianceAssessment>
export function currentCompliance(value: unknown, device: string) {
  const v = closed(value, ['device', 'status', 'reason', 'rules'])
  if (identifier(v['device']) !== device) throw new Error('Wrong compliance device')
  const result = {
    device,
    status: enumeration(v['status'], currentStatuses),
    reason: nullable(v['reason'], (value) => enumeration(value, ['no_rules'] as const)),
    rules: unique(
      array(v['rules'], (value) => {
        const r = closed(value, ['ruleId', 'ruleVersion', 'status', 'current', 'previous'])
        const row = {
          ruleId: uuid(r['ruleId']),
          ruleVersion: positive(r['ruleVersion']),
          status: enumeration(r['status'], currentStatuses),
          current: nullable(r['current'], complianceAssessment),
          previous: nullable(r['previous'], complianceAssessment),
        }
        if (
          row.current &&
          (row.current.ruleId !== row.ruleId ||
            row.current.ruleVersion !== row.ruleVersion ||
            row.current.status !== row.status)
        )
          throw new Error('Wrong current assessment')
        if (
          row.previous &&
          (row.previous.ruleId !== row.ruleId || row.previous.ruleVersion > row.ruleVersion)
        )
          throw new Error('Wrong previous assessment')
        if (
          row.status === 'pending'
            ? row.current !== null
            : row.current === null || row.previous !== null
        )
          throw new Error('Invalid pending assessment')
        return row
      }),
      (r) => r.ruleId,
    ),
  }
  if (
    !result.rules.length
      ? result.reason !== 'no_rules' || result.status !== 'unknown'
      : result.reason !== null
  )
    throw new Error('Invalid no-rules conclusion')
  return result
}
export type CurrentCompliance = ReturnType<typeof currentCompliance>
export function complianceTask(value: unknown, rule: string, task: string) {
  const v = closed(value, [
    'task',
    'ruleId',
    'ruleVersion',
    'factWatermark',
    'phase',
    'processed',
    'completed',
    'failure',
    'diagnostic',
  ])
  if (uuid(v['task']) !== task || uuid(v['ruleId']) !== rule)
    throw new Error('Wrong compliance task')
  const result = {
    task,
    ruleId: rule,
    ruleVersion: positive(v['ruleVersion']),
    factWatermark: count(v['factWatermark']),
    phase: enumeration(v['phase'], [
      'queued',
      'evaluating',
      'published',
      'superseded',
      'failed',
    ] as const),
    processed: count(v['processed']),
    completed: boolean(v['completed']),
    failure: nullable(v['failure'], identifier),
    diagnostic: nullable(v['diagnostic'], (value) => ({
      reason: enumeration(closed(value, ['reason'])['reason'], ['group_input_pending'] as const),
    })),
  }
  const terminal = ['published', 'superseded', 'failed'].includes(result.phase)
  const phase =
    result.failure === 'superseded'
      ? 'superseded'
      : result.failure !== null
        ? 'failed'
        : result.completed
          ? 'published'
          : result.phase
  if (result.completed !== terminal || result.phase !== phase)
    throw new Error('Invalid task completion')
  return result
}
export type ComplianceTask = ReturnType<typeof complianceTask>
export function complianceHistory(value: unknown) {
  const { task, disposition, ...assessment } = closed(value, [
    'task',
    'disposition',
    'ruleId',
    'ruleVersion',
    'dictionaryVersion',
    'factWatermark',
    'evaluatedAt',
    'groups',
    'status',
    'reason',
    'condition',
    'applicability',
    'explanations',
    'evidence',
  ])
  return {
    ...complianceAssessment(assessment),
    task: uuid(task),
    disposition: enumeration(disposition, ['published', 'superseded', 'failed'] as const),
  }
}
export type ComplianceHistory = ReturnType<typeof complianceHistory>
