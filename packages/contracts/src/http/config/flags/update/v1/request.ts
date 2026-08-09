/* eslint-disable */
/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 * Source: gocell/contracts/http/config/flags/update/v1/request.schema.json
 * 由 `pnpm codegen` 派生；CI 经 `git diff --exit-code` 守门只读。
 */

/**
 * Compare-and-swap guard. Must equal the resource's current version; mismatch returns 409 ERR_VERSION_CONFLICT.
 */
export type GoCellCASExpectedVersionGuard = number;

/**
 * PUT = full replacement. All three fields are required so callers cannot implicitly zero-write a field they did not intend to change. Use POST /{key}/toggle for the partial 'just flip enabled' workflow.
 */
export interface HttpConfigFlagsUpdateV1Request {
  enabled: boolean;
  rolloutPercentage: number;
  description: string;
  expectedVersion: GoCellCASExpectedVersionGuard;
}
