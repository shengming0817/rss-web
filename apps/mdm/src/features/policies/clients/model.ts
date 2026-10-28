import * as wireSchemas from '@rss/api/mdm-schemas'
import { checked } from '../../../contracts/collection/check'
import { jsonObject } from '../../../services/json'
import { string } from '../../../services/decode'
import {
  validatePolicyAction,
  validatePolicyDefinition,
  validatePolicyRead,
  validatePolicySchedule,
  validatePolicyExactResourceBinding,
  validatePolicySoftwareResourceBinding,
  validatePolicyParameterSources,
  validatePolicySelfService,
  validatePolicyCredentialOperation,
  validateTaskAdmission,
} from '@rss/api/mdm-validators'
import type { PolicyAction, PolicySchedule } from '@rss/api/mdm-types'

export const targets = [
  'windows_x86_64',
  'windows_aarch64',
  'macos_x86_64',
  'macos_aarch64',
] as const
export const intents = ['required_install', 'available_install', 'explicit_uninstall'] as const
function coordinate(value: string) {
  if (
    !value ||
    value.length > 128 ||
    !/^[A-Za-z0-9._/-]+$/.test(value) ||
    value.split('/').some((s) => !s || s === '.' || s === '..')
  )
    throw new Error('Invalid resource coordinate')
  return value
}
function zone(value: string) {
  if (value !== 'UTC' && (!value.includes('/') || value.length > 128))
    throw new Error('Invalid timezone')
  new Intl.DateTimeFormat('en', { timeZone: value })
}
export function resourceBinding(value: unknown) {
  const v = checked(validatePolicySoftwareResourceBinding, value)
  coordinate(v.id)
  coordinate(v.version)
  if (
    !Object.keys(v.variants).length ||
    Object.keys(v.variants).some((k) => !targets.some((t) => t === k))
  )
    throw new Error('Missing software target')
  Object.values(v.variants).forEach(coordinate)
  return v
}
/** Authoring constraints supplement the generated wire shape. */
export function nativeSchedule(value: unknown): PolicySchedule {
  const schedule = checked(validatePolicySchedule, value)
  const t = schedule.trigger,
    w = schedule.window,
    end = schedule.until ?? Infinity
  if (
    (schedule.until !== null && schedule.until <= schedule.notBefore) ||
    schedule.jitterSeconds > 3600 ||
    schedule.notBefore > 253402300799 ||
    (schedule.until !== null && schedule.until > 253402300799) ||
    (schedule.misfire.kind === 'skip' && schedule.misfire.maxLatenessSeconds > 4294967295)
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
  if (t.kind === 'weekly') {
    zone(t.zone)
    if (t.weekday < 1 || t.weekday > 7 || t.minute >= 1440)
      throw new Error('Invalid weekly occurrence')
  }
  if (w) {
    zone(w.zone)
    if (
      !w.weekdays.length ||
      new Set(w.weekdays).size !== w.weekdays.length ||
      w.weekdays.some((d) => d < 1 || d > 7) ||
      w.startMinute >= 1440 ||
      w.endMinute > 1440 ||
      w.startMinute === w.endMinute
    )
      throw new Error('Invalid maintenance window')
  }
  return schedule
}
export type Schedule = PolicySchedule
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
  const v = checked(validatePolicyExactResourceBinding, value)
  coordinate(v.id)
  coordinate(v.version)
  coordinate(v.variant)
  return v
}
export function parameterSources(value: unknown) {
  const v = checked(validatePolicyParameterSources, value)
  if (Object.keys(v).length > 32) throw new Error('Too many parameters')
  for (const [name, source] of Object.entries(v)) {
    if (!/^[A-Za-z0-9_]{1,64}$/.test(name)) throw new Error('Invalid parameter')
    if (
      source.kind === 'fixed' &&
      ((typeof source.value === 'string' && source.value.includes('\0')) ||
        (typeof source.value === 'number' && !Number.isSafeInteger(source.value)))
    )
      throw new Error('Invalid fixed value')
  }
  return v
}
function text(value: unknown, limit: number, required = false) {
  if (
    typeof value !== 'string' ||
    new TextEncoder().encode(value).byteLength > limit ||
    value.includes('\0') ||
    (required && !value.trim())
  )
    throw new Error('Invalid metadata')
  return value
}
export function selfService(value: unknown) {
  const v = checked(validatePolicySelfService, value),
    p = jsonObject(v.presentation, 65536)
  if (!Array.isArray(p['keywords'])) throw new Error('Invalid keywords')
  const keywords = p['keywords'].map((v) => text(v, 128, true))
  if (
    keywords.length > 32 ||
    keywords.some((k) =>
      Array.from(k).some(
        (c) => c.charCodeAt(0) < 32 || (c.charCodeAt(0) >= 127 && c.charCodeAt(0) <= 159),
      ),
    )
  )
    throw new Error('Invalid keywords')
  if (v.published && v.access === null) throw new Error('Choose a self-service access mode')
  return {
    ...v,
    presentation: {
      ...p,
      displayName: text(p['displayName'], 256, true),
      description: text(p['description'], 4096),
      prerequisites: text(p['prerequisites'], 4096),
      sideEffects: text(p['sideEffects'], 4096),
      category: text(p['category'], 128, true),
      keywords,
    },
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
export function policyName(value: unknown) {
  const name = string(value)
    .trim()
    .replace(/[A-Z]/g, (c) => c.toLowerCase())
  if (!/^[a-z0-9._-]{1,64}$/.test(name)) throw new Error('Invalid policy name')
  return name
}
export function policyAction(value: unknown): PolicyAction {
  const a = checked(validatePolicyAction, value)
  if ('schedule' in a) nativeSchedule(a.schedule)
  if ('runLifetimeSeconds' in a && (a.runLifetimeSeconds < 60 || a.runLifetimeSeconds > 604800))
    throw new Error('Invalid task lifetime')
  if ('resource' in a) {
    if (a.kind === 'software') resourceBinding(a.resource)
    else exactResource(a.resource)
  }
  if (a.kind === 'device_access') {
    if (
      a.windows.kind === 'rss_factor' &&
      (!a.windows.accounts.length ||
        new Set(a.windows.accounts).size !== a.windows.accounts.length ||
        a.windows.accounts.length > 3)
    )
      throw new Error('Invalid Windows accounts')
    const c = a.mac
    if (c) {
      const policies = [c.login, c.unlock, c.filevault],
        enforcing = policies.includes('require')
      if (
        (c.authentication === 'password') !== (c.passwordProvider !== null) ||
        (c.authentication !== 'password' && policies.some((p) => p !== 'local')) ||
        (!enforcing && (c.offlineGraceSeconds !== null || c.registrationGraceSeconds !== null)) ||
        (enforcing && !c.maintenanceAccounts.length) ||
        c.maintenanceAccounts.length > 16 ||
        new Set(c.maintenanceAccounts).size !== c.maintenanceAccounts.length ||
        c.maintenanceAccounts.some((n) => !/^[A-Za-z0-9_-]{1,64}$/.test(n)) ||
        [c.offlineGraceSeconds, c.registrationGraceSeconds].some(
          (n) => n !== null && (!n || n > 4294967295),
        )
      )
        throw new Error('Invalid login configuration')
    }
  }
  if (
    a.kind === 'unmanage_device' &&
    ['registration', 'check_in'].includes(a.schedule.trigger.kind)
  )
    throw new Error('Invalid retirement trigger')
  if (a.kind === 'native_collection' || a.kind === 'agent_collection') {
    if (
      a.schedule.trigger.kind !== 'interval' ||
      a.frequency !== 'every_trigger' ||
      a.schedule.misfire.kind !== 'coalesce_one' ||
      a.schedule.until !== null ||
      a.schedule.window !== null
    )
      throw new Error('Collection requires a recurring interval')
  }
  if (a.kind === 'execution') {
    parameterSources(a.parameters)
    if (
      Object.values(a.parameters).some((p) => p.kind === 'input') &&
      a.schedule.trigger.kind !== 'manual'
    )
      throw new Error('Dynamic inputs require manual invocation')
  }
  if (
    a.kind === 'ensure_agent_installed' &&
    (!Object.keys(a.packages).length ||
      Object.keys(a.packages).some((k) => !targets.some((t) => t === k)))
  )
    throw new Error('Missing Agent release')
  if (a.kind === 'software') {
    const stages = a.rollout.stages
    if (
      !stages.length ||
      stages.length > 32 ||
      new Set(stages.map((s) => s.scope)).size !== stages.length ||
      stages[0]!.minimumVerifiedPercent !== null ||
      stages.some(
        (s, i) =>
          (s.minimumVerifiedPercent !== null && s.minimumVerifiedPercent > 100) ||
          (i > 0 && s.opensAt <= stages[i - 1]!.opensAt),
      )
    )
      throw new Error('Invalid rollout')
  }
  return a
}
export function policyDefinition(value: unknown) {
  const v = checked(validatePolicyDefinition, value),
    action = policyAction(v.action)
  if (
    v.customEvent !== null &&
    action.kind === 'execution' &&
    Object.values(action.parameters).some((p) => p.kind === 'input')
  )
    throw new Error('Custom events require fixed parameters')
  if (
    v.selfService != null &&
    action.kind !== 'execution' &&
    action.kind !== 'request_mdm_enrollment' &&
    !(
      action.kind === 'software' &&
      action.channel === 'agent' &&
      action.intent === 'available_install'
    )
  )
    throw new Error('Self-service requires an eligible action')
  const { selfService: service, ...base } = v
  return {
    ...base,
    alias: v.alias === null ? null : policyName(v.alias),
    customEvent: v.customEvent === null ? null : policyName(v.customEvent),
    action,
    ...(service === undefined
      ? {}
      : { selfService: service === null ? null : selfService(service) }),
  }
}
export type PolicyDefinition = ReturnType<typeof policyDefinition>
export type ExecutionDefinition = PolicyDefinition & {
  action: Extract<PolicyAction, { kind: 'execution' }>
}
export function decodePolicy(value: unknown, id?: string) {
  const v = checked(validatePolicyRead, value)
  if (id !== undefined && v.id !== id) throw new Error('Wrong Policy')
  return { ...v, enabled: v.state === 'enabled', definition: policyDefinition(v.definition) }
}
export type PolicyRead = ReturnType<typeof decodePolicy>
export type PolicyChange =
  | { action: 'put'; definition: PolicyDefinition; enabled: boolean }
  | { action: 'enable' }
  | { action: 'disable' }
  | { action: 'archive' }
export function taskAdmission(value: unknown) {
  return checked(validateTaskAdmission, value)
}
export function eligibility(value: unknown) {
  if (!wireSchemas.postApiV1PoliciesPreviewsResponse.validateScopeAdmission(value))
    throw new Error('Invalid contract value')

  return value.state === 'eligible'
    ? { state: value.state, entry: value.entry }
    : { state: value.state }
}

export type ConfigurationDefinition = PolicyDefinition & {
  action: Extract<PolicyDefinition['action'], { kind: 'configuration' }>
}

export function credentialOperation(value: unknown) {
  return checked(validatePolicyCredentialOperation, value)
}
