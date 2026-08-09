/* eslint-disable */
/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 * Source: gocell/contracts/shared/errors/error-response-v1.schema.json
 * 由 `pnpm codegen` 派生；CI 经 `git diff --exit-code` 守门只读。
 */

/**
 * Canonical envelope produced by pkg/httputil.WriteError and pkg/httputil.WritePublic.
 */
export interface GoCellHTTPErrorResponse {
  error: {
    code: string;
    message: string;
    details: {
      key: string;
      value: string | number | boolean;
    }[];
    requestId?: string;
  };
}
