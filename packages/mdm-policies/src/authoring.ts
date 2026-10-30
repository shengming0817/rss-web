import { identifier, uuid } from '@rss/mdm-inventory'
import type { PolicyDefinition, Schedule } from './model'

function integer(value: number, minimum: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new Error('Invalid numeric policy input')
}
function zone(value: string): void {
  if (value !== 'UTC' && (!value.includes('/') || value.length > 128))
    throw new Error('Invalid timezone')
  new Intl.DateTimeFormat('en', { timeZone: value })
}
/** Validate authored bounds; the browser never computes next admission or execution. */
export function validateSchedule(value: Schedule): void {
  integer(value.notBefore, 0, 253402300799)
  integer(value.jitterSeconds, 0, 3600)
  if (value.until !== null) {
    integer(value.until, value.notBefore + 1, 253402300799)
  }
  const t = value.trigger
  if (t.kind === 'once') integer(t.at, value.notBefore, (value.until ?? 253402300800) - 1)
  if (t.kind === 'interval') {
    integer(t.anchor, 0, 253402300799)
    integer(t.seconds, 60, 31536000)
  }
  if (t.kind === 'check_in') integer(t.minimumSeconds, 60, 31536000)
  if (t.kind === 'weekly') {
    zone(t.zone)
    integer(t.weekday, 1, 7)
    integer(t.minute, 0, 1439)
  }
  if (value.misfire.kind === 'skip') integer(value.misfire.maxLatenessSeconds, 0, 4294967295)
  const w = value.window
  if (w) {
    zone(w.zone)
    if (
      !w.weekdays.length ||
      new Set(w.weekdays).size !== w.weekdays.length ||
      w.startMinute === w.endMinute
    )
      throw new Error('Invalid maintenance window')
    w.weekdays.forEach((day) => integer(day, 1, 7))
    integer(w.startMinute, 0, 1439)
    integer(w.endMinute, 0, 1440)
  }
}
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
function address(value: string | null): void {
  if (value !== null && !/^[a-z0-9._-]{1,64}$/.test(value))
    throw new Error('Invalid policy address')
}
export function validateDefinition(value: PolicyDefinition): void {
  uuid(value.scope)
  address(value.alias)
  address(value.customEvent)
  const action = value.action
  if ('resource' in action) {
    identifier(action.resource.id, 128)
    identifier(action.resource.version, 128)
    if ('variant' in action.resource) identifier(action.resource.variant, 128)
    else {
      const variants = Object.entries(action.resource.variants)
      if (
        !variants.length ||
        variants.some(
          ([target]) =>
            !['windows_x86_64', 'windows_aarch64', 'macos_x86_64', 'macos_aarch64'].includes(
              target,
            ),
        )
      )
        throw new Error('Invalid software variants')
      variants.forEach(([, variant]) => identifier(variant, 128))
    }
  }
  if ('schedule' in action) {
    validateSchedule(action.schedule)
    integer(action.runLifetimeSeconds, 60, 604800)
  }
  if (action.kind === 'execution') {
    if (Object.keys(action.parameters).length > 32) throw new Error('Parameter budget exceeded')
    for (const [key, source] of Object.entries(action.parameters)) {
      if (!/^[A-Za-z0-9_]{1,64}$/.test(key)) throw new Error('Invalid parameter name')
      if (source.kind === 'input' && action.schedule.trigger.kind !== 'manual')
        throw new Error('Call-time input requires a manual trigger')
      if (
        source.kind === 'fixed' &&
        ((typeof source.value === 'number' && !Number.isSafeInteger(source.value)) ||
          (typeof source.value === 'string' && source.value.includes('\0')))
      )
        throw new Error('Invalid fixed parameter')
    }
  }
  if (action.kind === 'software') {
    if (!action.rollout.stages.length || action.rollout.stages.length > 32)
      throw new Error('Invalid rollout stages')
    const scopes = new Set<string>()
    let previous = -1
    for (const [index, stage] of action.rollout.stages.entries()) {
      uuid(stage.scope)
      integer(stage.opensAt, 0, 253402300799)
      if (
        stage.opensAt <= previous ||
        scopes.has(stage.scope) ||
        (index === 0 && stage.minimumVerifiedPercent !== null)
      )
        throw new Error('Invalid rollout stage order')
      if (stage.minimumVerifiedPercent !== null) integer(stage.minimumVerifiedPercent, 0, 100)
      scopes.add(stage.scope)
      previous = stage.opensAt
    }
  }
  const self = value.selfService
  if (self) {
    if (self.published && !self.access) throw new Error('Publication requires explicit access')
    if (self.access?.kind === 'users' && !self.access.selectors.length)
      throw new Error('Empty user access')
    if (
      action.kind !== 'execution' &&
      !(action.kind === 'software' && action.intent === 'available_install')
    )
      throw new Error('Action does not support self service')
    if (action.kind === 'software' && self.riskLevel !== null && self.riskLevel !== 2)
      throw new Error('Software risk must require confirmation')
  }
}
