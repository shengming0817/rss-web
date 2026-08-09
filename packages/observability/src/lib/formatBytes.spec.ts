import { describe, it, expect } from 'vitest'
import { formatMib, formatBytes } from './formatBytes'

describe('formatMib', () => {
  it('formats 0 as "0.0 MB"', () => {
    expect(formatMib(0)).toBe('0.0 MB')
  })

  it('formats integer MiB with one decimal', () => {
    expect(formatMib(87)).toBe('87.0 MB')
  })

  it('formats fractional MiB with one decimal', () => {
    expect(formatMib(87.4)).toBe('87.4 MB')
  })

  it('formats large values', () => {
    expect(formatMib(1024)).toBe('1024.0 MB')
  })

  it('rounds to one decimal place', () => {
    expect(formatMib(87.456)).toBe('87.5 MB')
  })
})

describe('formatBytes', () => {
  it('formats 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('formats negative bytes as 0 B', () => {
    expect(formatBytes(-500)).toBe('0 B')
  })

  it('formats sub-KB values in bytes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('formats exactly 1 KB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
  })

  it('formats KB range', () => {
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('formats exactly 1 MB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
  })

  it('formats MB range', () => {
    expect(formatBytes(91750400)).toBe('87.5 MB')
  })

  it('formats exactly 1 GB', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB')
  })

  it('formats GB range', () => {
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.0 GB')
  })
})
