/**
 * Health inventory API used by the retained RSS health foundation.
 *
 * The migration endpoint may be unavailable; callers degrade gracefully.
 */
import { http } from '@gocell/request'

/** Collection endpoint for cell health. */
export const HEALTH_CELLS_URL = '/api/v1/admin/health/cells'

export type CellHealthStatus = 'healthy' | 'degraded' | 'down' | 'starting' | 'stopping'
export type CellType = 'core' | 'edge' | 'support'
export type DurabilityMode = 'Durable' | 'Demo'

export interface SliceHealth {
  name: string
  status: CellHealthStatus
  lastErrorAt: string | null
  lastErrorMessage: string | null
}

export interface CellHealthEntry {
  name: string
  type: CellType
  status: CellHealthStatus
  durability: DurabilityMode
  version: string
  commit: string
  startedAt: string
  uptimeSeconds: number
  lastHealthCheckAt: string
  lastHealthCheckDurationMs: number
  sliceCount: number
  slices: SliceHealth[]
}

export interface HealthSummary {
  totalCells: number
  healthy: number
  degraded: number
  down: number
  lastCheckAt: string
}

export interface HealthCellsResponse {
  summary: HealthSummary
  cells: CellHealthEntry[]
}

/**
 * Lightweight shape guard for HealthCellsResponse.
 * Throws if the top-level required fields are absent, directing the store to
 * 'unavailable' rather than silently rendering empty data.
 *
 * Issue #4 replaces this provisional shape with a selected RSS contract.
 */
function assertHealthShape(data: unknown): asserts data is HealthCellsResponse {
  if (data === null || typeof data !== 'object' || !('summary' in data) || !('cells' in data)) {
    throw new Error('fetchCellHealth: response missing required fields "summary" or "cells"')
  }
}

/** GET /api/v1/admin/health/cells — full cell health snapshot. */
export async function fetchCellHealth(): Promise<HealthCellsResponse> {
  const res = await http.get<unknown>(HEALTH_CELLS_URL)
  assertHealthShape(res.data)
  return res.data
}
