import { jsonValue, jsonObject } from '../../../services/json'
import { selfServiceAccess } from './self-service-access'
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

import { architectures, platforms } from './resources'
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
export function defaultCollectionSchedule(): Schedule {
  return { ...defaultSchedule(), trigger: { kind: 'interval', anchor: 0, seconds: 3600 } }
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
  const v = closed(value, ['access', 'published', 'presentation', 'allowAi', 'riskLevel'])
  const presentation = jsonObject(v['presentation'], 65_536)
  const riskLevel = v['riskLevel']
  if (riskLevel !== 1 && riskLevel !== 2) throw new Error('Invalid risk level')
  const keywords = array(presentation['keywords'], (v) => text(v, 128, true))
  if (
    keywords.length > 32 ||
    keywords.some((k) =>
      Array.from(k).some(
        (c) => c.charCodeAt(0) < 32 || (c.charCodeAt(0) >= 127 && c.charCodeAt(0) <= 159),
      ),
    )
  )
    throw new Error('Invalid keywords')
  const access = nullable(v['access'], selfServiceAccess)
  const published = boolean(v['published'])
  if (published && access === null) throw new Error('Choose a self-service access mode')
  return {
    access,
    published,
    presentation: {
      ...presentation,
      displayName: text(presentation['displayName'], 256, true),
      description: text(presentation['description'], 4096),
      prerequisites: text(presentation['prerequisites'], 4096),
      sideEffects: text(presentation['sideEffects'], 4096),
      category: text(presentation['category'], 128, true),
      keywords,
    },
    allowAi: boolean(v['allowAi']),
    riskLevel: riskLevel as 1 | 2,
  }
}
export type SelfService = ReturnType<typeof selfService>
export function initialSelfService(): SelfService {
  return {
    access: null,
    published: true,
    presentation: {
      displayName: '',
      description: '',
      prerequisites: '',
      sideEffects: '',
      category: '',
      keywords: [],
    },
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
  const v = closed(value, ['kind', 'target'])
  return {
    kind,
    target: coordinate(v['target']),
  }
}
// Current producer: agent-wire/platform_sso.rs::LoginConfiguration.
function loginConfiguration(value: unknown) {
  const v = closed(value, [
    'authentication',
    'passwordProvider',
    'login',
    'unlock',
    'filevault',
    'offlineGraceSeconds',
    'registrationGraceSeconds',
    'maintenanceAccounts',
  ])
  const policy = (v: unknown) => enumeration(v, ['local', 'attempt', 'require'] as const)
  const grace = (v: unknown) => {
    const n = count(v)
    if (!n || n > 4294967295) throw new Error('Invalid grace period')
    return n
  }
  const c = {
    authentication: enumeration(v['authentication'], ['secure_enclave', 'password'] as const),
    passwordProvider: nullable(v['passwordProvider'], uuid),
    login: policy(v['login']),
    unlock: policy(v['unlock']),
    filevault: policy(v['filevault']),
    offlineGraceSeconds: nullable(v['offlineGraceSeconds'], grace),
    registrationGraceSeconds: nullable(v['registrationGraceSeconds'], grace),
    maintenanceAccounts: unique(
      array(v['maintenanceAccounts'], (v) => {
        const name = string(v)
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) throw new Error('Invalid maintenance account')
        return name
      }),
      (v) => v,
    ),
  }
  const policies = [c.login, c.unlock, c.filevault]
  const enforcing = policies.includes('require')
  if (
    (c.authentication === 'password') !== (c.passwordProvider !== null) ||
    (c.authentication !== 'password' && policies.some((p) => p !== 'local')) ||
    (!enforcing && (c.offlineGraceSeconds !== null || c.registrationGraceSeconds !== null)) ||
    (enforcing && !c.maintenanceAccounts.length) ||
    c.maintenanceAccounts.length > 16
  )
    throw new Error('Invalid login configuration')
  return c
}
export function policyName(value: unknown) {
  const name = string(value)
    .trim()
    .replace(/[A-Z]/g, (c) => c.toLowerCase())
  if (!/^[a-z0-9._-]{1,64}$/.test(name)) throw new Error('Invalid policy name')
  return name
}
export function policyAction(value: unknown) {
  const kind = enumeration(record(value)['kind'], [
    'device_access',
    'execution',
    'credential',
    'unmanage_device',
    'native_collection',
    'agent_collection',
    'telemetry_profile',
    'configuration',
    'software',
    'ensure_agent_installed',
    'request_mdm_enrollment',
  ] as const)
  if (kind === 'device_access') {
    const v = closed(value, ['kind', 'mac', 'windows', 'selfEnrollment', 'role'])
    const windows = record(v['windows'])
    const mode = enumeration(windows['kind'], ['disabled', 'rss_factor', 'whfb'] as const)
    closed(windows, mode === 'rss_factor' ? ['kind', 'accounts'] : ['kind'])
    const accounts =
      mode === 'rss_factor'
        ? unique(
            array(windows['accounts'], (v) =>
              enumeration(v, ['local', 'active_directory', 'entra'] as const),
            ),
            (v) => v,
          )
        : undefined
    if (accounts && (!accounts.length || accounts.length > 3))
      throw new Error('Invalid Windows accounts')
    return {
      kind,
      mac: nullable(v['mac'], loginConfiguration),
      windows: mode === 'rss_factor' ? { kind: mode, accounts: accounts! } : { kind: mode },
      selfEnrollment: boolean(v['selfEnrollment']),
      role: nullable(v['role'], (v) => enumeration(v, ['standard', 'administrator'] as const)),
    }
  }
  if (kind === 'unmanage_device') {
    const v = closed(value, ['kind', 'schedule', 'runLifetimeSeconds'])
    const schedule = nativeSchedule(v['schedule'])
    if (['registration', 'check_in'].includes(schedule.trigger.kind))
      throw new Error('Invalid retirement trigger')
    return { kind, schedule, runLifetimeSeconds: lifetime(v['runLifetimeSeconds']) }
  }
  if (kind === 'credential') {
    const v = closed(value, [
      'kind',
      'operation',
      'architecture',
      'schedule',
      'frequency',
      'runLifetimeSeconds',
    ])
    return {
      kind,
      operation: credentialOperation(v['operation']),
      architecture: enumeration(v['architecture'], architectures),
      schedule: nativeSchedule(v['schedule']),
      frequency: enumeration(v['frequency'], [
        'once_per_version',
        'once_per_entry',
        'every_trigger',
      ] as const),
      runLifetimeSeconds: lifetime(v['runLifetimeSeconds']),
    }
  }
  if (kind === 'telemetry_profile') {
    const v = closed(value, ['kind', 'resource'])
    return { kind, resource: exactResource(v['resource']) }
  }
  if (kind === 'configuration') {
    const v = closed(value, ['kind', 'resource', 'exit'])
    return {
      kind,
      resource: exactResource(v['resource']),
      exit: enumeration(v['exit'], ['retain', 'remove'] as const),
    }
  }
  if (kind === 'execution' || kind === 'native_collection' || kind === 'agent_collection') {
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
    if (kind === 'native_collection' || kind === 'agent_collection') {
      if (
        base.schedule.trigger.kind !== 'interval' ||
        base.frequency !== 'every_trigger' ||
        base.schedule.misfire.kind !== 'coalesce_one' ||
        base.schedule.until !== null ||
        base.schedule.window !== null
      )
        throw new Error('Collection requires a recurring interval')
      return { kind, ...base }
    }
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
  if (kind === 'ensure_agent_installed') {
    const v = closed(value, ['kind', 'packages', 'schedule', 'runLifetimeSeconds'])
    const packages = Object.fromEntries(
      Object.entries(record(v['packages'])).map(([target, release]) => [
        enumeration(target, targets),
        uuid(release),
      ]),
    )
    if (!Object.keys(packages).length) throw new Error('Missing Agent release')
    return {
      kind,
      packages,
      schedule: nativeSchedule(v['schedule']),
      runLifetimeSeconds: lifetime(v['runLifetimeSeconds']),
    }
  }
  const v = closed(value, [
    'kind',
    'resource',
    'schedule',
    'runLifetimeSeconds',
    'delivery',
    'intent',
    'rollout',
    'channel',
  ])
  const base = {
    resource: resourceBinding(v['resource']),
    schedule: nativeSchedule(v['schedule']),
    runLifetimeSeconds: lifetime(v['runLifetimeSeconds']),
  }
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
    channel: enumeration(v['channel'], ['agent', 'mdm'] as const),
    delivery: delivery(v['delivery']),
    intent: enumeration(v['intent'], intents),
    rollout: { stages },
  }
}
export function policyDefinition(value: unknown) {
  const v = closed(value, ['customEvent', 'alias', 'scope', 'action'], ['selfService']),
    action = policyAction(v['action']),
    customEvent = nullable(v['customEvent'], policyName)
  if (
    customEvent !== null &&
    action.kind === 'execution' &&
    Object.values(action.parameters).some((p) => p.kind === 'input')
  )
    throw new Error('Custom events require fixed parameters')
  if (
    'selfService' in v &&
    action.kind !== 'execution' &&
    action.kind !== 'request_mdm_enrollment' &&
    !(
      action.kind === 'software' &&
      action.channel === 'agent' &&
      action.intent === 'available_install'
    )
  )
    throw new Error('Self-service requires an eligible action')
  if (
    'selfService' in v &&
    action.kind === 'software' &&
    selfService(v['selfService']).riskLevel !== 2
  )
    throw new Error('Software self-service requires confirmation')
  return {
    customEvent,
    alias: nullable(v['alias'], policyName),
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
  const v = closed(value, ['id', 'revision', 'version', 'versionId', 'state', 'definition']),
    actual = uuid(v['id'])
  if (id !== undefined && actual !== id) throw new Error('Wrong Policy')
  return {
    id: actual,
    revision: count(v['revision']),
    version: count(v['version']),
    versionId: uuid(v['versionId']),
    state: enumeration(v['state'], ['enabled', 'disabled', 'archived'] as const),
    enabled: v['state'] === 'enabled',
    definition: policyDefinition(v['definition']),
  }
}
export type PolicyRead = ReturnType<typeof decodePolicy>
export type PolicyChange =
  | { action: 'put'; definition: PolicyDefinition; enabled: boolean }
  | { action: 'enable' | 'disable' | 'archive' }

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
  'authorization_withdrawn',
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

export function credentialOperation(value: unknown) {
  const kind = enumeration(record(value)['kind'], [
    'rotate_rss_login',
    'verify_rss_login',
    'collect_bitlocker',
    'verify_bitlocker',
    'rotate_bitlocker',
    'rotate_local_administrator',
    'verify_local_administrator',
  ] as const)
  if (kind === 'collect_bitlocker') {
    closed(value, ['kind'])
    return { kind }
  }
  if (kind === 'verify_bitlocker' || kind === 'rotate_bitlocker') {
    const v = closed(value, ['kind', 'volume', 'protector'])
    return { kind, volume: identifier(v['volume']), protector: uuid(v['protector']) }
  }
  if (kind === 'rotate_rss_login' || kind === 'verify_rss_login') {
    const v = closed(value, ['kind', 'binding', 'bindingGeneration', 'sid'])
    const bindingGeneration = count(v['bindingGeneration'])
    if (!bindingGeneration) throw new Error('Invalid binding generation')
    return { kind, binding: uuid(v['binding']), bindingGeneration, sid: identifier(v['sid']) }
  }
  const v = closed(value, ['kind', 'sid'])
  return { kind, sid: identifier(v['sid']) }
}
