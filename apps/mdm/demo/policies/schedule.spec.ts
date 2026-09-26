import { expect, it } from 'vitest'
import { validateSchedule, manualReady } from './schedule'
import type { Schedule } from '../../src/features/policies/clients/scripts'
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
it('does not admit manual work before the horizon or outside a maintenance window', () => {
  expect(manualReady(schedule, 99)).toBe(false)
  expect(manualReady(schedule, 100)).toBe(true)
  expect(manualReady(schedule, 1000)).toBe(false)
  const start = Date.parse('2026-09-28T00:00:00Z') / 1000
  const windowed: Schedule = {
    ...schedule,
    notBefore: start,
    until: start + 86400,
    window: { zone: 'UTC', weekdays: [1], startMinute: 60, endMinute: 120 },
  }
  expect(manualReady(windowed, start + 3600)).toBe(true)
  expect(manualReady(windowed, start + 7200)).toBe(false)
})
