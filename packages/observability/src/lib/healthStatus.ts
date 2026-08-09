/**
 * healthStatus — pure mapping helpers for cell health status display.
 * No HTTP calls, no side effects, no imports.
 */

/** Design-token variant for health status indicators. */
export type HealthVariant = 'ok' | 'warn' | 'err' | 'neutral'

/**
 * Maps a CellHealthStatus string to a design-token variant.
 *
 * healthy   → ok
 * degraded  → warn
 * down      → err
 * starting  → ok   (trending healthy: use the same green as healthy)
 * stopping  → warn
 * (unknown) → neutral
 */
export function statusVariant(status: string): HealthVariant {
  switch (status) {
    case 'healthy':
      return 'ok'
    case 'degraded':
      return 'warn'
    case 'down':
      return 'err'
    case 'starting':
      return 'ok'
    case 'stopping':
      return 'warn'
    default:
      return 'neutral'
  }
}

/** Aggregated counts across a list of cells. */
export interface HealthRollup {
  total: number
  healthy: number
  degraded: number
  down: number
}

/**
 * Counts cells by status bucket.
 * Cells with status other than 'healthy'/'degraded'/'down' are counted
 * in total but not in any named bucket.
 */
export function rollupCells(cells: { status: string }[]): HealthRollup {
  let healthy = 0
  let degraded = 0
  let down = 0

  for (const cell of cells) {
    if (cell.status === 'healthy') healthy++
    else if (cell.status === 'degraded') degraded++
    else if (cell.status === 'down') down++
  }

  return { total: cells.length, healthy, degraded, down }
}
