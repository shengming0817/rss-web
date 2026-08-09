/* eslint-disable */
/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 * Source: gocell/contracts/http/auth/decide/v1/request.schema.json
 * 由 `pnpm codegen` 派生；CI 经 `git diff --exit-code` 守门只读。
 */

export interface HttpAuthDecideV1Request {
  /**
   * The action to check, as a registered permission name (e.g. "audit:read", "user:read"). An unregistered action is rejected with 400. The decision subject is the authenticated caller (JWT) — this request carries no subject.
   */
  action: string;
  /**
   * Optional target resource id forwarded to the PDP for ownership-scoped actions (e.g. the user id for "user:read"). Omit for coarse action checks. NOTE: omitting it is NOT "check self" — an absent resource makes the ownership condition (subject.sub == resource.id) unsatisfiable, so owner-scoped actions evaluate as if querying an unknown resource.
   */
  resource?: string;
}
