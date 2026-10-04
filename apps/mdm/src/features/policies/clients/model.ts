import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  record,
  unique,
  uuid,
} from '../../../services/decode'
export const targets = [
  'windows_x86_64',
  'windows_aarch64',
  'macos_x86_64',
  'macos_aarch64',
] as const
export const intents = ['required_install', 'available_install', 'explicit_uninstall'] as const
function coordinate(value: unknown) {
  const v = identifier(value)
  if (
    v.length > 128 ||
    !/^[A-Za-z0-9._/-]+$/.test(v) ||
    v.split('/').some((s) => !s || s === '.' || s === '..')
  )
    throw new Error('Invalid resource coordinate')
  return v
}
function zone(value: unknown) {
  const v = identifier(value)
  if (v !== 'UTC' && (!v.includes('/') || v.length > 128)) throw new Error('Invalid timezone')
  new Intl.DateTimeFormat('en', { timeZone: v })
  return v
}
export function resourceBinding(value: unknown) {
  const v = closed(value, ['kind', 'id', 'version', 'variants'])
  enumeration(v['kind'], ['software'] as const)
  const variants = Object.fromEntries(
    Object.entries(record(v['variants'])).map(([k, v]) => [enumeration(k, targets), coordinate(v)]),
  )
  if (!Object.keys(variants).length) throw new Error('Missing software target')
  return {
    kind: 'software' as const,
    id: coordinate(v['id']),
    version: coordinate(v['version']),
    variants,
  }
}
function trigger(value: unknown) {
  const kind = enumeration(record(value)['kind'], [
    'manual',
    'registration',
    'once',
    'interval',
    'weekly',
    'check_in',
  ] as const)
  if (kind === 'manual' || kind === 'registration') {
    closed(value, ['kind'])
    return { kind }
  }
  if (kind === 'once') {
    const v = closed(value, ['kind', 'at'])
    return { kind, at: count(v['at']) }
  }
  if (kind === 'interval') {
    const v = closed(value, ['kind', 'anchor', 'seconds'])
    return { kind, anchor: count(v['anchor']), seconds: count(v['seconds']) }
  }
  if (kind === 'check_in') {
    const v = closed(value, ['kind', 'minimumSeconds'])
    return { kind, minimumSeconds: count(v['minimumSeconds']) }
  }
  const v = closed(value, ['kind', 'zone', 'weekday', 'minute'])
  return {
    kind,
    zone: zone(v['zone']),
    weekday: count(v['weekday']),
    minute: count(v['minute']),
  }
}
export function nativeSchedule(value: unknown) {
  const v = closed(value, ['trigger', 'misfire', 'notBefore', 'until', 'jitterSeconds', 'window'])
  const m = record(v['misfire']),
    kind = enumeration(m['kind'], ['skip', 'coalesce_one'] as const)
  closed(m, kind === 'skip' ? ['kind', 'maxLatenessSeconds'] : ['kind'])
  const schedule = {
    trigger: trigger(v['trigger']),
    misfire:
      kind === 'skip' ? { kind, maxLatenessSeconds: count(m['maxLatenessSeconds']) } : { kind },
    notBefore: count(v['notBefore']),
    until: nullable(v['until'], count),
    jitterSeconds: count(v['jitterSeconds']),
    window: nullable(v['window'], (value) => {
      const w = closed(value, ['zone', 'weekdays', 'startMinute', 'endMinute'])
      return {
        zone: zone(w['zone']),
        weekdays: unique(array(w['weekdays'], count), (v) => v),
        startMinute: count(w['startMinute']),
        endMinute: count(w['endMinute']),
      }
    }),
  }
  if (
    (schedule.until !== null && schedule.until <= schedule.notBefore) ||
    schedule.jitterSeconds > 3600
  )
    throw new Error('Invalid schedule')
  const t = schedule.trigger,
    w = schedule.window,
    end = schedule.until ?? Infinity
  if (
    schedule.notBefore > 253402300799 ||
    (schedule.until !== null && schedule.until > 253402300799) ||
    (schedule.misfire.kind === 'skip' && schedule.misfire.maxLatenessSeconds! > 4294967295)
  )
    throw new Error('Invalid schedule')
  if (t.kind === 'once' && (t.at < schedule.notBefore || t.at >= end))
    throw new Error('Invalid occurrence')
  if (t.kind === 'check_in' && (t.minimumSeconds < 60 || t.minimumSeconds > 31536000))
    throw new Error('Invalid check-in interval')
  if (t.kind === 'interval') {
    const first =
      t.anchor + Math.max(0, Math.ceil((schedule.notBefore - t.anchor) / t.seconds)) * t.seconds
    if (t.seconds < 60 || t.seconds > 31536000 || first >= end) throw new Error('Invalid interval')
  }
  if (t.kind === 'weekly' && (t.weekday < 1 || t.weekday > 7 || t.minute >= 1440))
    throw new Error('Invalid weekly occurrence')
  if (
    w &&
    (!w.weekdays.length ||
      w.weekdays.some((d) => d < 1 || d > 7) ||
      w.startMinute >= 1440 ||
      w.endMinute > 1440 ||
      w.startMinute === w.endMinute)
  )
    throw new Error('Invalid maintenance window')
  return schedule
}

