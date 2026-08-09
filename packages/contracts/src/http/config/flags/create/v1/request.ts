/* eslint-disable */
/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 * Source: gocell/contracts/http/config/flags/create/v1/request.schema.json
 * 由 `pnpm codegen` 派生；CI 经 `git diff --exit-code` 守门只读。
 */

export interface HttpConfigFlagsCreateV1Request {
  key: string;
  enabled?: boolean;
  rolloutPercentage?: number;
  description?: string;
}
