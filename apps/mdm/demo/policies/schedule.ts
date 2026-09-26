import type { Schedule } from '../../src/features/policies/clients/scripts'
function invalid(): never {
  throw new Error('Invalid schedule')
}
function zone(name: string) {
  if (name !== 'UTC' && (!name.includes('/') || name.length > 128)) invalid()
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: name,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
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
export function manualReady(s: Schedule, now: number) {
  if (s.trigger.kind !== 'manual' || now < s.notBefore || now >= s.until) return false
  if (!s.window) return true
  const parts = Object.fromEntries(
    zone(s.window.zone)
      .formatToParts(new Date(now * 1000))
      .map((p) => [p.type, p.value]),
  )
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts['weekday']!) + 1
  const minute = Number(parts['hour']) * 60 + Number(parts['minute'])
  return (
    s.window.weekdays.includes(day) && minute >= s.window.startMinute && minute < s.window.endMinute
  )
}
