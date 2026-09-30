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
export const connectorKinds = ['webhook', 'itsm', 'cmdb', 'security'] as const
export const signals = ['projection_backlog', 'connector_failure', 'agent_health'] as const
export const maintenanceKinds = [
  'backup',
  'restore',
  'deploy',
  'agent_upgrade',
  'content_distribution',
] as const
export function connectorDefinition(value: unknown) {
  const v = closed(value, ['name', 'kind', 'endpoint', 'credentialRef', 'enabled'])
  const result = {
    name: identifier(v['name']),
    kind: enumeration(v['kind'], connectorKinds),
    endpoint: string(v['endpoint']),
    credentialRef: nullable(v['credentialRef'], identifier),
    enabled: boolean(v['enabled']),
  }
  const url = new URL(result.endpoint)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new Error('Unsafe connector endpoint')
  return result
}
export function connector(value: unknown) {
  const v = closed(value, ['id', 'revision', 'operation', 'definition', 'health'])
  return {
    id: uuid(v['id']),
    revision: count(v['revision']),
    operation: uuid(v['operation']),
    definition: connectorDefinition(v['definition']),
    health: enumeration(v['health'], [
      'unknown',
      'healthy',
      'disconnected',
      'backlog',
      'disabled',
    ] as const),
  }
}
export type Connector = ReturnType<typeof connector>
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
export function delivery(value: unknown) {
  const v = closed(value, [
    'id',
    'revision',
    'operation',
    'connector',
    'kind',
    'state',
    'attempt',
    'previous',
    'at',
    'reason',
  ])
  return {
    id: uuid(v['id']),
    revision: count(v['revision']),
    operation: uuid(v['operation']),
    connector: uuid(v['connector']),
    kind: enumeration(v['kind'], ['test', 'event'] as const),
    state: enumeration(v['state'], ['queued', 'failed', 'delivered', 'passed', 'unknown'] as const),
    attempt: count(v['attempt']),
    previous: nullable(v['previous'], uuid),
    at: count(v['at']),
    reason: nullable(v['reason'], enumeratedReason),
  }
}
function enumeratedReason(value: unknown) {
  return enumeration(value, [
    'connection_refused',
    'delivery_timeout',
    'backlog',
    'dependency_unavailable',
    'signature_invalid',
  ] as const)
}
export type Delivery = ReturnType<typeof delivery>
export function configurationValues(value: unknown) {
  const v = closed(value, ['name', 'publicOrigin', 'certificateRef', 'apnsRef'])
  const publicOrigin = string(v['publicOrigin']),
    url = new URL(publicOrigin)
  if (url.protocol !== 'https:' || url.origin !== publicOrigin)
    throw new Error('Invalid public origin')
  return {
    name: identifier(v['name']),
    publicOrigin,
    certificateRef: nullable(v['certificateRef'], identifier),
    apnsRef: nullable(v['apnsRef'], identifier),
  }
}
export function configuration(value: unknown) {
  const v = closed(value, [
    'revision',
    'operation',
    'savedVersion',
    'activeVersion',
    'state',
    'values',
  ])
  const result = {
    revision: count(v['revision']),
    operation: nullable(v['operation'], uuid),
    savedVersion: count(v['savedVersion']),
    activeVersion: count(v['activeVersion']),
    state: enumeration(v['state'], ['saved', 'active', 'failed', 'restart_required'] as const),
    values: configurationValues(v['values']),
  }
  if (result.activeVersion > result.savedVersion) throw new Error('Invalid active configuration')
  return result
}
export function diagnostics(value: unknown) {
  const v = closed(value, [
    'asOf',
    'scope',
    'complete',
    'components',
    'taskBacklog',
    'projectionBacklog',
    'agents',
    'content',
    'deployment',
    'backups',
  ])
  return {
    asOf: count(v['asOf']),
    scope: enumeration(v['scope'], ['authorized'] as const),
    complete: boolean(v['complete']),
    components: array(v['components'], (value) => {
      const c = closed(value, ['name', 'state', 'expiresAt'])
      return {
        name: enumeration(c['name'], [
          'certificate',
          'apns',
          'identity_audit',
          'database',
          'broker',
        ] as const),
        state: enumeration(c['state'], ['healthy', 'failed', 'unknown', 'expired'] as const),
        expiresAt: nullable(c['expiresAt'], count),
      }
    }),
    taskBacklog: nullable(v['taskBacklog'], count),
    projectionBacklog: nullable(v['projectionBacklog'], count),
    agents: array(v['agents'], (value) => {
      const a = closed(value, ['device', 'platform', 'version', 'health'])
      return {
        device: identifier(a['device']),
        platform: enumeration(a['platform'], ['windows', 'macos'] as const),
        version: nullable(a['version'], identifier),
        health: enumeration(a['health'], ['healthy', 'failed', 'unknown', 'offline'] as const),
      }
    }),
    content: enumeration(v['content'], ['available', 'backlog', 'failed', 'unknown'] as const),
    deployment: identifier(v['deployment']),
    backups: array(v['backups'], identifier),
  }
}
export function maintenanceInput(value: unknown) {
  const v = closed(value, ['kind', 'target', 'method']),
    kind = enumeration(v['kind'], maintenanceKinds),
    method = enumeration(v['method'], ['full', 'delta'] as const)
  if (kind !== 'agent_upgrade' && method !== 'full') throw new Error('Unsupported update method')
  return { kind, target: identifier(v['target']), method }
}

export function maintenance(value: unknown) {
  const v = closed(value, [
    'id',
    'revision',
    'operation',
    'phase',
    'createdAt',
    'input',
    'effect',
    'components',
    'downloadBytes',
    'rebuild',
    'fallback',
    'health',
  ])
  return {
    id: uuid(v['id']),
    revision: count(v['revision']),
    operation: uuid(v['operation']),
    phase: enumeration(v['phase'], jobPhases),
    createdAt: count(v['createdAt']),
    input: maintenanceInput(v['input']),
    effect: enumeration(v['effect'], ['unverified', 'failed', 'unknown'] as const),
    components: unique(array(v['components'], identifier), (x) => x),
    downloadBytes: nullable(v['downloadBytes'], count),
    rebuild: enumeration(v['rebuild'], [
      'not_applicable',
      'pending',
      'completed',
      'failed',
      'unknown',
    ] as const),
    fallback: nullable(v['fallback'], (value) =>
      enumeration(value, ['no_supported_base', 'baseline_mismatch', 'rebuild_failed'] as const),
    ),
    health: enumeration(v['health'], ['unknown', 'healthy', 'failed'] as const),
  }
}
export type Maintenance = ReturnType<typeof maintenance>
