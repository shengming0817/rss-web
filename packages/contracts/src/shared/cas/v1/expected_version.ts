/* eslint-disable */
/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 * Source: gocell/contracts/shared/cas/v1/expected_version.schema.json
 * 由 `pnpm codegen` 派生；CI 经 `git diff --exit-code` 守门只读。
 */

/**
 * Compare-and-swap guard. Must equal the resource's current version; mismatch returns 409 ERR_VERSION_CONFLICT.
 */
export type GoCellCASExpectedVersionGuard = number;
