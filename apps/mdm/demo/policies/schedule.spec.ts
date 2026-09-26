import { expect, it } from 'vitest'
import { validateSchedule, due } from './schedule'
import type { Schedule } from '../../src/features/policies/clients/schedule'
const schedule: Schedule = {
  trigger: { kind: 'manual' },
  misfire: 'skip',
  notBefore: 100,
  until: 1000,
  jitterSeconds: 0,
  window: null,
}
it('uses the published bounded horizon, ISO weekdays and IANA window rules', () => {
  expect(() => validateSchedule(schedule)).not.toThrow()
  for (const change of [
    { until: 100 + 367 * 86400 },
    { trigger: { kind: 'once', at: 1000 } },
    { trigger: { kind: 'interval', anchor: 0, seconds: 59 } },
    { trigger: { kind: 'interval', anchor: 1000, seconds: 60 } },
    { trigger: { kind: 'weekly', zone: 'UTC', weekday: 0, minute: 0 } },
    { trigger: { kind: 'weekly', zone: 'Fake/Zone', weekday: 1, minute: 0 } },
    { window: { zone: 'UTC', weekdays: [1], startMinute: 1200, endMinute: 60 } },
  ])
    expect(() => validateSchedule({ ...schedule, ...change } as Schedule)).toThrow()
})
it('delivers bounded server occurrences once, with misfire, jitter, windows and device events', () => {
  const s: Schedule = {
    ...schedule,
    trigger: { kind: 'interval', anchor: 100, seconds: 60 },
    misfire: 'coalesce_one',
  }
  expect(due(s, 100, 99, { kind: 'clock', at: 299 }, 'plan')).toMatchObject({
    coordinate: 280,
    availableAt: 280,
  })
  expect(due({ ...s, misfire: 'skip' }, 100, 99, { kind: 'clock', at: 339 }, 'plan')).toBeNull()
  expect(due(s, 100, 280, { kind: 'clock', at: 299 }, 'plan')).toBeNull()
  expect(
    due(
      { ...s, trigger: { kind: 'check_in', minimumSeconds: 60 } },
      100,
      250,
      { kind: 'check_in', at: 299, device: 'device-01' },
      'plan',
    ),
  ).toBeNull()
  const jittered = due(
    { ...schedule, jitterSeconds: 60 },
    100,
    99,
    { kind: 'clock', at: 100 },
    'plan',
  )!
  expect(jittered.availableAt).toBeGreaterThanOrEqual(100)
  expect(jittered.availableAt).toBeLessThanOrEqual(160)
  expect(
    due({ ...schedule, jitterSeconds: 60 }, 100, 99, { kind: 'clock', at: 100 }, 'plan'),
  ).toEqual(jittered)
  const start = Date.parse('2026-09-28T00:00:00Z') / 1000
  const windowed: Schedule = {
    ...schedule,
    notBefore: start,
    until: start + 86400,
    window: { zone: 'UTC', weekdays: [1], startMinute: 60, endMinute: 120 },
  }
  expect(due(windowed, start, start - 1, { kind: 'clock', at: start }, 'plan')).toMatchObject({
    availableAt: start + 3600,
    windowEnd: start + 7200,
  })
})
it('skips weekly DST gaps and selects the earlier repeated minute', () => {
  const start = Date.parse('2026-01-01T00:00:00Z') / 1000
  const s: Schedule = {
    ...schedule,
    notBefore: start,
    until: start + 365 * 86400,
    misfire: 'coalesce_one',
    trigger: { kind: 'weekly', zone: 'America/New_York', weekday: 7, minute: 150 },
  }
  const at = (v: string) => Date.parse(v) / 1000
  expect(
    due(
      s,
      start,
      at('2026-03-07T00:00:00Z'),
      { kind: 'clock', at: at('2026-03-08T12:00:00Z') },
      'plan',
    ),
  ).toBeNull()
  s.trigger = { kind: 'weekly', zone: 'America/New_York', weekday: 7, minute: 90 }
  const first = at('2026-11-01T05:30:00Z')
  expect(
    due(
      s,
      start,
      at('2026-10-31T00:00:00Z'),
      { kind: 'clock', at: at('2026-11-01T07:00:00Z') },
      'plan',
    )?.coordinate,
  ).toBe(first)
  expect(due(s, start, first, { kind: 'clock', at: at('2026-11-01T07:00:00Z') }, 'plan')).toBeNull()
})
