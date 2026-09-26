import {
  array,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  record,
  unique,
} from '../../../services/decode'
export type Trigger =
  | { kind: 'manual' | 'registration' }
  | { kind: 'once'; at: number }
  | { kind: 'interval'; anchor: number; seconds: number }
  | { kind: 'weekly'; zone: string; weekday: number; minute: number }
  | { kind: 'check_in'; minimumSeconds: number }
export interface Schedule {
  trigger: Trigger
  misfire: 'skip' | 'coalesce_one'
  notBefore: number
  until: number
  jitterSeconds: number
  window: null | { zone: string; weekdays: number[]; startMinute: number; endMinute: number }
}
function trigger(value: unknown): Trigger {
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
    zone: identifier(v['zone']),
    weekday: count(v['weekday']),
    minute: count(v['minute']),
  }
}
export function decodeSchedule(value: unknown): Schedule {
  const v = closed(value, ['trigger', 'misfire', 'notBefore', 'until', 'jitterSeconds', 'window'])
  const result: Schedule = {
    trigger: trigger(v['trigger']),
    misfire: enumeration(v['misfire'], ['skip', 'coalesce_one'] as const),
    notBefore: count(v['notBefore']),
    until: count(v['until']),
    jitterSeconds: count(v['jitterSeconds']),
    window: nullable(v['window'], (value) => {
      const w = closed(value, ['zone', 'weekdays', 'startMinute', 'endMinute'])
      return {
        zone: identifier(w['zone']),
        weekdays: unique(array(w['weekdays'], count), (v) => v),
        startMinute: count(w['startMinute']),
        endMinute: count(w['endMinute']),
      }
    }),
  }
  validateSchedule(result)
  return result
}

function invalid(): never {
  throw new Error('Invalid schedule')
}
function zone(name: string) {
  if (name !== 'UTC' && (!name.includes('/') || name.length > 128)) invalid()
  return new Intl.DateTimeFormat('en-GB', { timeZone: name })
}
export function validateSchedule(s: Schedule) {
  if (
    s.notBefore < 0 ||
    s.until <= s.notBefore ||
    s.until - s.notBefore > 366 * 86400 ||
    s.jitterSeconds > 3600
  )
    invalid()
  const t = s.trigger
  if (t.kind === 'once' && (t.at < s.notBefore || t.at >= s.until)) invalid()
  if (t.kind === 'interval') {
    if (t.anchor < 0 || t.seconds < 60 || t.seconds > 31536000) invalid()
    const first =
      t.anchor + Math.max(0, Math.ceil((s.notBefore - t.anchor) / t.seconds)) * t.seconds
    if (first >= s.until) invalid()
  }
  if (t.kind === 'check_in' && (t.minimumSeconds < 60 || t.minimumSeconds > 31536000)) invalid()
  if (t.kind === 'weekly') {
    zone(t.zone)
    if (t.weekday < 1 || t.weekday > 7 || t.minute > 1439) invalid()
  }
  const w = s.window
  if (w) {
    zone(w.zone)
    if (
      !w.weekdays.length ||
      w.weekdays.some((d) => d < 1 || d > 7) ||
      w.startMinute >= w.endMinute ||
      w.endMinute > 1440
    )
      invalid()
  }
}
