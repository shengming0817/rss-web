import { describe, it, expect } from 'vitest'
import { classifyActor, groupByDay, formatDayLabel } from './auditClassify'

describe('classifyActor', () => {
  it('classifies sa: prefix as service', () => {
    expect(classifyActor('sa:platform-bot')).toBe('service')
  })

  it('classifies svc prefix as service', () => {
    expect(classifyActor('svc-deployer')).toBe('service')
  })

  it('classifies sb- prefix as sandbox', () => {
    expect(classifyActor('sb-790')).toBe('sandbox')
  })

  it('classifies actorId containing @ as human', () => {
    expect(classifyActor('dario@gocell.dev')).toBe('human')
  })

  it('classifies cell-like names (known cell names ending with core) as cell', () => {
    expect(classifyActor('observecore')).toBe('cell')
  })

  it('classifies auditcore as cell', () => {
    expect(classifyActor('auditcore')).toBe('cell')
  })

  it('returns unknown for unrecognised actors', () => {
    expect(classifyActor('some-random-id')).toBe('unknown')
  })

  it('returns unknown for empty string', () => {
    expect(classifyActor('')).toBe('unknown')
  })
})

describe('groupByDay', () => {
  const makeEntry = (ts: string, id: string) => ({
    id,
    eventId: id,
    eventType: 'test.event',
    actorId: 'actor',
    timestamp: ts,
    occurredAt: ts,
  })

  it('groups entries by local date label', () => {
    // Use dates far apart (noon UTC) so they always land on the same local date
    // regardless of the test runner's timezone offset (±14h max).
    const entries = [
      makeEntry('2026-06-01T12:00:00Z', 'a'),
      makeEntry('2026-06-01T13:00:00Z', 'b'),
      makeEntry('2026-06-10T12:00:00Z', 'c'),
    ]
    const groups = groupByDay(entries)
    expect(groups).toHaveLength(2)
    expect(groups[0]?.entries).toHaveLength(2)
    expect(groups[1]?.entries).toHaveLength(1)
  })

  it('returns empty array for empty input', () => {
    expect(groupByDay([])).toEqual([])
  })

  it('falls back to timestamp when occurredAt is absent', () => {
    const entries = [
      {
        id: 'a',
        eventId: 'a',
        eventType: 'x',
        actorId: 'actor',
        timestamp: '2026-06-01T10:00:00Z',
      },
    ]
    const groups = groupByDay(entries)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.entries).toHaveLength(1)
  })
})

describe('formatDayLabel', () => {
  it('returns kind=date and a non-empty dateLabel for an old date key', () => {
    // Use a date far in the past so it never matches today or yesterday.
    const result = formatDayLabel('2024-01-15')
    expect(result.kind).toBe('date')
    expect(typeof result.dateLabel).toBe('string')
    expect(result.dateLabel.length).toBeGreaterThan(0)
  })

  it('returns kind=today for todays date key', () => {
    const today = new Date()
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const result = formatDayLabel(key)
    expect(result.kind).toBe('today')
  })

  it('returns kind=yesterday for yesterdays date key', () => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const result = formatDayLabel(key)
    expect(result.kind).toBe('yesterday')
  })

  it('returns kind=date and the original key as dateLabel for an invalid date', () => {
    const result = formatDayLabel('not-a-date')
    expect(result.kind).toBe('date')
    expect(result.dateLabel).toBe('not-a-date')
  })
})
