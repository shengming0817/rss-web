import { createHash } from 'node:crypto'
import { calendar, civil, local } from '../policies/calendar'
import { type SoftwarePolicyDefinition } from '../../src/features/software/clients/assignment-model'
import { nativeSchedule } from '../../src/features/policies/clients/model'
/** Native software admission calls this only from an authenticated synthetic Agent poll. */
export function nativeDue(
  s: SoftwarePolicyDefinition['action']['schedule'],
  now: number,
  device: string,
) {
  nativeSchedule(s)
  const t = s.trigger,
    end = s.until ?? Infinity
  if (now < s.notBefore || now >= end || t.kind === 'manual') return null
  let coordinate: number | null = now
  if (t.kind === 'once') coordinate = t.at
  if (t.kind === 'interval')
    coordinate =
      now < t.anchor ? null : t.anchor + Math.floor((now - t.anchor) / t.seconds) * t.seconds
  if (t.kind === 'weekly') {
    coordinate = null
    const formatter = calendar(t.zone),
      today = civil(now, formatter).date
    for (let days = 0; days < 15; days++) {
      const date = today - days * 86400
      if (((new Date(date * 1000).getUTCDay() + 6) % 7) + 1 !== t.weekday) continue
      const at = local(date, t.minute, formatter)
      if (at !== null && at <= now) {
        coordinate = at
        break
      }
    }
  }
  if (coordinate === null || coordinate < s.notBefore || coordinate > now) return null
  const bytes = Buffer.alloc(8)
  bytes.writeBigInt64BE(BigInt(coordinate))
  const jitter = Number(
    createHash('sha256').update(device).update(bytes).digest().readBigUInt64BE() %
      BigInt(s.jitterSeconds + 1),
  )
  let availableAt = coordinate + jitter,
    windowEnd: number | null = null
  if (s.window) {
    const w = s.window,
      formatter = calendar(w.zone),
      today = civil(availableAt, formatter).date
    let found = false
    for (let days = -1; days < 14; days++) {
      const date = today + days * 86400,
        weekday = ((new Date(date * 1000).getUTCDay() + 6) % 7) + 1
      if (!w.weekdays.includes(weekday)) continue
      const start = local(date, w.startMinute, formatter),
        end = local(date + (w.endMinute < w.startMinute ? 86400 : 0), w.endMinute, formatter)
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
    availableAt >= end ||
    (['once', 'interval', 'weekly'].includes(t.kind) &&
      s.misfire.kind === 'skip' &&
      now - availableAt > s.misfire.maxLatenessSeconds!)
  )
    return null
  return { coordinate, availableAt, windowEnd }
}
