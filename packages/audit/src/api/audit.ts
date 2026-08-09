/**
 * audit.ts — audit-query API (auditcore `auditquery` slice).
 *
 * MVP scope: cursor-paginated audit log list (HttpAuditListV1Response).
 * The request schema is not yet codegen-derived (no backend request schema);
 * ListAuditParams is defined locally and annotated for future cutover.
 */
import { http } from '@gocell/request'
import type { HttpAuditListV1Response } from '@gocell/contracts'

/** Collection endpoint for audit entries. */
export const AUDIT_URL = '/api/v1/audit/'

/**
 * A single audit log entry. Derives directly from the codegen-produced
 * response contract so the row type stays schema-bound.
 */
export type AuditEntry = HttpAuditListV1Response['data'][number]

/**
 * Local request params type.
 * Note: the backend has no audit list request schema yet; once codegen
 * derives HttpAuditListV1Request, delete this interface and import it instead.
 */
export interface ListAuditParams {
  cursor?: string
  limit?: number
}

/** GET /audit/ — cursor-paginated audit entry list. */
export async function listAudit(params: ListAuditParams = {}): Promise<HttpAuditListV1Response> {
  const res = await http.get<HttpAuditListV1Response>(AUDIT_URL, { params })
  return res.data
}
