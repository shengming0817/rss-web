import { describe, it, expect } from 'vitest'
import { rangeFromPreset } from './timeRange'
import type { RangePreset } from './timeRange'

/** Fixed epoch for all tests: 2026-06-03T12:00:00.000Z = 1748952000000 ms */
const NOW_MS = 1_748_952_000_000
const NOW_SEC = Math.floor(NOW_MS / 1000) // 1748952000

describe('rangeFromPreset', () => {
  it('returns strings', () => {
    const r = rangeFromPreset('h1', NOW_MS)
    expect(typeof r.start).toBe('string')
    expect(typeof r.end).toBe('string')
  })

  it('end equals floor(nowMs / 1000)', () => {
    const r = rangeFromPreset('h1', NOW_MS)
    expect(r.end).toBe(String(NOW_SEC))
  })

  it('start < end for all presets', () => {
    const presets: RangePreset[] = ['m15', 'h1', 'h6', 'h24']
    for (const p of presets) {
      const r = rangeFromPreset(p, NOW_MS)
      expect(Number(r.start)).toBeLessThan(Number(r.end))
    }
  })

  it('m15 window width is 900 seconds', () => {
    const r = rangeFromPreset('m15', NOW_MS)
    expect(Number(r.end) - Number(r.start)).toBe(900)
  })

  it('h1 window width is 3600 seconds', () => {
    const r = rangeFromPreset('h1', NOW_MS)
    expect(Number(r.end) - Number(r.start)).toBe(3600)
  })

  it('h6 window width is 21600 seconds', () => {
    const r = rangeFromPreset('h6', NOW_MS)
    expect(Number(r.end) - Number(r.start)).toBe(21600)
  })

  it('h24 window width is 86400 seconds', () => {
    const r = rangeFromPreset('h24', NOW_MS)
    expect(Number(r.end) - Number(r.start)).toBe(86400)
  })

  it('floors sub-second precision (nowMs not multiple of 1000)', () => {
    const r = rangeFromPreset('h1', NOW_MS + 750)
    // end must equal floor((NOW_MS + 750) / 1000) = NOW_SEC (no change)
    expect(r.end).toBe(String(NOW_SEC))
  })

  it('start value equals end minus preset seconds (m15)', () => {
    const r = rangeFromPreset('m15', NOW_MS)
    expect(r.start).toBe(String(NOW_SEC - 900))
  })

  it('start value equals end minus preset seconds (h24)', () => {
    const r = rangeFromPreset('h24', NOW_MS)
    expect(r.start).toBe(String(NOW_SEC - 86400))
  })
})
