import { createHash } from 'node:crypto'
import type { Schedule } from '../../src/features/policies/clients/schedule'
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
// Demo-only injected events. No timers or browser-owned scheduling authority.
export interface DemoEvent {
  kind: 'clock' | 'registration' | 'check_in'
  at: number
  device?: string
}
export interface Occurrence {
  coordinate: number
  availableAt: number
  windowEnd: number | null
}
function calendar(name: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: name,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
}
function civil(at: number, formatter: Intl.DateTimeFormat) {
  const p = Object.fromEntries(
    formatter.formatToParts(new Date(at * 1000)).map((p) => [p.type, p.value]),
  )
  return {
    date: Date.UTC(Number(p['year']), Number(p['month']) - 1, Number(p['day'])) / 1000,
    minute: Number(p['hour']) * 60 + Number(p['minute']),
  }
}
function local(date: number, minute: number, formatter: Intl.DateTimeFormat): number | null {
  if (minute === 1440) {
    date += 86400
    minute = 0
  }
  const nominal = date + minute * 60
  // Bounded demo conversion using the host IANA database. Search in UTC order:
  // a gap has no match, and a fold chooses its earlier instant, as the backend does.
  for (let at = nominal - 14 * 3600; at <= nominal + 14 * 3600; at += 60) {
    const c = civil(at, formatter)
    if (c.date === date && c.minute === minute) return at
  }
  return null
}
export function due(
  s: Schedule,
  startedAt: number,
  after: number,
  event: DemoEvent,
  identity: string,
): Occurrence | null {
  validateSchedule(s)
  const now = event.at,
    t = s.trigger
  if (now < s.notBefore || now >= s.until || now <= after) return null
  let coordinate: number | null = null
  if (t.kind === 'manual' && event.kind === 'clock') coordinate = startedAt
  else if (t.kind === 'once' && event.kind === 'clock') coordinate = t.at
  else if (t.kind === 'interval' && event.kind === 'clock' && now >= t.anchor)
    coordinate = t.anchor + Math.floor((now - t.anchor) / t.seconds) * t.seconds
  else if (t.kind === 'weekly' && event.kind === 'clock') {
    const formatter = calendar(t.zone),
      today = civil(now, formatter).date
    for (let days = 0; days < 15; days++) {
      const date = today - days * 86400,
        weekday = ((new Date(date * 1000).getUTCDay() + 6) % 7) + 1
      if (weekday !== t.weekday) continue
      const at = local(date, t.minute, formatter)
      if (at !== null && at <= now) {
        coordinate = at
        break
      }
    }
  } else if (t.kind === 'registration' && event.kind === 'registration') coordinate = now
  else if (
    t.kind === 'check_in' &&
    event.kind === 'check_in' &&
    (after < startedAt || now - after >= t.minimumSeconds)
  )
    coordinate = now
  if (coordinate === null || coordinate <= after || coordinate < s.notBefore || coordinate > now)
    return null
  const bytes = Buffer.alloc(8)
  bytes.writeBigInt64BE(BigInt(coordinate))
  const jitter = Number(
    createHash('sha256').update(identity).update(bytes).digest().readBigUInt64BE() %
      BigInt(s.jitterSeconds + 1),
  )
  let availableAt = coordinate + jitter,
    windowEnd: number | null = null
  if (s.window) {
    const w = s.window,
      formatter = calendar(w.zone),
      today = civil(availableAt, formatter).date
    let found = false
    for (let days = 0; days < 15; days++) {
      const date = today + days * 86400,
        weekday = ((new Date(date * 1000).getUTCDay() + 6) % 7) + 1
      if (!w.weekdays.includes(weekday)) continue
      const start = local(date, w.startMinute, formatter),
        end = local(date, w.endMinute, formatter)
      if (start !== null && end !== null && start < end && availableAt < end) {
        availableAt = Math.max(availableAt, start)
        windowEnd = end
        found = true
        break
      }
    }
    if (!found) return null
  }
  if (
    availableAt >= s.until ||
    (['once', 'interval', 'weekly'].includes(t.kind) &&
      s.misfire === 'skip' &&
      availableAt < now - 30)
  )
    return null
  return { coordinate, availableAt, windowEnd }
}
