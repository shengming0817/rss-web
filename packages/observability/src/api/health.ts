/**
 * health.ts — cell health API (BR-001 GET /api/v1/admin/health/cells).
 *
 * Backend endpoint not yet implemented; calls 404 until BR-001 is delivered.
 * Callers must degrade gracefully on failure.
 *
 * Local types — backend has no health-cells schema yet; once codegen derives
 * HttpAdminHealthCellsV1Response, delete these interfaces and import from
 * @gocell/contracts instead.
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
 * TODO: replace with codegen-derived Zod schema once
 * HttpAdminHealthCellsV1Response is available in @gocell/contracts.
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
