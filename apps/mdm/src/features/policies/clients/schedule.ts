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
  return {
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
}
