import { expect, it } from 'vitest'
import { nativeDue } from './schedule'
import type { SoftwarePolicyDefinition } from '../../src/features/software/clients/assignment-model'
const schedule: SoftwarePolicyDefinition['action']['schedule'] = {
  trigger: { kind: 'check_in', minimumSeconds: 60 },
  misfire: { kind: 'coalesce_one' },
  notBefore: 0,
  until: null,
  jitterSeconds: 0,
  window: null,
}
it('uses explicit native lateness and keeps an overnight window on its starting weekday', () => {
  const at = Date.parse('2026-09-29T01:00:00Z') / 1000
  expect(
    nativeDue(
      { ...schedule, window: { zone: 'UTC', weekdays: [1], startMinute: 1320, endMinute: 120 } },
      at,
      'device',
    ),
  ).toEqual({ coordinate: at, availableAt: at, windowEnd: at + 3600 })
  const once = {
    ...schedule,
    trigger: { kind: 'once' as const, at: 100 },
    misfire: { kind: 'skip' as const, maxLatenessSeconds: 10 },
  }
  expect(nativeDue(once, 110, 'device')).not.toBeNull()
  expect(nativeDue(once, 111, 'device')).toBeNull()
  expect(nativeDue({ ...schedule, trigger: { kind: 'manual' } }, at, 'device')).toBeNull()
})
it('moves a closed window occurrence to its next opening and skips DST gaps', () => {
  const at = Date.parse('2026-09-28T20:00:00Z') / 1000
  expect(
    nativeDue(
      { ...schedule, window: { zone: 'UTC', weekdays: [1], startMinute: 1320, endMinute: 120 } },
      at,
      'device',
    ),
  ).toMatchObject({ availableAt: at + 7200, windowEnd: at + 21600 })
  const now = Date.parse('2026-03-08T08:00:00Z') / 1000
  const found = nativeDue(
    { ...schedule, trigger: { kind: 'weekly', zone: 'America/New_York', weekday: 7, minute: 150 } },
    now,
    'device',
  )
  expect(found?.coordinate).toBe(Date.parse('2026-03-01T07:30:00Z') / 1000)
})
