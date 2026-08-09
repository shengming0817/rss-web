/* eslint-disable */
/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 * Source: gocell/contracts/http/policy/list/v1/response.schema.json
 * 由 `pnpm codegen` 派生；CI 经 `git diff --exit-code` 守门只读。
 */

/**
 * Paginated list of ABAC Policies.
 */
export interface HttpPolicyListV1Response {
  data: Policy[];
  nextCursor: string;
  hasMore: boolean;
}
/**
 * ABAC Policy response object. Deliberately carries no createdAt/updatedAt — the Policy domain uses CAS version for conflict detection, not timestamps.
 */
export interface Policy {
  id: string;
  name: string;
  description?: string;
  /**
   * Monotonically increasing CAS version.
   */
  version: number;
  rules: PolicyRule[];
}
/**
 * A single ABAC rule within a Policy. Referenced by policy create/update request schemas and policy get/list/create/update response schemas.
 */
export interface PolicyRule {
  /**
   * Stable client-assigned rule identifier (scoped to the policy).
   */
  id: string;
  /**
   * Human-readable rule label.
   */
  name: string;
  /**
   * Authorization verdict. Valid values: allow, deny. Deny-overrides: any deny wins over all allows.
   */
  effect: string;
  /**
   * All conditions are AND-combined. Empty or absent means unconditional (rule always applies).
   */
  conditions?: {
    /**
     * Attribute namespace. Valid values: subject (principal claims), resource (protected object attrs), environment (context).
     */
    source: string;
    /**
     * Attribute name within the source namespace (e.g. department, classification, time_of_day).
     */
    key: string;
    /**
     * Comparison applied between the resolved attribute and the right-hand side. Valid values: eq, neq, in, not_in (static: compare against values), eq_attr (cross-attribute: compare against rhsSource/rhsKey instead of values).
     */
    operator: string;
    /**
     * Right-hand side of the comparison for static operators (eq, neq, in, not_in). Must be non-empty when present. Absent for cross-attribute operator eq_attr.
     *
     * @minItems 1
     */
    values?: [string, ...string[]];
    /**
     * Cross-attribute right-hand-side namespace. Set only for operator eq_attr. Valid values: subject, resource, environment.
     */
    rhsSource?: string;
    /**
     * Cross-attribute right-hand-side attribute name. Set only for operator eq_attr.
     */
    rhsKey?: string;
  }[];
  /**
   * Obligations imposed on the PEP when this rule matches. All fields are optional.
   */
  obligations?: {
    /**
     * Row-visibility obligation. Grantable values: self, device, tenant. The value 'all' (cross-tenant) is reserved for the audited super-admin derivation and is rejected with 422 when supplied via policy authoring. Absent means no row-scope constraint.
     */
    rowScope?: string;
    /**
     * Fields the PEP must redact from the response. Absent or empty means no field-mask obligation.
     */
    fieldMask?: string[];
  };
}
