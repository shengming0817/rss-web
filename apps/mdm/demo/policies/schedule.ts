import { calendar, civil, local } from './calendar'
import { validateSchedule } from '../../src/features/policies/clients/schedule'
import { createHash } from 'node:crypto'
import type { Schedule } from '../../src/features/policies/clients/schedule'
// Demo-only injected events. No timers or browser-owned scheduling authority.
export interface DemoEvent {
  kind:
    | 'clock'
    | 'registration'
    | 'check_in'
    | 'software_start'
    | 'software_detect'
    | 'software_reboot'
    | 'software_usage'
    | 'software_request'
    | 'bootstrap_continue'
    | 'bootstrap_detect'
    | 'enrollment_bind'
    | 'agent_binding'
  at: number
  device?: string
  resource?: string
  active?: boolean
  task?: string
  item?: string
  enrollment?: string
}
export interface Occurrence {
  coordinate: number
  availableAt: number
  windowEnd: number | null
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
