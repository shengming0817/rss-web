/**
 * cellAudit.ts — audit entries for the devboard Cell detail Audit tab.
 *
 * Boundary note: @gocell/devboard MUST NOT import @gocell/audit.
 * This client re-calls the same HTTP endpoint directly via @gocell/request
 * with contract types from @gocell/contracts (T505 boundary-clean approach).
 *
 * Backend gap: the /api/v1/audit/ endpoint has no per-cell filter param yet
 * (no `cellId` query param). This client fetches recent entries globally
 * and the Audit tab displays them as "recent activity" with a deep-link to
 * the full /audit page. Once the backend adds per-cell filtering this
 * function should accept a cellId param and pass it through.
 */
import { http } from '@gocell/request'
import type { HttpAuditListV1Response } from '@gocell/contracts'

/** Collection endpoint for audit entries (same as @gocell/audit AUDIT_URL). */
export const CELL_AUDIT_URL = '/api/v1/audit/'

/**
 * A single audit log entry derived from the codegen-produced response
 * contract so the row type stays schema-bound.
 */
export type CellAuditEntry = HttpAuditListV1Response['data'][number]

/** Request params for fetchCellAudit. */
export interface FetchCellAuditParams {
  limit?: number
}

/**
 * GET /api/v1/audit/ — fetch recent audit entries for display in the
 * Cell detail Audit tab (global list, no per-cell filter yet).
 */
export async function fetchCellAudit(
  params: FetchCellAuditParams = {},
): Promise<HttpAuditListV1Response> {
  const res = await http.get<HttpAuditListV1Response>(CELL_AUDIT_URL, { params })
  return res.data
}
