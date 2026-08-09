/**
 * cellConfig.ts — configuration entries for the devboard Cell detail Configuration tab.
 *
 * Boundary note: @gocell/devboard MUST NOT import @gocell/config.
 * This client re-calls the same HTTP endpoint directly via @gocell/request
 * with contract types from @gocell/contracts (T505 boundary-clean approach).
 *
 * Backend gap: the /api/v1/config/ endpoint has no per-cell filter param yet
 * (no `cellId` query param). This client fetches recent entries globally
 * and the Configuration tab displays them as "recent config entries" with a
 * deep-link to the full /config page. Once the backend adds per-cell filtering
 * this function should accept a cellId param and pass it through.
 *
 * Sensitive entries: value="******" when sensitive=true. The tab renders this
 * as-is and MUST NOT use the redacted placeholder as write input.
 */
import { http } from '@gocell/request'
import type { HttpConfigListV1Response } from '@gocell/contracts'

/** Collection endpoint for config entries (same as @gocell/config CONFIG_URL). */
export const CELL_CONFIG_URL = '/api/v1/config/'

/**
 * A single config entry derived from the codegen-produced response
 * contract so the row type stays schema-bound.
 */
export type CellConfigEntry = HttpConfigListV1Response['data'][number]

/** Request params for fetchCellConfig. */
export interface FetchCellConfigParams {
  limit?: number
}

/**
 * GET /api/v1/config/ — fetch recent config entries for display in the
 * Cell detail Configuration tab (global list, no per-cell filter yet).
 */
export async function fetchCellConfig(
  params: FetchCellConfigParams = {},
): Promise<HttpConfigListV1Response> {
  const res = await http.get<HttpConfigListV1Response>(CELL_CONFIG_URL, { params })
  return res.data
}
