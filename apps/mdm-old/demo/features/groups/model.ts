/** MOCK_SOURCE: candidate interaction data; no production Group or Identity contract. */
import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  record,
  string,
  unique,
  uuid,
} from '../../../src/services/decode'
export const categories = [
  'device-dynamic',
  'device-static',
  'user-dynamic',
  'user-static',
] as const
export type Category = (typeof categories)[number]
export const operators = [
  'eq',
  'ne',
  'in',
  'not_in',
  'contains',
  'not_contains',
  'gt',
  'ge',
  'lt',
  'le',
] as const
export type Operator = (typeof operators)[number]
export type Scalar = string | boolean | number
export type Rule =
  | { mode: 'match'; attribute: string; operator: Operator; operand: Scalar | Scalar[] }
  | { mode: 'all'; rules: Rule[] }
  | { mode: 'any'; rules: Rule[] }
  | { mode: 'users'; groupId: string; relation: 'registration_user' | 'current_user' }
export const fields = {
  user: [
    { key: 'department', type: 'string' },
    { key: 'licensed', type: 'boolean' },
    { key: 'allocation', type: 'number' },
  ],
  device: [
    { key: 'platform', type: 'string' },
    { key: 'managed', type: 'boolean' },
    { key: 'memory', type: 'number' },
  ],
} as const
export function scalar(value: unknown): Scalar {
  if (typeof value === 'string') return string(value)
  if (typeof value === 'boolean') return value
  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (!Number.isInteger(value) || Number.isSafeInteger(value))
  )
    return value
  throw new Error('Invalid candidate operand')
}
export function rule(
  value: unknown,
  domain: 'user' | 'device',
  depth = 1,
  budget = { nodes: 0 },
): Rule {
  if (depth > 8 || ++budget.nodes > 64) throw new Error('Candidate rule budget exceeded')
  const mode = enumeration(record(value)['mode'], ['all', 'any', 'match', 'users'] as const)
  if (mode === 'users') {
    if (domain !== 'device') throw new Error('Invalid candidate user scope')
    const v = closed(value, ['mode', 'groupId', 'relation'])
    return {
      mode,
      groupId: uuid(v['groupId']),
      relation: enumeration(v['relation'], ['registration_user', 'current_user'] as const),
    }
  }
  if (mode === 'all' || mode === 'any') {
    const v = closed(value, ['mode', 'rules']),
      children = array(v['rules'], (r) => rule(r, domain, depth + 1, budget))
    if (!children.length) throw new Error('Empty rule set')
    return { mode, rules: children }
  }
  const v = closed(value, ['mode', 'attribute', 'operator', 'operand']),
    attribute = identifier(v['attribute']),
    field = fields[domain].find((f) => f.key === attribute)
  if (!field) throw new Error('Unknown candidate attribute')
  const operator = enumeration(v['operator'], operators),
    operand = Array.isArray(v['operand']) ? array(v['operand'], scalar) : scalar(v['operand'])
  if (Array.isArray(operand) !== ['in', 'not_in'].includes(operator))
    throw new Error('Invalid operand shape')
  const values = Array.isArray(operand) ? operand : [operand]
  if (!values.length || values.length > 64 || values.some((v) => typeof v !== field.type))
    throw new Error('Wrong operand type')
  if (['contains', 'not_contains'].includes(operator) && field.type !== 'string')
    throw new Error('Invalid text operator')
  if (['gt', 'ge', 'lt', 'le'].includes(operator) && field.type !== 'number')
    throw new Error('Invalid numeric operator')
  return { mode, attribute, operator, operand }
}
export interface Draft {
  name: string
  description: string
  groupType: Category
  enabled: boolean
  assignments: string[]
  rule: Rule | null
}
export function draft(value: unknown): Draft {
  const v = closed(value, ['name', 'description', 'groupType', 'enabled', 'assignments', 'rule']),
    groupType = enumeration(v['groupType'], categories)
  const assignments = unique(array(v['assignments'], uuid), (id) => id),
    dynamic = groupType.endsWith('dynamic')
  if (dynamic ? assignments.length > 0 || v['rule'] === null : v['rule'] !== null)
    throw new Error('Invalid candidate definition')
  return {
    name: identifier(v['name']),
    description: string(v['description']),
    groupType,
    enabled: boolean(v['enabled']),
    assignments,
    rule: nullable(v['rule'], (r) => rule(r, groupType.startsWith('user') ? 'user' : 'device')),
  }
}
export interface Group extends Draft {
  id: string
  revision: number
  resultId: string | null
  freshness: 'ready' | 'pending'
  memberCount: number | null
  unknownCount: number | null
}
export function group(value: unknown): Group {
  const v = closed(value, [
      'id',
      'revision',
      'definition',
      'resultId',
      'freshness',
      'memberCount',
      'unknownCount',
    ]),
    definition = draft(v['definition'])
  return {
    ...definition,
    id: uuid(v['id']),
    revision: count(v['revision']),
    resultId: nullable(v['resultId'], uuid),
    freshness: enumeration(v['freshness'], ['ready', 'pending'] as const),
    memberCount: nullable(v['memberCount'], count),
    unknownCount: nullable(v['unknownCount'], count),
  }
}
export const outcomes = ['match', 'no_match', 'unknown'] as const
export type Outcome = (typeof outcomes)[number]
export interface ResultRow {
  id: string
  label: string
  outcome: Outcome
  before: Outcome | null
  reason: string
}
export function resultRow(value: unknown): ResultRow {
  const v = closed(value, ['id', 'label', 'outcome', 'before', 'reason'])
  return {
    id: uuid(v['id']),
    label: string(v['label']),
    outcome: enumeration(v['outcome'], outcomes),
    before: nullable(v['before'], (v) => enumeration(v, outcomes)),
    reason: string(v['reason']),
  }
}
export interface Person {
  id: string
  label: string
  attributes: Record<string, Scalar | null>
}
export interface Device extends Person {
  registrationUser: string | null
  currentUser: string | null
  currentKnown: boolean
}
export const defaultRule = (domain: 'user' | 'device'): Rule => ({
  mode: 'match',
  attribute: domain === 'user' ? 'department' : 'platform',
  operator: 'eq',
  operand: domain === 'user' ? 'Engineering' : 'windows',
})
export function fresh(groupType: Category): Draft {
  return {
    name: '',
    description: '',
    groupType,
    enabled: true,
    assignments: [],
    rule: groupType.endsWith('dynamic')
      ? defaultRule(groupType.startsWith('user') ? 'user' : 'device')
      : null,
  }
}
