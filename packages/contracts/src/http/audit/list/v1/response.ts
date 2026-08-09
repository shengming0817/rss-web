/* eslint-disable */
/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 * Source: gocell/contracts/http/audit/list/v1/response.schema.json
 * 由 `pnpm codegen` 派生；CI 经 `git diff --exit-code` 守门只读。
 */

export interface HttpAuditListV1Response {
  data: {
    id: string;
    eventId: string;
    eventType: string;
    actorId: string;
    subjectId?: string;
    /**
     * Tenant boundary id the audit row belongs to (epic #1337 PR-12). Surfaced behind the ResourceProjection column-masking funnel: an admin sees the value, lower-privilege/device callers may see it masked per the FieldMask obligation. Empty for tenant-less system rows (scope="system") and for entries predating its introduction.
     */
    tenantId?: string;
    /**
     * Operator-diagnostic column: opaque cross-cell correlation identifier from the originating request context. Visible to admin/tenant-scope callers; value-masked ("<REDACTED>") for non-admin (self) and device callers per the FieldMask obligation (epic #1337 PR-12). Empty for entries predating its introduction.
     */
    correlationId?: string;
    /**
     * Operator-diagnostic column: opaque distributed trace identifier from the originating request context. Visible to admin/tenant-scope callers; value-masked ("<REDACTED>") for non-admin (self) and device callers per the FieldMask obligation (epic #1337 PR-12). Empty for entries predating its introduction.
     */
    traceId?: string;
    occurredAt?: string;
    timestamp: string;
    /**
     * Row classification: "tenant" means the row belongs to a tenant (the owning tenant id is in the tenantId field; for a super-admin cross-tenant read rows from multiple tenants may appear, each with their own tenantId); "system" for tenant-less framework/system rows (e.g. bootstrap.auth.fail) that are surfaced to every tenant. Empty for rows predating its introduction.
     */
    scope?: string;
    payload?: unknown;
  }[];
  nextCursor: string;
  hasMore: boolean;
}
