import * as wireSchemas from '@rss/api/mdm-schemas'
import { jsonObject } from '../../../services/json'
import {
  array,
  count,
  enumeration,
  identifier,
  nullable,
  string,
  unique,
  uuid,
} from '../../../services/decode'
import { inventoryCondition, evidence } from '../../devices/clients/asset-model'

export const complianceStatuses = [
  'compliant',
  'non_compliant',
  'unknown',
  'not_applicable',
] as const
export const currentStatuses = [...complianceStatuses, 'pending'] as const
export const severities = ['low', 'medium', 'high', 'critical'] as const
export const platforms = ['all', 'windows', 'macos'] as const

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
  if (!wireSchemas.getApiV1ComplianceRulesByIdResponse.validateDefinition(value))
    throw new Error('Invalid contract value')

  const v = value
  const target = v['target']
  const kind = target['kind']
  const ids = kind === 'groups' ? unique(array(target['ids'], uuid), (v) => v) : []
  if (kind === 'all' ? 'ids' in target : !ids.length || ids.length > 16)
    throw new Error('Invalid compliance target')
  const presentation = jsonObject(v['presentation'], 65_536)
  return {
    presentation: { ...presentation, name: boundedText(presentation['name'], 128) },
    severity: v['severity'],
    enabled: v['enabled'],
    platform: v['platform'],
    target: kind === 'all' ? { kind } : { kind, ids },
    criteria: inventoryCondition(v['criteria']),
  }
}
export type ComplianceDefinition = ReturnType<typeof complianceDefinition>
export function complianceRule(value: unknown, id?: string, revision?: number) {
  if (!wireSchemas.getApiV1ComplianceRulesByIdResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
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
  if (!wireSchemas.getApiV1DevicesByIdComplianceResponse.validateGroupInput(value))
    throw new Error('Invalid group input')
  positive(value.revision)
  return value
}
export function complianceAssessment(value: unknown) {
  if (!wireSchemas.getApiV1DevicesByIdComplianceResponse.validateAssessment(value))
    throw new Error('Invalid contract value')

  const v = value
  const a = v['applicability']
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
    status: v['status'],
    reason: v['reason'],
    condition: v['condition'],
    applicability: {
      platform: a['platform'],
      platformDecision: a['platformDecision'],
      sources: array(a['sources'], (value) => {
        const s = value
        return {
          source: identifier(s['source']),
          registration: identifier(s['registration']),
          generation: identifier(s['generation']),
          epoch: identifier(s['epoch']),
        }
      }),
      groups: unique(
        array(a['groups'], (value) => {
          const g = value
          return {
            id: uuid(g['id']),
            memberSet: nullable(g['memberSet'], uuid),
            decision: g['decision'],
          }
        }),
        (g) => g.id,
      ),
    },
    explanations: rawExplanations.map((value) => {
      const e = value
      return {
        path: array(e['path'], count),
        outcome: e['outcome'],
      }
    }),
    evidence: unique(
      array(v['evidence'], (value) => {
        const e = value
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
  if (!wireSchemas.getApiV1DevicesByIdComplianceResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  if (identifier(v['device']) !== device) throw new Error('Wrong compliance device')
  const result = {
    device,
    status: enumeration(v['status'], currentStatuses),
    reason: nullable(v['reason'], (value) => value),
    rules: unique(
      array(v['rules'], (value) => {
        const r = value
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
  if (!wireSchemas.getApiV1ComplianceRulesByIdTasksByTaskResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  if (uuid(v['task']) !== task || uuid(v['ruleId']) !== rule)
    throw new Error('Wrong compliance task')
  const result = {
    task,
    ruleId: rule,
    ruleVersion: positive(v['ruleVersion']),
    factWatermark: count(v['factWatermark']),
    phase: v['phase'],
    processed: count(v['processed']),
    completed: v['completed'],
    failure: nullable(v['failure'], identifier),
    diagnostic: nullable(v['diagnostic'], (value) => ({
      reason: value['reason'],
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
  if (!wireSchemas.getApiV1DevicesByIdComplianceHistoryResponse.validateHistoryEntry(value))
    throw new Error('Invalid contract value')

  const { task, disposition, ...assessment } = value
  return {
    ...complianceAssessment(assessment),
    task: uuid(task),
    disposition: disposition,
  }
}
export type ComplianceHistory = ReturnType<typeof complianceHistory>
