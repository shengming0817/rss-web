import { describe, it, expect } from 'vitest'
import { formatUptime } from './formatUptime'

describe('formatUptime', () => {
  it('returns "<1m" for 0 seconds', () => {
    expect(formatUptime(0)).toBe('<1m')
  })

  it('returns "<1m" for negative seconds', () => {
    expect(formatUptime(-100)).toBe('<1m')
  })

  it('returns "<1m" for 59 seconds', () => {
    expect(formatUptime(59)).toBe('<1m')
  })

  it('returns "1m" for exactly 60 seconds', () => {
    expect(formatUptime(60)).toBe('1m')
  })

  it('returns "12m" for 720 seconds', () => {
    expect(formatUptime(720)).toBe('12m')
  })

  it('returns "1h" for exactly 3600 seconds (no trailing 0m)', () => {
    expect(formatUptime(3600)).toBe('1h')
  })

  it('returns "4h 12m" for 4*3600 + 12*60 seconds', () => {
    expect(formatUptime(4 * 3600 + 12 * 60)).toBe('4h 12m')
  })

  it('returns "1d" for exactly 86400 seconds (no trailing 0h)', () => {
    expect(formatUptime(86400)).toBe('1d')
  })

  it('returns "2d 4h" for 2*86400 + 4*3600 seconds', () => {
    expect(formatUptime(2 * 86400 + 4 * 3600)).toBe('2d 4h')
  })

  it('omits minutes when days are present', () => {
    // 1 day + 1 hour + 30 minutes — should show "1d 1h", not "1d 1h 30m"
    expect(formatUptime(86400 + 3600 + 1800)).toBe('1d 1h')
  })

  it('returns "3d" for 3 days exactly', () => {
    expect(formatUptime(3 * 86400)).toBe('3d')
  })

  it('handles fractional seconds by flooring', () => {
    expect(formatUptime(59.9)).toBe('<1m')
    expect(formatUptime(60.5)).toBe('1m')
  })
})
