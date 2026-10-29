import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  uuid,
} from '../../../../src/services/decode'
export const signals = ['projection_backlog', 'connector_failure', 'agent_health'] as const
export function alertRuleDefinition(value: unknown) {
  const v = closed(value, ['name', 'signal', 'threshold', 'enabled'])
  return {
    name: identifier(v['name']),
    signal: enumeration(v['signal'], signals),
    threshold: count(v['threshold']),
    enabled: boolean(v['enabled']),
  }
}
export function alertRule(value: unknown) {
  const v = closed(value, ['id', 'revision', 'operation', 'definition'])
  return {
    id: uuid(v['id']),
    revision: count(v['revision']),
    operation: uuid(v['operation']),
    definition: alertRuleDefinition(v['definition']),
  }
}
export type AlertRule = ReturnType<typeof alertRule>
export function delegation(value: unknown) {
  const v = closed(value, ['id', 'principal', 'department', 'matching', 'state', 'authority'])
  return {
    id: uuid(v['id']),
    principal: uuid(v['principal']),
    department: identifier(v['department']),
    matching: enumeration(v['matching'], ['exact', 'subtree'] as const),
    state: enumeration(v['state'], ['active', 'expired', 'unknown'] as const),
    authority: enumeration(v['authority'], ['candidate'] as const),
  }
}
export function range(value: unknown) {
  const v = closed(value, ['from', 'until']),
    from = count(v['from']),
    until = count(v['until'])
  if (from > until) throw new Error('Invalid time range')
  return { from, until }
}
export function metrics(value: unknown) {
  const v = closed(value, [
    'from',
    'until',
    'asOf',
    'scope',
    'complete',
    'known',
    'unknown',
    'windows',
    'macos',
    'pending',
    'trend',
  ])
  const result = {
    ...range({ from: v['from'], until: v['until'] }),
    asOf: count(v['asOf']),
    scope: enumeration(v['scope'], ['authorized'] as const),
    complete: boolean(v['complete']),
    known: count(v['known']),
    unknown: nullable(v['unknown'], count),
    windows: nullable(v['windows'], count),
    macos: nullable(v['macos'], count),
    pending: nullable(v['pending'], count),
    trend: array(v['trend'], (value) => {
      const b = closed(value, ['at', 'known', 'unknown'])
      return {
        at: count(b['at']),
        known: count(b['known']),
        unknown: nullable(b['unknown'], count),
      }
    }),
  }
  if (result.complete && result.unknown === null) throw new Error('Incomplete statistics')
  if (result.trend.some((b) => b.at < result.from || b.at > result.until))
    throw new Error('Out of range sample')
  return result
}
export type Metrics = ReturnType<typeof metrics>
export const jobPhases = [
  'accepted',
  'running',
  'paused',
  'completed',
  'failed',
  'unknown',
  'cancelled',
] as const
export function report(value: unknown) {
  const v = closed(value, ['id', 'revision', 'operation', 'phase', 'createdAt', 'range', 'result'])
  const result = {
    id: uuid(v['id']),
    revision: count(v['revision']),
    operation: uuid(v['operation']),
    phase: enumeration(v['phase'], jobPhases),
    createdAt: count(v['createdAt']),
    range: range(v['range']),
    result: nullable(v['result'], metrics),
  }
  if ((result.phase === 'completed') !== (result.result !== null))
    throw new Error('Invalid report result')
  return result
}
export type Report = ReturnType<typeof report>
