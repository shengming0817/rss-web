import { describe, it, expect } from 'vitest'
import { statusVariant, rollupCells } from './healthStatus'
import type { HealthVariant } from './healthStatus'

describe('statusVariant', () => {
  it('maps "healthy" to "ok"', () => {
    expect(statusVariant('healthy')).toBe<HealthVariant>('ok')
  })

  it('maps "degraded" to "warn"', () => {
    expect(statusVariant('degraded')).toBe<HealthVariant>('warn')
  })

  it('maps "down" to "err"', () => {
    expect(statusVariant('down')).toBe<HealthVariant>('err')
  })

  it('maps "starting" to "ok" (trending healthy)', () => {
    expect(statusVariant('starting')).toBe<HealthVariant>('ok')
  })

  it('maps "stopping" to "warn"', () => {
    expect(statusVariant('stopping')).toBe<HealthVariant>('warn')
  })

  it('maps unknown status to "neutral"', () => {
    expect(statusVariant('unknown')).toBe<HealthVariant>('neutral')
    expect(statusVariant('')).toBe<HealthVariant>('neutral')
    expect(statusVariant('HEALTHY')).toBe<HealthVariant>('neutral')
    expect(statusVariant('maintenance')).toBe<HealthVariant>('neutral')
  })
})

describe('rollupCells', () => {
  it('returns all-zero rollup for empty array', () => {
    expect(rollupCells([])).toEqual({ total: 0, healthy: 0, degraded: 0, down: 0 })
  })

  it('counts a single healthy cell', () => {
    expect(rollupCells([{ status: 'healthy' }])).toEqual({
      total: 1,
      healthy: 1,
      degraded: 0,
      down: 0,
    })
  })

  it('counts mixed statuses correctly', () => {
    const cells = [
      { status: 'healthy' },
      { status: 'healthy' },
      { status: 'degraded' },
      { status: 'down' },
      { status: 'starting' },
    ]
    expect(rollupCells(cells)).toEqual({ total: 5, healthy: 2, degraded: 1, down: 1 })
  })

  it('includes "starting" and "stopping" in total but not in named buckets', () => {
    const cells = [{ status: 'starting' }, { status: 'stopping' }]
    const rollup = rollupCells(cells)
    expect(rollup.total).toBe(2)
    expect(rollup.healthy).toBe(0)
    expect(rollup.degraded).toBe(0)
    expect(rollup.down).toBe(0)
  })

  it('counts unknown statuses in total only', () => {
    const cells = [{ status: 'maintenance' }, { status: 'healthy' }]
    const rollup = rollupCells(cells)
    expect(rollup.total).toBe(2)
    expect(rollup.healthy).toBe(1)
    expect(rollup.degraded).toBe(0)
    expect(rollup.down).toBe(0)
  })

  it('handles all-down scenario', () => {
    const cells = [{ status: 'down' }, { status: 'down' }, { status: 'down' }]
    expect(rollupCells(cells)).toEqual({ total: 3, healthy: 0, degraded: 0, down: 3 })
  })
})
