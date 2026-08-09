/**
 * timeRange.ts — pure helper to derive a TimeRange from a preset + clock input.
 *
 * Keeps Date.now() out of this module so specs can pass a fixed timestamp.
 */
import type { TimeRange } from '../api/observe'

/** Named time-window presets. */
export type RangePreset = 'm15' | 'h1' | 'h6' | 'h24'

/** Width in seconds for each preset. */
const PRESET_SECONDS: Record<RangePreset, number> = {
  m15: 15 * 60,
  h1: 60 * 60,
  h6: 6 * 60 * 60,
  h24: 24 * 60 * 60,
}

/**
 * Build a TimeRange from a preset and a caller-supplied clock value.
 *
 * @param preset  - Named window width.
 * @param nowMs   - Current time in milliseconds (pass Date.now() at call site).
 * @returns       - { start, end } as unix-seconds strings (floor precision).
 */
export function rangeFromPreset(preset: RangePreset, nowMs: number): TimeRange {
  const endSec = Math.floor(nowMs / 1000)
  const startSec = endSec - PRESET_SECONDS[preset]
  return { start: String(startSec), end: String(endSec) }
}
