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
export function softwarePolicyDefinition(value: unknown) {
  const v = closed(value, ['resource', 'scope', 'behavior']),
    b = closed(v['behavior'], [
      'kind',
      'intent',
      'admissionOperation',
      'schedule',
      'runLifetimeSeconds',
      'rollout',
    ])
  enumeration(b['kind'], ['software'] as const)
  const rollout = closed(b['rollout'], ['stages']),
    stages = unique(
      array(rollout['stages'], (value) => {
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
  const runLifetimeSeconds = count(b['runLifetimeSeconds'])
  if (runLifetimeSeconds < 60 || runLifetimeSeconds > 604800)
    throw new Error('Invalid task lifetime')
  return {
    resource: resourceBinding(v['resource']),
    scope: uuid(v['scope']),
    behavior: {
      kind: 'software' as const,
      intent: enumeration(b['intent'], intents),
      admissionOperation: uuid(b['admissionOperation']),
      schedule: nativeSchedule(b['schedule']),
      runLifetimeSeconds,
      rollout: { stages },
    },
  }
}
export type SoftwarePolicyDefinition = ReturnType<typeof softwarePolicyDefinition>
export function softwarePolicy(value: unknown, id?: string) {
  const v = closed(value, ['id', 'revision', 'version', 'versionId', 'enabled', 'definition']),
    actual = uuid(v['id'])
  if (id !== undefined && actual !== id) throw new Error('Wrong software Policy')
  return {
    id: actual,
    revision: count(v['revision']),
    version: count(v['version']),
    versionId: uuid(v['versionId']),
    enabled: boolean(v['enabled']),
    definition: softwarePolicyDefinition(v['definition']),
  }
}
export type SoftwarePolicy = ReturnType<typeof softwarePolicy>
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