import { architectures, platforms, jsonValue } from './resources'
export type Schedule = ReturnType<typeof nativeSchedule>
export function defaultSchedule(): Schedule {
  return {
    trigger: { kind: 'manual' },
    misfire: { kind: 'coalesce_one' },
    notBefore: 0,
    until: null,
    jitterSeconds: 0,
    window: null,
  }
}
export function exactResource(value: unknown) {
  const v = closed(value, ['id', 'version', 'platform', 'architecture', 'variant'])
  return {
    id: coordinate(v['id']),
    version: coordinate(v['version']),
    platform: enumeration(v['platform'], platforms),
    architecture: enumeration(v['architecture'], architectures),
    variant: coordinate(v['variant']),
  }
}
export function parameterSources(value: unknown) {
  const v = record(jsonValue(value, 65_536))
  if (Object.keys(v).length > 32) throw new Error('Too many parameters')
  return Object.fromEntries(
    Object.entries(v).map(([name, source]) => {
      if (!/^[A-Za-z0-9_]{1,64}$/.test(name)) throw new Error('Invalid parameter')
      const kind = enumeration(record(source)['kind'], ['fixed', 'input'] as const)
      if (kind === 'input') {
        closed(source, ['kind'])
        return [name, { kind }]
      }
      const s = closed(source, ['kind', 'value']),
        literal = s['value']
      if (
        !(
          typeof literal === 'boolean' ||
          (typeof literal === 'string' && !literal.includes('\0')) ||
          (typeof literal === 'number' && Number.isSafeInteger(literal))
        )
      )
        throw new Error('Invalid fixed value')
      return [name, { kind, value: literal }]
    }),
  ) as Record<string, { kind: 'fixed'; value: string | boolean | number } | { kind: 'input' }>
}
function text(value: unknown, limit: number, required = false) {
  if (typeof value !== 'string') throw new Error('Invalid metadata')
  const s = value
  if (new TextEncoder().encode(s).byteLength > limit || s.includes('\0') || (required && !s.trim()))
    throw new Error('Invalid metadata')
  return s
}
export function selfService(value: unknown) {
  const v = closed(value, [
    'published',
    'displayName',
    'description',
    'prerequisites',
    'sideEffects',
    'category',
    'keywords',
    'allowAi',
    'riskLevel',
  ])
  const riskLevel = v['riskLevel']
  if (riskLevel !== 1 && riskLevel !== 2) throw new Error('Invalid risk level')
  const keywords = array(v['keywords'], (v) => text(v, 128, true))
  if (
    keywords.length > 32 ||
    keywords.some((k) =>
      Array.from(k).some(
        (c) => c.charCodeAt(0) < 32 || (c.charCodeAt(0) >= 127 && c.charCodeAt(0) <= 159),
      ),
    )
  )
    throw new Error('Invalid keywords')
  return {
    published: boolean(v['published']),
    displayName: text(v['displayName'], 256, true),
    description: text(v['description'], 4096),
    prerequisites: text(v['prerequisites'], 4096),
    sideEffects: text(v['sideEffects'], 4096),
    category: text(v['category'], 128, true),
    keywords,
    allowAi: boolean(v['allowAi']),
    riskLevel: riskLevel as 1 | 2,
  }
}
export type SelfService = ReturnType<typeof selfService>
export function initialSelfService(): SelfService {
  return {
    published: true,
    displayName: '',
    description: '',
    prerequisites: '',
    sideEffects: '',
    category: '',
    keywords: [],
    allowAi: true,
    riskLevel: 2,
  }
}
function lifetime(value: unknown) {
  const n = count(value)
  if (n < 60 || n > 604800) throw new Error('Invalid task lifetime')
  return n
}
function delivery(value: unknown) {
  const kind = enumeration(record(value)['kind'], ['direct', 'native'] as const)
  if (kind === 'direct') {
    closed(value, ['kind'])
    return { kind }
  }
  const v = closed(value, ['kind', 'source', 'ring'])
  return {
    kind,
    source: coordinate(v['source']),
    ring: enumeration(v['ring'], ['test', 'pilot', 'production'] as const),
  }
}
export function policyAction(value: unknown) {
  const kind = enumeration(record(value)['kind'], [
    'execution',
    'native_collection',
    'configuration',
    'software',
    'ensure_agent_installed',
    'request_mdm_enrollment',
  ] as const)
  if (kind === 'configuration') {
    const v = closed(value, ['kind', 'resource', 'exit'])
    return {
      kind,
      resource: exactResource(v['resource']),
      exit: enumeration(v['exit'], ['retain', 'remove'] as const),
    }
  }
  if (kind === 'execution' || kind === 'native_collection') {
    const v = closed(value, [
      'kind',
      'resource',
      'schedule',
      'frequency',
      'runLifetimeSeconds',
      ...(kind === 'execution' ? ['parameters'] : []),
    ])
    const base = {
      resource: exactResource(v['resource']),
      schedule: nativeSchedule(v['schedule']),
      frequency: enumeration(v['frequency'], [
        'once_per_version',
        'once_per_entry',
        'every_trigger',
      ] as const),
      runLifetimeSeconds: lifetime(v['runLifetimeSeconds']),
    }
    if (kind === 'native_collection') return { kind, ...base }
    const parameters = parameterSources(v['parameters'])
    if (
      Object.values(parameters).some((p) => p.kind === 'input') &&
      base.schedule.trigger.kind !== 'manual'
    )
      throw new Error('Dynamic inputs require manual invocation')
    return { kind, ...base, parameters }
  }
  if (kind === 'request_mdm_enrollment') {
    const v = closed(value, ['kind', 'organization', 'schedule', 'runLifetimeSeconds'])
    return {
      kind,
      organization: uuid(v['organization']),
      schedule: nativeSchedule(v['schedule']),
      runLifetimeSeconds: lifetime(v['runLifetimeSeconds']),
    }
  }
  const v = closed(value, [
    'kind',
    'resource',
    'admissionOperation',
    'schedule',
    'runLifetimeSeconds',
    ...(kind === 'software' ? ['delivery', 'intent', 'rollout'] : []),
  ])
  const base = {
    resource: resourceBinding(v['resource']),
    admissionOperation: uuid(v['admissionOperation']),
    schedule: nativeSchedule(v['schedule']),
    runLifetimeSeconds: lifetime(v['runLifetimeSeconds']),
  }
  if (kind === 'ensure_agent_installed') return { kind, ...base }
  const r = closed(v['rollout'], ['stages']),
    stages = unique(
      array(r['stages'], (value) => {
        const s = closed(value, ['scope', 'opensAt', 'minimumVerifiedPercent'])
        return {
          scope: uuid(s['scope']),
          opensAt: count(s['opensAt']),
          minimumVerifiedPercent: nullable(s['minimumVerifiedPercent'], count),
        }
      }),
      (s) => s.scope,
    )
  if (
    !stages.length ||
    stages.length > 32 ||
    stages[0]!.minimumVerifiedPercent !== null ||
    stages.some(
      (s, i) =>
        (s.minimumVerifiedPercent !== null && s.minimumVerifiedPercent > 100) ||
        (i > 0 && s.opensAt <= stages[i - 1]!.opensAt),
    )
  )
    throw new Error('Invalid rollout')
  return {
    kind,
    ...base,
    delivery: delivery(v['delivery']),
    intent: enumeration(v['intent'], intents),
    rollout: { stages },
  }
}
export function policyDefinition(value: unknown) {
  const v = closed(value, ['scope', 'action'], ['selfService']),
    action = policyAction(v['action'])
  if ('selfService' in v && action.kind !== 'execution')
    throw new Error('Only scripts support self-service')
  return {
    scope: uuid(v['scope']),
    action,
    ...('selfService' in v ? { selfService: selfService(v['selfService']) } : {}),
  }
}
export type PolicyDefinition = ReturnType<typeof policyDefinition>
export type ExecutionDefinition = PolicyDefinition & {
  action: Extract<PolicyDefinition['action'], { kind: 'execution' }>
}
export function decodePolicy(value: unknown, id?: string) {
  const v = closed(value, ['id', 'revision', 'version', 'versionId', 'enabled', 'definition']),
    actual = uuid(v['id'])
  if (id !== undefined && actual !== id) throw new Error('Wrong Policy')
  return {
    id: actual,
    revision: count(v['revision']),
    version: count(v['version']),
    versionId: uuid(v['versionId']),
    enabled: boolean(v['enabled']),
    definition: policyDefinition(v['definition']),
  }
}
export type PolicyRead = ReturnType<typeof decodePolicy>
export type PolicyChange =
  | { action: 'put'; definition: PolicyDefinition; enabled: boolean }
  | { action: 'enable' | 'disable' }

export const taskStates = [
  'paused',
  'outside_window',
  'outside_scope',
  'scope_pending',
  'outside_stage',
  'scheduled',
  'success_gate',
  'missing_registration',
  'ambiguous_registration',
  'unsupported_capability',
  'missing_variant',
  'approval_withdrawn',
  'permission_withdrawn',
  'channel_unknown',
  'already_satisfied',
  'organization_conflict',
  'missing_native_rights',
  'missing_architecture',
  'eligible',
] as const
export function taskAdmission(value: unknown) {
  const v = closed(value, ['state'], ['stage'])
  return {
    state: enumeration(v['state'], taskStates),
    ...('stage' in v ? { stage: count(v['stage']) } : {}),
  }
}
export function eligibility(value: unknown) {
  const state = enumeration(record(value)['state'], ['eligible', 'pending', 'excluded'] as const)
  const v = closed(value, state === 'eligible' ? ['state', 'entry'] : ['state'])
  return state === 'eligible' ? { state, entry: count(v['entry']) } : { state }
}

export type ConfigurationDefinition = PolicyDefinition & {
  action: Extract<PolicyDefinition['action'], { kind: 'configuration' }>
}
